import { containerId } from "./region.js";
import { plainText } from "./names.js";
import { toItemStack } from "./items.js";
import type { ContainerKind, ContainerSnapshot, ItemStack } from "./types.js";

/**
 * Übersetzt rohe NBT-/SNBT-Daten (aus Region-Dateien, playerdata oder `/data get`) in Snapshots.
 * Feldnamen werden an echten 26.3-Dateien geprüft (test/fixtures/mc-26.3).
 */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);

const KINDS: Record<string, ContainerKind> = {
  "minecraft:chest": "chest",
  "minecraft:trapped_chest": "trapped_chest",
  "minecraft:barrel": "barrel",
};

/** Behälterart zu einer Block-Entity-ID, `null` für alles, was wir nicht zählen. */
export function containerKind(id: unknown): ContainerKind | null {
  if (typeof id !== "string") return null;
  if (KINDS[id]) return KINDS[id]!;
  if (/^minecraft:([a-z_]+_)?shulker_box$/.test(id)) return "shulker_box";
  return null;
}

/** Item-Liste (Items, Inventory, EnderItems) in ItemStacks umwandeln. */
export function itemList(raw: unknown): ItemStack[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toItemStack).filter((s): s is ItemStack => s !== null);
}

/** Eine Block-Entity als Behälter-Snapshot, oder `null`, wenn sie kein gezählter Behälter ist. */
export function containerFromBlockEntity(raw: unknown, dimension: string, fallbackPos?: { x: number; y: number; z: number }): ContainerSnapshot | null {
  const be = obj(raw);
  if (!be) return null;
  const kind = containerKind(be.id);
  if (!kind) return null;
  const x = Number(be.x ?? fallbackPos?.x);
  const y = Number(be.y ?? fallbackPos?.y);
  const z = Number(be.z ?? fallbackPos?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  const name = be.CustomName == null ? "" : plainText(be.CustomName).trim();
  return { id: containerId(dimension, x, y, z), dimension, x, y, z, kind, customName: name || null, items: itemList(be.Items), generated: be.LootTable != null };
}

/** Alle gezählten Behälter eines Chunks aus einer Region-Datei. */
export function containersFromChunk(chunk: unknown, dimension: string): ContainerSnapshot[] {
  const c = obj(chunk);
  if (!c) return [];
  // Ab 1.18: block_entities direkt im Chunk; davor Level.TileEntities
  const list = c.block_entities ?? obj(c.Level)?.TileEntities;
  if (!Array.isArray(list)) return [];
  return list.map((be) => containerFromBlockEntity(be, dimension)).filter((s): s is ContainerSnapshot => s !== null);
}

/** Inventar eines Spielers inkl. Rüstung und Zweithand (ab 1.21.5 im Feld `equipment`). */
export function playerInventory(data: unknown): ItemStack[] {
  const p = obj(data);
  if (!p) return [];
  const items = itemList(p.Inventory);
  const eq = obj(p.equipment);
  if (eq) for (const v of Object.values(eq)) {
    const s = toItemStack(v);
    if (s) items.push(s);
  }
  return items;
}

export function playerEnderChest(data: unknown): ItemStack[] {
  return itemList(obj(data)?.EnderItems);
}

/** Dimension eines Spielers aus playerdata (`Dimension`), Standard Oberwelt. */
export function playerDimension(data: unknown): string {
  const d = obj(data)?.Dimension;
  return typeof d === "string" ? d : "minecraft:overworld";
}

/** UUID aus Int-Array [a,b,c,d] in die Schreibweise mit Bindestrichen. */
export function uuidFromInts(ints: unknown): string | null {
  if (!Array.isArray(ints) || ints.length !== 4) return null;
  const hex = ints.map((n) => (Number(n) >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
