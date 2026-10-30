import { itemLabel } from "@mc/core";

/** Deutsche Namen und Symbolfarben für häufige Items; alles andere fällt auf den englischen Namen zurück. */
const KNOWN: Record<string, [de: string, color: string, shade: string]> = {
  "minecraft:diamond": ["Diamant", "#4fd3e0", "#2a8f99"],
  "minecraft:iron_ingot": ["Eisenbarren", "#e2e2e2", "#9a9a9a"],
  "minecraft:gold_ingot": ["Goldbarren", "#f2c94c", "#a8831f"],
  "minecraft:copper_ingot": ["Kupferbarren", "#e07b4f", "#9a4a2a"],
  "minecraft:netherite_ingot": ["Netheritbarren", "#5a4b4b", "#2f2727"],
  "minecraft:emerald": ["Smaragd", "#3ddc84", "#1f8a4f"],
  "minecraft:redstone": ["Redstone", "#e0453a", "#8f231c"],
  "minecraft:lapis_lazuli": ["Lapislazuli", "#3a5fcd", "#22397a"],
  "minecraft:coal": ["Kohle", "#3a3a3a", "#151515"],
  "minecraft:stone_bricks": ["Steinziegel", "#8d8d8d", "#5c5c5c"],
  "minecraft:stone_brick_stairs": ["Steinziegeltreppe", "#8d8d8d", "#5c5c5c"],
  "minecraft:stone_brick_slab": ["Steinziegelstufe", "#8d8d8d", "#5c5c5c"],
  "minecraft:stone_brick_wall": ["Steinziegelmauer", "#8d8d8d", "#5c5c5c"],
  "minecraft:cobblestone": ["Bruchstein", "#7b7b7b", "#4a4a4a"],
  "minecraft:deepslate": ["Tiefenschiefer", "#4d4d52", "#2b2b2f"],
  "minecraft:oak_log": ["Eichenstamm", "#b0844a", "#6e5029"],
  "minecraft:spruce_planks": ["Fichtenholzbretter", "#7a5a3a", "#4e3822"],
  "minecraft:spruce_stairs": ["Fichtenholztreppe", "#7a5a3a", "#4e3822"],
  "minecraft:spruce_slab": ["Fichtenholzstufe", "#7a5a3a", "#4e3822"],
  "minecraft:spruce_trapdoor": ["Fichtenholzfalltür", "#7a5a3a", "#4e3822"],
  "minecraft:spruce_fence": ["Fichtenholzzaun", "#7a5a3a", "#4e3822"],
  "minecraft:spruce_door": ["Fichtenholztür", "#7a5a3a", "#4e3822"],
  "minecraft:stripped_spruce_log": ["Entrindeter Fichtenstamm", "#9c7448", "#6a4c2c"],
  "minecraft:bookshelf": ["Bücherregal", "#a0703c", "#5a3a1c"],
  "minecraft:iron_bars": ["Eisengitter", "#b8b8b8", "#6a6a6a"],
  "minecraft:flint_and_steel": ["Feuerzeug", "#8a8a8a", "#3a3a3a"],
  "minecraft:glass": ["Glas", "#cfe8ee", "#8fb3bd"],
  "minecraft:sand": ["Sand", "#dccf9a", "#a89a63"],
  "minecraft:quartz_block": ["Quarzblock", "#ece6dc", "#b8afa1"],
  "minecraft:obsidian": ["Obsidian", "#3b2a5a", "#1e1530"],
  "minecraft:bread": ["Brot", "#d2a05a", "#8a6230"],
  "minecraft:cooked_beef": ["Steak", "#9a5a3a", "#5e3320"],
  "minecraft:torch": ["Fackel", "#f2b84c", "#7a5a2a"],
  "minecraft:arrow": ["Pfeil", "#b8a888", "#6a5a48"],
  "minecraft:ender_pearl": ["Enderperle", "#2a8f7a", "#14544a"],
  "minecraft:experience_bottle": ["Erfahrungsfläschchen", "#9be35e", "#4f8a2a"],
  "minecraft:diamond_pickaxe": ["Diamantspitzhacke", "#4fd3e0", "#6e5029"],
  "minecraft:elytra": ["Elytren", "#9a9ab8", "#5a5a78"],
  "minecraft:shulker_box": ["Shulkerkiste", "#9a6aa8", "#5e3a6a"],
};

export function itemName(id: string): string {
  return KNOWN[id]?.[0] ?? itemLabel(id);
}

function hashColor(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return [`hsl(${hue} 35% 60%)`, `hsl(${hue} 35% 35%)`];
}

export function itemColors(id: string): [string, string] {
  const k = KNOWN[id];
  return k ? [k[1], k[2]] : hashColor(id);
}

/** Sucht in deutschen und englischen Namen sowie in der ID. */
export function matchesItem(id: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return itemName(id).toLowerCase().includes(q) || itemLabel(id).toLowerCase().includes(q) || id.includes(q.replace(/\s+/g, "_"));
}

export const fmt = new Intl.NumberFormat("de-DE");
