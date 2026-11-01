import { containerId } from "./region.js";
import type { BlockPos, ContainerSnapshot } from "./types.js";

/**
 * Doppelkisten: Minecraft speichert jede Hälfte als eigene Block-Entity. Welche Hälften zusammengehören,
 * steht nur im Block-State (`type=left/right` und `facing`) in den Chunk-Abschnitten.
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);

const STEP: Record<string, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
const CLOCKWISE: Record<string, string> = { north: "east", east: "south", south: "west", west: "north" };
const COUNTER: Record<string, string> = { north: "west", west: "south", south: "east", east: "north" };

export interface BlockState {
  name: string;
  properties: Record<string, string>;
}

/**
 * Palette-Eintrag als Name und Eigenschaften. Bis 1.21 `{Name, Properties}`, in 26.x `{id, properties}`,
 * `{"": name}` oder ein String, notfalls mit Eigenschaften in eckigen Klammern.
 */
export function paletteEntry(e: unknown): BlockState {
  if (typeof e === "string") {
    const m = /^([^[]+)(?:\[(.*)\])?$/.exec(e);
    const properties: Record<string, string> = {};
    for (const kv of (m?.[2] ?? "").split(",")) {
      const [k, v] = kv.split("=");
      if (k && v !== undefined) properties[k.trim()] = v.trim();
    }
    return { name: (m?.[1] ?? e).trim(), properties };
  }
  const o = obj(e) ?? {};
  const props = obj(o.Properties ?? o.properties) ?? {};
  return { name: String(o.Name ?? o.id ?? o[""] ?? "minecraft:air"), properties: Object.fromEntries(Object.entries(props).map(([k, v]) => [k, String(v)])) };
}

/** Ein Wert aus einem gepackten Long-Array (Einträge überspannen keine Long-Grenzen, ab 1.16). */
function packedAt(data: BigInt64Array, bits: number, index: number): number {
  const perLong = Math.floor(64 / bits);
  const long = data[Math.floor(index / perLong)];
  if (long === undefined) return 0;
  return Number((BigInt.asUintN(64, long) >> BigInt((index % perLong) * bits)) & ((1n << BigInt(bits)) - 1n));
}

/** Block-State an einer Weltposition aus den Abschnitten eines Chunks (Long-Arrays als BigInt64Array). */
export function blockStateAt(sections: unknown, x: number, y: number, z: number): BlockState | null {
  if (!Array.isArray(sections)) return null;
  const sy = Math.floor(y / 16);
  const section = sections.map(obj).find((s) => s && Number(s.Y) === sy);
  const bs = obj(section?.block_states);
  const palette = bs?.palette;
  if (!Array.isArray(palette) || !palette.length) return null;
  if (palette.length === 1) return paletteEntry(palette[0]);
  if (!(bs!.data instanceof BigInt64Array)) return null;
  const bits = Math.max(4, Math.ceil(Math.log2(palette.length)));
  const index = (((y & 15) * 16 + (z & 15)) * 16) + (x & 15);
  const entry = palette[packedAt(bs!.data, bits, index)];
  return entry === undefined ? null : paletteEntry(entry);
}

/** Position der anderen Hälfte (wie `ChestBlock.getConnectedDirection` im Spiel), `null` bei Einzelkisten. */
export function chestPartner(state: BlockState, pos: BlockPos): { half: "left" | "right"; partner: BlockPos } | null {
  const { type, facing } = state.properties;
  if ((type !== "left" && type !== "right") || !facing || !STEP[facing]) return null;
  const [dx, dz] = STEP[type === "left" ? CLOCKWISE[facing]! : COUNTER[facing]!]!;
  return { half: type, partner: { x: pos.x + dx, y: pos.y, z: pos.z + dz } };
}

const isChest = (c: ContainerSnapshot) => c.kind === "chest" || c.kind === "trapped_chest";

/** Trägt bei Kisten eines Chunks die andere Hälfte ein, wenn der Block-State eine Doppelkiste zeigt. */
export function attachChestPartners(containers: ContainerSnapshot[], sections: unknown): void {
  for (const c of containers) {
    if (!isChest(c)) continue;
    const state = blockStateAt(sections, c.x, c.y, c.z);
    if (!state || state.name !== `minecraft:${c.kind}`) continue;
    const p = chestPartner(state, c);
    if (p) Object.assign(c, p);
  }
}

const samePos = (a: BlockPos | undefined, b: BlockPos) => !!a && a.x === b.x && a.y === b.y && a.z === b.z;
const posOf = (c: BlockPos): BlockPos => ({ x: c.x, y: c.y, z: c.z });

/** Die andere Hälfte, wenn beide Hälften da sind und aufeinander zeigen. */
function partnerIn(c: ContainerSnapshot, byId: ReadonlyMap<string, ContainerSnapshot>): ContainerSnapshot | undefined {
  if (!c.partner) return undefined;
  const p = byId.get(containerId(c.dimension, c.partner.x, c.partner.y, c.partner.z));
  return p && p !== c && p.kind === c.kind && samePos(p.partner, c) ? p : undefined;
}

/**
 * Hälften, die zusammengehören, als Gruppen: Doppelkisten mit der rechten Hälfte zuerst, sonst einzeln.
 * Die Reihenfolge der Eingabe bleibt erhalten.
 */
export function groupDoubleChests(containers: Iterable<ContainerSnapshot>): ContainerSnapshot[][] {
  const list = [...containers];
  const byId = new Map(list.map((c) => [c.id, c]));
  const done = new Set<string>();
  const groups: ContainerSnapshot[][] = [];
  for (const c of list) {
    if (done.has(c.id)) continue;
    done.add(c.id);
    const p = partnerIn(c, byId);
    if (!p || done.has(p.id)) {
      groups.push([c]);
      continue;
    }
    done.add(p.id);
    groups.push(c.half === "left" ? [p, c] : [c, p]);
  }
  return groups;
}

/**
 * Eine Gruppe als eine Kiste: ID und Position der rechten Hälfte, Inhalt beider Hälften,
 * Name wie im Spiel (rechte Hälfte zuerst, sonst der Name der linken).
 */
export function mergeGroup(group: ContainerSnapshot[]): ContainerSnapshot {
  const [first, ...rest] = group;
  if (!rest.length) return first!;
  const { partner: _p, half: _h, ...base } = first!;
  return {
    ...base,
    customName: group.find((c) => c.customName)?.customName ?? null,
    items: group.flatMap((c) => c.items),
    generated: group.every((c) => c.generated),
    parts: group.map(posOf),
  };
}

/** Doppelkisten zu je einer Kiste zusammenführen, Einzelkisten bleiben, wie sie sind. */
export function mergeDoubleChests(containers: Iterable<ContainerSnapshot>): ContainerSnapshot[] {
  return groupDoubleChests(containers).map(mergeGroup);
}

/** IDs der Hälften, die in einer zusammengeführten Kiste aufgehen (ohne die ID der Kiste selbst). */
export function mergedAwayIds(c: ContainerSnapshot): string[] {
  return (c.parts ?? []).slice(1).map((p) => containerId(c.dimension, p.x, p.y, p.z));
}
