import { aggregate, createMockWorld, rng, type MockWorld } from "@mc/core";
import type { Actions, HistoryRow, Snapshot } from "./types";

/** Beispieldaten im Browser: dieselbe Mock-Welt wie der Mock-Sammler, nur ohne Supabase. */
export class DemoSource {
  private world: MockWorld = createMockWorld();
  private base: Omit<Snapshot, "players" | "containers" | "stock" | "status"> = {
    zones: [
      { id: 1, name: "Hauptbasis", dimension: "minecraft:overworld", center_x: 0, center_z: 0, radius: 400, is_main: true },
      { id: 2, name: "Außenposten Mesa", dimension: "minecraft:overworld", center_x: 900, center_z: -650, radius: 120, is_main: false },
    ],
    projects: [
      { key: "burg", label: "Burg" },
      { key: "hafen", label: "Hafen" },
      { key: "bahnhof", label: "Bahnhof" },
    ],
    goals: [
      { project_key: "burg", item_id: "minecraft:stone_bricks", target: 3000 },
      { project_key: "burg", item_id: "minecraft:glass", target: 800 },
      { project_key: "burg", item_id: "minecraft:oak_log", target: 400 },
      { project_key: "hafen", item_id: "minecraft:oak_log", target: 1000 },
      { project_key: "hafen", item_id: "minecraft:spruce_planks", target: 600 },
    ],
    tasks: [
      { id: 1, project_key: "burg", title: "Steinziegel brennen", assignee: "Max", status: "in_progress", position: 0 },
      { id: 2, project_key: "burg", title: "Fundament abstecken", assignee: "Vale", status: "done", position: 0 },
      { id: 3, project_key: "burg", title: "Glas schmelzen", assignee: null, status: "todo", position: 0 },
      { id: 4, project_key: "hafen", title: "Fichten fällen", assignee: "Lena", status: "todo", position: 0 },
      { id: 5, project_key: "hafen", title: "Steg Variante 1", assignee: "Jonas", status: "cancelled", position: 0 },
    ],
    scans: [],
  };
  private nextId = 100;
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
  private emit() {
    for (const fn of this.listeners) fn();
  }

  snapshot(): Snapshot {
    const { players, containers } = this.world;
    const result = aggregate(players, containers);
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
    addProject: async (label) => {
      const key = label.trim().toLowerCase();
      if (!this.base.projects.some((p) => p.key === key)) this.base.projects.push({ key, label: label.trim() });
      this.emit();
      return key;
    },
    setGoals: async (projectKey, goals, mode) => {
      if (mode === "replace") this.base.goals = this.base.goals.filter((g) => g.project_key !== projectKey);
      for (const g of goals) {
        const existing = this.base.goals.find((x) => x.project_key === projectKey && x.item_id === g.item_id);
        if (existing) existing.target = mode === "add" ? existing.target + g.target : g.target;
        else this.base.goals.push({ project_key: projectKey, ...g });
      }
      this.emit();
    },
    removeGoal: async (projectKey, itemId) => {
      this.base.goals = this.base.goals.filter((g) => !(g.project_key === projectKey && g.item_id === itemId));
      this.emit();
    },
    addTask: async (t) => {
      this.base.tasks.push({ ...t, id: this.nextId++, position: this.base.tasks.length });
      this.emit();
    },
    updateTask: async (id, patch) => {
      const t = this.base.tasks.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
      this.emit();
    },
    removeTask: async (id) => {
      this.base.tasks = this.base.tasks.filter((t) => t.id !== id);
      this.emit();
    },
    loadHistory: async (itemId, days) => {
      // Rückwärts gerechneter Zufallsverlauf, der beim heutigen Stand endet
      const now = this.snapshot().stock.filter((r) => r.item_id === itemId).reduce((n, r) => n + r.count, 0);
      const r = rng(itemId.length * 97 + days);
      const rows: HistoryRow[] = [];
      let value = now;
      for (let d = 0; d < days * 4; d++) {
        const t = new Date(Date.now() - d * 6 * 3600_000);
        rows.unshift({ taken_at: t.toISOString(), owner_type: "common", owner_key: "allgemein", item_id: itemId, count: Math.max(Math.round(value), 0) });
        value -= (r() - 0.35) * Math.max(now, 50) * 0.04;
      }
      return rows;
    },
  };
}
