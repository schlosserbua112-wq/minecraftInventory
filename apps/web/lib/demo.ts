import { aggregate, COMMON_CLAIM, createMockWorld, rng, summarizeStats, type MockWorld } from "@mc/core";
import type { Actions, PlayerStatsRow, Project, Snapshot, TakeRow } from "./types";

/** Beispieldaten im Browser: dieselbe Mock-Welt wie der Mock-Sammler, nur ohne Supabase. */
export class DemoSource {
  private world: MockWorld = createMockWorld();
  private base: Omit<Snapshot, "players" | "containers" | "stock" | "status" | "hidden" | "labels"> = {
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
  private takes: TakeRow[] = [
    { id: 1, taken_at: new Date(Date.now() - 12 * 60_000).toISOString(), container_id: "minecraft:overworld:14:64:-22", owner_key: "demo", owner_label: "Demo", item_id: "minecraft:diamond", count: 6, suspects: ["Lena"], confidence: "sicher", distance: 2 },
    { id: 2, taken_at: new Date(Date.now() - 3 * 3600_000).toISOString(), container_id: "minecraft:overworld:14:64:-22", owner_key: "demo", owner_label: "Demo", item_id: "minecraft:iron_ingot", count: 32, suspects: ["Max", "Lena"], confidence: "wahrscheinlich", distance: 19 },
    { id: 3, taken_at: new Date(Date.now() - 26 * 3600_000).toISOString(), container_id: "minecraft:overworld:-40:70:105", owner_key: "demo", owner_label: "Demo", item_id: "minecraft:golden_apple", count: 1, suspects: ["Max"], confidence: "möglich", distance: 4 },
  ];
  private takeListeners = new Set<() => void>();
  private projectListeners = new Set<() => void>();
  private nextId = 100;
  /** „Meine“-Markierungen im Demo-Modus, Kisten-ID → Kontoname */
  private claims = new Map<string, string>();
  private hidden = new Set<string>();
  private labels = new Map<string, string>();
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
    const result = aggregate(players, containers, "unassigned", new Map(), this.claims);
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
      hidden: [...this.hidden],
      labels: Object.fromEntries(this.labels),
    };
  }

  actions: Actions = {
    requestScan: async (kind = "scan") => {
      const id = this.nextId++;
      this.base.scans.unshift({ id, requested_at: new Date().toISOString(), finished_at: null, result: null, kind });
      this.emit();
      setTimeout(() => {
        const s = this.base.scans.find((x) => x.id === id);
        if (s) Object.assign(s, { finished_at: new Date().toISOString(), result: kind === "map" ? "Demo: Karte neu gezeichnet" : "Demo: keine neuen Kisten gefunden" });
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
    claimCommon: async (id) => {
      this.claims.set(id, COMMON_CLAIM);
      this.emit();
    },
    hideContainer: async (id, hidden) => {
      if (hidden) this.hidden.add(id);
      else this.hidden.delete(id);
      this.emit();
    },
    renameContainer: async (id, label) => {
      const clean = label.replace(/\s+/g, " ").trim();
      if (clean) this.labels.set(id, clean.slice(0, 60));
      else this.labels.delete(id);
      this.emit();
    },
    listTakes: async () => structuredClone(this.takes),
    subscribeTakes: (fn) => {
      this.takeListeners.add(fn);
      return () => this.takeListeners.delete(fn);
    },
    deleteTake: async (id) => {
      this.takes = this.takes.filter((t) => t.id !== id);
      for (const fn of this.takeListeners) fn();
    },
    listStats: async () => demoStats(this.world.players),
    subscribeStats: () => () => {},
  };
}

/** Ausgedachte Stats-Dateien für die Mock-Spieler, je Name immer gleich. */
function demoStats(players: { uuid: string; name: string }[]): PlayerStatsRow[] {
  const updated_at = new Date(Date.now() - 7 * 60_000).toISOString();
  return players.map((p, i) => {
    const r = rng(1000 + i);
    const hours = 4 + r() * 120;
    const n = (scale: number) => Math.round(r() * scale * hours);
    const pick = (ids: string[], scale: number) => Object.fromEntries(ids.map((id) => [`minecraft:${id}`, n(scale)]));
    const raw = {
      stats: {
        "minecraft:custom": {
          "minecraft:play_time": Math.round(hours * 72_000),
          "minecraft:deaths": n(0.6),
          "minecraft:mob_kills": n(12),
          "minecraft:player_kills": n(0.05),
          "minecraft:jump": n(900),
          "minecraft:damage_dealt": n(2500),
          "minecraft:damage_taken": n(1200),
          "minecraft:fish_caught": n(0.8),
          "minecraft:animals_bred": n(1.5),
          "minecraft:traded_with_villager": n(2),
          "minecraft:enchant_item": n(0.4),
          "minecraft:sleep_in_bed": n(0.5),
          "minecraft:open_chest": n(40),
          "minecraft:time_since_death": n(20_000),
          "minecraft:walk_one_cm": n(180_000),
          "minecraft:sprint_one_cm": n(140_000),
          "minecraft:swim_one_cm": n(12_000),
          "minecraft:aviate_one_cm": n(160_000),
          "minecraft:boat_one_cm": n(30_000),
          "minecraft:horse_one_cm": n(15_000),
          "minecraft:fall_one_cm": n(9_000),
        },
        "minecraft:mined": pick(["stone", "deepslate", "dirt", "oak_log", "coal_ore", "iron_ore", "diamond_ore", "sand", "netherrack", "spruce_log", "gravel"], 120),
        "minecraft:crafted": pick(["oak_planks", "torch", "stone_bricks", "chest", "iron_pickaxe", "bread", "glass_pane"], 20),
        "minecraft:used": pick(["stone_bricks", "torch", "cobblestone", "spruce_planks", "diamond_pickaxe", "bread", "glass"], 60),
        "minecraft:broken": pick(["iron_pickaxe", "diamond_pickaxe", "stone_axe"], 0.05),
        "minecraft:picked_up": pick(["cobblestone", "dirt", "coal", "raw_iron"], 80),
        "minecraft:killed": pick(["zombie", "skeleton", "creeper", "spider", "enderman", "cow", "chicken", "drowned"], 2),
        "minecraft:killed_by": pick(["creeper", "skeleton", "zombie"], 0.15),
      },
    };
    return { uuid: p.uuid, name: p.name, stats: summarizeStats(raw)!, updated_at };
  });
}
