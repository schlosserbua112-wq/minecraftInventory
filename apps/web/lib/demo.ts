import { aggregate, createMockWorld, type MockWorld } from "@mc/core";
import type { Actions, Project, Snapshot } from "./types";

/** Beispieldaten im Browser: dieselbe Mock-Welt wie der Mock-Sammler, nur ohne Supabase. */
export class DemoSource {
  private world: MockWorld = createMockWorld();
  private base: Omit<Snapshot, "players" | "containers" | "stock" | "status" | "showUnnamed" | "hidden"> = {
    landmarks: [
      { id: 1, name: "Spawn", color: "#e9c46a", x: 12, z: -40, created_by: "demo" },
      { id: 2, name: "Dorf am See", color: "#7fb3e6", x: -310, z: 220, created_by: "demo" },
      { id: 3, name: "Netherportal", color: "#b48ce0", x: 180, z: 95, created_by: "demo-lena" },
    ],
    zones: [
      { id: 1, name: "Hauptbasis", dimension: "minecraft:overworld", center_x: 0, center_z: 0, radius: 400, is_main: true },
      { id: 2, name: "Außenposten Mesa", dimension: "minecraft:overworld", center_x: 900, center_z: -650, radius: 120, is_main: false },
    ],
    scans: [],
  };
  private projects: Project[] = [
    {
      id: 1,
      name: "Burg am Hang",
      created_by: "demo",
      items: [
        { item_id: "minecraft:stone_bricks", quantity: 2000 },
        { item_id: "minecraft:spruce_planks", quantity: 640 },
        { item_id: "minecraft:glass", quantity: 256 },
        { item_id: "minecraft:iron_bars", quantity: 96 },
      ],
      containers: [],
      owners: [],
    },
  ];
  private projectListeners = new Set<() => void>();
  private nextId = 100;
  private showUnnamed = true;
  /** „Meine“-Markierungen im Demo-Modus, Kisten-ID → Kontoname */
  private claims = new Map<string, string>();
  private hidden = new Set<string>();
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private lastTick = new Date().toISOString();
  /** Zuletzt online, für Offline-Spieler einige Stunden zurück */
  private seen = new Map(this.world.players.map((p, i) => [p.uuid, new Date(Date.now() - (i + 1) * 3.7 * 3600_000).toISOString()]));

  start(intervalMs = 15_000) {
    this.timer = setInterval(() => {
      this.world.tick();
      this.lastTick = new Date().toISOString();
      this.emit();
    }, intervalMs);
  }
  stop() {
    clearInterval(this.timer);
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private editProject(id: number, fn: (p: Project) => void) {
    const p = this.projects.find((x) => x.id === id);
    if (p) fn(p);
    this.projectsChanged();
  }
  private projectsChanged() {
    for (const fn of this.projectListeners) fn();
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  snapshot(): Snapshot {
    const { players } = this.world;
    const containers = this.world.containers.filter((c) => c.customName || !this.hidden.has(c.id));
    const result = aggregate(players, containers, this.showUnnamed ? "unassigned" : "ignore", new Map(), this.claims);
    return {
      ...structuredClone(this.base),
      players: players.map((p) => {
        if (p.online) this.seen.set(p.uuid, this.lastTick);
        return { uuid: p.uuid, name: p.name, online: p.online, last_seen: this.seen.get(p.uuid) ?? null };
      }),
      containers: containers
        .filter((c) => result.owners.has(c.id))
        .map((c) => {
          const o = result.owners.get(c.id)!;
          return {
            id: c.id, dimension: c.dimension, x: c.x, y: c.y, z: c.z, kind: c.kind, custom_name: c.customName,
            owner_type: o.type, owner_key: o.key, owner_label: o.label,
          };
        }),
      stock: result.rows,
      status: { heartbeat_at: this.lastTick, mode: "demo", message: null },
      showUnnamed: this.showUnnamed,
      hidden: [...this.hidden],
    };
  }

  actions: Actions = {
    requestScan: async () => {
      const id = this.nextId++;
      this.base.scans.unshift({ id, requested_at: new Date().toISOString(), finished_at: null, result: null });
      this.emit();
      setTimeout(() => {
        const s = this.base.scans.find((x) => x.id === id);
        if (s) Object.assign(s, { finished_at: new Date().toISOString(), result: "Demo: keine neuen Kisten gefunden" });
        this.emit();
      }, 2500);
    },
    addZone: async (z) => {
      this.base.zones.push({ ...z, id: this.nextId++ });
      this.emit();
    },
    removeZone: async (id) => {
      this.base.zones = this.base.zones.filter((z) => z.id !== id);
      this.emit();
    },
    addLandmark: async (l) => {
      this.base.landmarks.push({ ...l, id: this.nextId++, created_by: "demo" });
      this.emit();
    },
    updateLandmark: async (id, l) => {
      this.base.landmarks = this.base.landmarks.map((x) => (x.id === id ? { ...x, ...l } : x));
      this.emit();
    },
    removeLandmark: async (id) => {
      this.base.landmarks = this.base.landmarks.filter((x) => x.id !== id);
      this.emit();
    },
    listProjects: async () => structuredClone(this.projects),
    subscribeProjects: (fn) => {
      this.projectListeners.add(fn);
      return () => this.projectListeners.delete(fn);
    },
    createProject: async (name) => {
      const id = this.nextId++;
      this.projects.push({ id, name, created_by: "demo", items: [], containers: [], owners: [] });
      this.projectsChanged();
      return id;
    },
    renameProject: async (id, name) => this.editProject(id, (p) => (p.name = name)),
    deleteProject: async (id) => {
      this.projects = this.projects.filter((p) => p.id !== id);
      this.projectsChanged();
    },
    setProjectItem: async (id, itemId, quantity) =>
      this.editProject(id, (p) => {
        const i = p.items.findIndex((x) => x.item_id === itemId);
        if (quantity <= 0) p.items = p.items.filter((x) => x.item_id !== itemId);
        else if (i >= 0) p.items[i] = { item_id: itemId, quantity };
        else p.items.push({ item_id: itemId, quantity });
      }),
    setProjectSource: async (id, source, on) =>
      this.editProject(id, (p) => {
        const [key, value] = "container" in source ? (["containers", source.container] as const) : (["owners", source.owner] as const);
        p[key] = p[key].filter((x) => x !== value);
        if (on) p[key].push(value);
      }),
    claimContainer: async (id, mine) => {
      if (mine) this.claims.set(id, "Demo");
      else this.claims.delete(id);
      this.emit();
    },
    hideContainer: async (id, hidden) => {
      if (hidden) this.hidden.add(id);
      else this.hidden.delete(id);
      this.emit();
    },
    setShowUnnamed: async (on) => {
      this.showUnnamed = on;
      this.emit();
    },
  };
}
