import type { StockRow } from "./types.js";

/** Position eines Online-Spielers bei einer Abfrage. */
export interface PlayerPos {
  uuid: string;
  name: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

export interface ContainerPos {
  id: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Wie sicher die Zuordnung ist:
 * - sicher: Spieler stand an der Kiste und hat genau dieses Item dazubekommen
 * - wahrscheinlich: Item dazubekommen und in Reichweite, aber nicht direkt an der Kiste gesehen (oder der Besitzer war auch da)
 * - möglich: Item ist weg, niemand hat es dazubekommen, aber ein fremder Spieler stand an der Kiste
 */
export type TakeConfidence = "sicher" | "wahrscheinlich" | "möglich";

/** Eine Entnahme aus einer Spielerkiste durch jemand anderen als den Besitzer. */
export interface TakeEvent {
  container_id: string;
  owner_key: string;
  owner_label: string;
  item_id: string;
  count: number;
  /** Verdächtige, wahrscheinlichster zuerst (Minecraft-Namen). */
  suspects: string[];
  confidence: TakeConfidence;
  /** Kleinster Abstand des ersten Verdächtigen zur Kiste in Blöcken, gerundet. */
  distance: number;
}

/** Stand einer Abfrage, den `detectTakes` mit der nächsten vergleicht. */
export interface TakeFrame {
  rows: StockRow[];
  /** Kisten, die in dieser Abfrage live gelesen wurden. Nur deren Änderungen zählen. */
  containers: ContainerPos[];
  /** Positionen der Online-Spieler; fehlt ein Spieler, ist er nicht online oder die Position unbekannt. */
  positions: PlayerPos[];
}

export interface TakeOptions {
  /** Abstand in Blöcken, ab dem jemand „an der Kiste“ stand. */
  nearBlocks?: number;
  /** Weitester Abstand, aus dem jemand die Kiste seit der letzten Abfrage erreicht haben kann. */
  reachBlocks?: number;
  /** Name/Alias klein geschrieben → Kontoname, um den Besitzer unter seinen Spielern zu erkennen. */
  owners?: ReadonlyMap<string, string>;
}

/** Abstand eines Punkts zur Strecke a→b (Weg des Spielers zwischen zwei Abfragen). */
function segmentDistance(p: ContainerPos, a: PlayerPos, b: PlayerPos): number {
  const c = { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = d.x * d.x + d.y * d.y + d.z * d.z;
  const t = len ? Math.min(Math.max(((c.x - a.x) * d.x + (c.y - a.y) * d.y + (c.z - a.z) * d.z) / len, 0), 1) : 0;
  return Math.hypot(a.x + t * d.x - c.x, a.y + t * d.y - c.y, a.z + t * d.z - c.z);
}

/** Inventar und Enderkiste je Spieler zusammen, uuid → item → Anzahl. */
function playerCounts(rows: StockRow[]) {
  const m = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.source_kind === "container") continue;
    const items = m.get(r.source_id) ?? new Map<string, number>();
    items.set(r.item_id, (items.get(r.item_id) ?? 0) + r.count);
    m.set(r.source_id, items);
  }
  return m;
}

/**
 * Vergleicht zwei Abfragen und meldet, was aus Spielerkisten verschwunden ist und wer es genommen hat.
 * Vanilla protokolliert keine Kistenzugriffe, deshalb ist das eine Schätzung aus Inhalt, Inventaren
 * und Positionen. Entnahmen durch den Besitzer selbst und solche ohne fremden Spieler in der Nähe
 * (Trichter, Redstone) werden nicht gemeldet.
 */
export function detectTakes(prev: TakeFrame, next: TakeFrame, opts: TakeOptions = {}): TakeEvent[] {
  const near = opts.nearBlocks ?? 8;
  const reach = opts.reachBlocks ?? 64;
  const owners = opts.owners ?? new Map<string, string>();
  const accountOf = (name: string) => (owners.get(name.toLowerCase()) ?? name).toLowerCase();

  const live = new Map(next.containers.map((c) => [c.id, c]));
  const wasLive = new Set(prev.containers.map((c) => c.id));
  const nextCount = new Map<string, number>();
  for (const r of next.rows) if (r.source_kind === "container") nextCount.set(`${r.source_id}|${r.item_id}`, r.count);

  const before = playerCounts(prev.rows);
  const after = playerCounts(next.rows);
  const prevPos = new Map(prev.positions.map((p) => [p.uuid, p]));
  // Nur Spieler, deren Position in beiden Abfragen bekannt ist
  const moves = next.positions.flatMap((p) => {
    const a = prevPos.get(p.uuid);
    return a && a.dimension === p.dimension ? [{ from: a, to: p }] : [];
  });

  const ownerNow = new Map<string, string>();
  for (const r of next.rows) if (r.source_kind === "container") ownerNow.set(r.source_id, `${r.owner_type}|${r.owner_key}`);

  const events: TakeEvent[] = [];
  for (const r of prev.rows) {
    if (r.source_kind !== "container" || r.owner_type !== "player") continue;
    const chest = live.get(r.source_id);
    if (!chest || !wasLive.has(r.source_id)) continue;
    // Besitzer gewechselt (umbenannt, „Nicht meine“): kein Diebstahl
    const now = ownerNow.get(r.source_id);
    if (now && now !== `player|${r.owner_key}`) continue;
    const lost = r.count - (nextCount.get(`${r.source_id}|${r.item_id}`) ?? 0);
    if (lost <= 0) continue;

    const people = moves
      .filter((m) => m.to.dimension === chest.dimension)
      .map((m) => {
        const gained = (after.get(m.to.uuid)?.get(r.item_id) ?? 0) - (before.get(m.to.uuid)?.get(r.item_id) ?? 0);
        return { name: m.to.name, owner: accountOf(m.to.name) === r.owner_key, distance: segmentDistance(chest, m.from, m.to), gained };
      })
      .filter((p) => p.distance <= reach);

    const owner = people.find((p) => p.owner);
    const ownerGained = Boolean(owner && owner.gained > 0);
    const ownerNear = Boolean(owner && owner.distance <= near);
    const others = people.filter((p) => !p.owner);
    const gainers = others.filter((p) => p.gained > 0).sort((a, b) => b.gained - a.gained || a.distance - b.distance);

    let suspects: typeof others;
    let confidence: TakeConfidence;
    if (gainers.length) {
      suspects = gainers;
      confidence = gainers[0]!.distance <= near && !ownerGained ? "sicher" : "wahrscheinlich";
    } else if (ownerGained || ownerNear) {
      continue; // Besitzer hat es selbst genommen oder verbraucht
    } else {
      suspects = others.filter((p) => p.distance <= near).sort((a, b) => a.distance - b.distance);
      if (!suspects.length) continue; // niemand Fremdes da: Trichter, Redstone, Feuer …
      confidence = "möglich";
    }
    events.push({
      container_id: r.source_id,
      owner_key: r.owner_key,
      owner_label: r.owner_label,
      item_id: r.item_id,
      count: lost,
      suspects: suspects.map((p) => p.name),
      confidence,
      distance: Math.round(suspects[0]!.distance),
    });
  }
  return events;
}
