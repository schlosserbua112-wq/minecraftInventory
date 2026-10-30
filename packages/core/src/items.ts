import type { ItemStack } from "./types.js";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Normalisiert einen rohen Item-Eintrag aus NBT (count/Count, components/tag). */
export function toItemStack(raw: unknown): ItemStack | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== "string") return null;
  const count = Number(r.count ?? r.Count ?? 1);
  if (!Number.isFinite(count) || count <= 0) return null;
  return {
    id: r.id,
    count,
    components: asRecord(r.components),
    tag: asRecord(r.tag),
  };
}

/** Direkter Inhalt eines Items (Shulkerbox, Bündel), ohne Rekursion. */
export function nestedItems(stack: ItemStack): ItemStack[] {
  const out: ItemStack[] = [];
  const c = stack.components;
  if (c) {
    // Ab 1.20.5: [{slot, item: {...}}]
    const container = c["minecraft:container"];
    if (Array.isArray(container)) {
      for (const entry of container) {
        const s = toItemStack(asRecord(entry)?.item ?? entry);
        if (s) out.push(s);
      }
    }
    const bundle = c["minecraft:bundle_contents"];
    if (Array.isArray(bundle)) {
      for (const entry of bundle) {
        const s = toItemStack(entry);
        if (s) out.push(s);
      }
    }
  }
  // Altes Format: tag.BlockEntityTag.Items
  const legacy = asRecord(asRecord(stack.tag)?.BlockEntityTag)?.Items;
  if (Array.isArray(legacy)) {
    for (const entry of legacy) {
      const s = toItemStack(entry);
      if (s) out.push(s);
    }
  }
  return out;
}

/** Zählt Items inklusive Inhalt von Shulkerboxen und Bündeln. Behälter-Items zählen selbst mit. */
export function countItems(stacks: Iterable<ItemStack>, into = new Map<string, number>(), depth = 0): Map<string, number> {
  for (const stack of stacks) {
    into.set(stack.id, (into.get(stack.id) ?? 0) + stack.count);
    if (depth < 4) countItems(nestedItems(stack), into, depth + 1);
  }
  return into;
}
