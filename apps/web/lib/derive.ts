import type { OwnerType, StockRow } from "@mc/core";
import type { ContainerRow, PlayerRow, Snapshot } from "./types";

export const OWNER_COLOR: Record<OwnerType, string> = {
  common: "var(--own-common)",
  player: "var(--own-player)",
  project: "var(--own-project)",
  unassigned: "var(--own-unassigned)",
};

export const OWNER_LABEL: Record<OwnerType, string> = {
  common: "Allgemein",
  player: "Spieler",
  project: "Projekte",
  unassigned: "Nicht zugeordnet",
};

export const SOURCE_LABEL = { inventory: "Inventar", enderchest: "Enderkiste", container: "Kiste" } as const;

const KIND_LABEL: Record<string, string> = { chest: "Kiste", trapped_chest: "Redstone-Kiste", barrel: "Fass", shulker_box: "Shulkerkiste" };
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

/** Summen je Item für die gefilterten Zeilen, absteigend. */
export function totals(rows: StockRow[]): { item_id: string; count: number; places: number }[] {
  const m = new Map<string, { item_id: string; count: number; sources: Set<string> }>();
  for (const r of rows) {
    const e = m.get(r.item_id) ?? { item_id: r.item_id, count: 0, sources: new Set<string>() };
    e.count += r.count;
    e.sources.add(`${r.source_kind}:${r.source_id}`);
    m.set(r.item_id, e);
  }
  return [...m.values()].map((e) => ({ item_id: e.item_id, count: e.count, places: e.sources.size })).sort((a, b) => b.count - a.count);
}

export function sumOf(rows: StockRow[], itemId: string) {
  return rows.reduce((n, r) => (r.item_id === itemId ? n + r.count : n), 0);
}

export interface Location {
  row: StockRow;
  container?: ContainerRow;
  player?: PlayerRow;
}

/** Fundorte eines Items, größte zuerst. */
export function locations(s: Snapshot, itemId: string): Location[] {
  const byId = new Map(s.containers.map((c) => [c.id, c]));
  const byUuid = new Map(s.players.map((p) => [p.uuid, p]));
  return s.stock
    .filter((r) => r.item_id === itemId)
    .map((row) => ({
      row,
      container: row.source_kind === "container" ? byId.get(row.source_id) : undefined,
      player: row.source_kind !== "container" ? byUuid.get(row.source_id) : undefined,
    }))
    .sort((a, b) => b.row.count - a.row.count);
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "nie";
  const s = Math.max(Math.round((now - Date.parse(iso)) / 1000), 0);
  if (s < 60) return `vor ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h} h`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export const coords = (c: { x: number; y: number; z: number }) => `${c.x} / ${c.y} / ${c.z}`;
