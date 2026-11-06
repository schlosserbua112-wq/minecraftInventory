// Holt die Vanilla-Rezepte (Werkbank und Steinsäge) einer Minecraft-Version aus misode/mcmeta
// (aus Mojangs Server-JAR ausgelesen) und schreibt sie kompakt nach packages/core/src/recipes-data.ts.
// Aufruf: node scripts/recipes.mjs 26.3
import { writeFile } from "node:fs/promises";

const version = process.argv[2] ?? "26.3";
const base = `https://raw.githubusercontent.com/misode/mcmeta/${version}-summary/data`;
const get = async (p) => {
  const r = await fetch(`${base}/${p}`);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
};
const [recipes, tags] = await Promise.all([get("recipe/data.min.json"), get("tag/item/data.min.json")]);

const short = (id) => id.replace(/^minecraft:/, "");
/** Item-Tag (auch verschachtelt) zu Item-Liste auflösen */
function expandTag(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const t = tags[short(name)];
  if (!t) throw new Error(`Tag fehlt: ${name}`);
  return t.values.flatMap((v) => {
    const id = typeof v === "string" ? v : v.id;
    return id.startsWith("#") ? expandTag(id.slice(1), seen) : [short(id)];
  });
}
/** Zutat: "minecraft:x", "#minecraft:tag" oder Liste davon → Item-Liste */
const options = (ing) => [...new Set((Array.isArray(ing) ? ing : [ing]).flatMap((x) => (x.startsWith("#") ? expandTag(x.slice(1)) : [short(x)])))];

const out = {};
let n = 0;
for (const [key, r] of Object.entries(recipes)) {
  let ings; // [[optionen], menge][]
  if (r.type === "minecraft:crafting_shaped") {
    const cnt = {};
    for (const ch of r.pattern.join("")) if (ch !== " ") cnt[ch] = (cnt[ch] ?? 0) + 1;
    ings = Object.entries(cnt).map(([ch, q]) => [options(r.key[ch]), q]);
  } else if (r.type === "minecraft:crafting_shapeless") {
    const m = new Map();
    for (const ing of r.ingredients) {
      const k = JSON.stringify(ing);
      m.set(k, [options(ing), (m.get(k)?.[1] ?? 0) + 1]);
    }
    ings = [...m.values()];
  } else if (r.type === "minecraft:stonecutting") {
    ings = [[options(r.ingredient), 1]];
  } else continue;
  const result = short(r.result.id);
  // Rezepte, die ihr eigenes Ergebnis brauchen (z. B. Färben), bringen nichts
  if (ings.some(([o]) => o.includes(result))) continue;
  (out[result] ??= []).push([r.result.count ?? 1, ings, key, r.type === "minecraft:stonecutting"]);
  n++;
}
// Sparsamstes Rezept zuerst (Steinsäge: 1 Stein → 1 Treppe statt 6 → 4 an der Werkbank)
const cost = ([c, ings]) => ings.reduce((s, [, q]) => s + q, 0) / c;
for (const list of Object.values(out)) list.sort((a, b) => cost(a) - cost(b) || a[2].localeCompare(b[2]));
const data = Object.fromEntries(Object.entries(out).sort().map(([k, v]) => [k, v.map(([c, i, , stone]) => (stone ? [c, i, 1] : [c, i]))]));

const src = `// Automatisch erzeugt mit \`node scripts/recipes.mjs ${version}\`, nicht von Hand ändern.
// Quelle: Vanilla-Daten ${version} (misode/mcmeta), nur Werkbank und Steinsäge.
// Ergebnis-Item → Rezepte als [Ergebnis-Menge, [[Item-Optionen], Menge je Craft][], 1 = Steinsäge]; IDs ohne "minecraft:".
import type { RecipeBook } from "./recipes.js";

export const RECIPE_VERSION = ${JSON.stringify(version)};
export const RECIPES: RecipeBook = ${JSON.stringify(data)};
`;
await writeFile(new URL("../packages/core/src/recipes-data.ts", import.meta.url), src);
console.log(`${n} Rezepte für ${Object.keys(data).length} Items geschrieben (${Math.round(src.length / 1024)} KB)`);
