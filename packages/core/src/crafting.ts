/**
 * Crafting-Rechner: Ein Endprodukt wird bis zu den Grundstoffen aufgelöst (Stamm → Bretter → Stöcke → …).
 *
 * - Braucht man dasselbe Zwischenprodukt an mehreren Stellen, wird erst der Bedarf zusammengezählt
 *   und dann auf ganze Crafts aufgerundet (6 Stöcke = 2 Crafts mit 8 Stück, 2 übrig).
 * - Geht bei einer Zutat jedes Holz (Stöcke, Truhe, Kolben), entscheidet die gewählte Holzsorte.
 *   Andere Auswahlen (Kohle oder Holzkohle) lassen sich je Zutat überschreiben.
 * - Grundstoffe sind Items ohne Rezept und die "natürliche" Seite von Hin-und-zurück-Rezepten
 *   (Eisenbarren ↔ Eisenblock ↔ Nugget): Die meistbenutzte Seite gilt als Grundstoff.
 * - Mit Bestand wird erst Vorhandenes genommen und nur der Rest gecraftet oder gesammelt.
 */
import { RECIPES } from "./recipes-data.js";
import type { RecipeBook } from "./recipes.js";

const NS = "minecraft:";
const full = (id: string) => (id.includes(":") ? id : NS + id);
const short = (id: string) => (id.startsWith(NS) ? id.slice(NS.length) : id);

export interface FlowOptions {
  /** Holzsorte für Zutaten, bei denen jedes Holz geht, z. B. "oak", "spruce". */
  wood?: string;
  /** Steinsäge-Rezepte erlauben (sonst nur Werkbank). */
  stonecutter?: boolean;
  /** Auswahl je Zutaten-Liste: Schlüssel aus `FlowNode.choice.key` → gewähltes Item. */
  choices?: Record<string, string>;
  /** Gewähltes Rezept je Item (Index in `FlowNode.recipeCount`), Standard 0. */
  recipes?: Record<string, number>;
  /** Items, die nicht weiter aufgelöst werden sollen. */
  raw?: string[];
  /** Vorhandener Bestand; wird für Zwischenstufen und Grundstoffe zuerst genommen. */
  stock?: Map<string, number>;
}

export interface FlowNode {
  item_id: string;
  /** Gesamtbedarf an dieser Stelle (beim Endprodukt die gewünschte Menge). */
  need: number;
  /** Davon aus dem Bestand genommen. */
  have: number;
  /** Bei Grundstoffen: so viele fehlen noch (Bedarf minus Bestand). */
  missing: number;
  base: boolean;
  /** Bei craftbaren Items: Anzahl Crafts, Ausbeute je Craft, was übrig bleibt. */
  crafts: number;
  perCraft: number;
  leftover: number;
  station: "werkbank" | "steinsaege" | null;
  /** Gewähltes Rezept und wie viele zur Wahl stehen. */
  recipe: number;
  recipeCount: number;
  /** Spalte von links: 0 = Grundstoffe, das Endprodukt ganz rechts. */
  stage: number;
  /** Wenn das Item aus einer Liste gewählt wurde (Holz, Kohle/Holzkohle): die Liste. */
  choice?: { key: string; options: string[] };
  /** Lässt sich craften, wird aber als Grundstoff behandelt (vom Spieler gewählt). */
  stopped: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
  count: number;
}

export interface Flow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

type Recipe = RecipeBook[string][number];

/** Wie oft jedes Item in irgendeinem Rezept als Zutat vorkommt. */
function usage(book: RecipeBook): Map<string, number> {
  const u = new Map<string, number>();
  for (const list of Object.values(book)) for (const [, ings] of list) for (const [opts] of ings) for (const o of opts) u.set(o, (u.get(o) ?? 0) + 1);
  return u;
}

/** Craftbar, aber man holt es fast immer anders (Leder von Kühen statt aus Kaninchenfell). */
const NATURAL = new Set(["leather"]);

const cache = new WeakMap<RecipeBook, Map<string, Recipe[]>>();

/**
 * Rezepte je Item ohne Hin-und-zurück-Paare (Barren aus Block, wenn der Block aus Barren entsteht):
 * Von zwei Items, die sich gegenseitig ergeben, bleibt das meistbenutzte ohne dieses Rezept.
 * Umfärbe-Rezepte (weiße Wolle aus anderer Wolle) kommen ans Ende.
 */
function cleanBook(book: RecipeBook): Map<string, Recipe[]> {
  const hit = cache.get(book);
  if (hit) return hit;
  const used = usage(book);
  const single = (r: Recipe) => (r[1].length === 1 && r[1][0][0].length === 1 ? r[1][0][0][0] : null);
  const out = new Map<string, Recipe[]>();
  for (const [item, list] of Object.entries(book)) {
    if (NATURAL.has(item)) continue;
    const keep = list.filter((r) => {
      const y = single(r);
      if (!y) return true;
      const back = (book[y] ?? []).some((r2) => single(r2) === item);
      return !back || (used.get(item) ?? 0) < (used.get(y) ?? 0);
    });
    const suffix = item.includes("_") ? item.slice(item.lastIndexOf("_")) : null;
    const recolor = (r: Recipe) => !!suffix && r[1].some(([opts]) => opts.length > 3 && opts.every((o) => o.endsWith(suffix)));
    keep.sort((a, b) => Number(recolor(a)) - Number(recolor(b)));
    if (keep.length) out.set(item, keep);
  }
  cache.set(book, out);
  return out;
}

/** Holzsorten, die es im Rezeptbuch gibt (aus den Brettern für Stöcke), z. B. ["oak", "spruce", …]. */
export function woodTypes(book: RecipeBook = RECIPES): string[] {
  const planks = book.stick?.[0]?.[1][0]?.[0] ?? [];
  return planks.filter((p) => p.endsWith("_planks")).map((p) => p.slice(0, -"_planks".length));
}

/** Items mit mindestens einem Werkbank-Rezept (für die Auswahl im Rechner), mit "minecraft:". */
export function craftableItems(book: RecipeBook = RECIPES): string[] {
  return Object.entries(book)
    .filter(([, list]) => list.some((r) => !r[2]))
    .map(([id]) => full(id));
}

export function craftFlow(target: string, quantity: number, opts: FlowOptions = {}, book: RecipeBook = RECIPES): Flow {
  const clean = cleanBook(book);
  const raw = new Set((opts.raw ?? []).map(short));
  const stock = opts.stock;
  const tgt = short(target);

  const recipesOf = (id: string) => (clean.get(id) ?? []).filter((r) => opts.stonecutter || !r[2]);

  interface Decided {
    recipe: Recipe | null;
    index: number;
    count: number;
    inputs: [string, number][];
    stopped: boolean;
  }
  const decided = new Map<string, Decided>();
  const choiceOf = new Map<string, { key: string; options: string[] }>();
  const stack = new Set<string>();

  /** Reihenfolge, in der die Optionen einer Zutat versucht werden. */
  function ranked(options: string[]): string[] {
    const key = options.join(",");
    const pick = opts.choices?.[key];
    const wood = opts.wood ? `${opts.wood}_` : null;
    const score = (o: string) => (pick && short(pick) === o ? 0 : wood && o.startsWith(wood) ? 1 : 2);
    return options.map((o, i) => [o, i] as const).sort((a, b) => score(a[0]) - score(b[0]) || a[1] - b[1]).map(([o]) => o);
  }

  function decide(id: string): void {
    if (decided.has(id)) return;
    stack.add(id);
    const list = recipesOf(id);
    const stopped = raw.has(id) && id !== tgt && list.length > 0;
    let result: Decided = { recipe: null, index: 0, count: list.length, inputs: [], stopped };
    if (!stopped && list.length) {
      const wanted = Math.min(Math.max(opts.recipes?.[full(id)] ?? 0, 0), list.length - 1);
      // Gewähltes Rezept zuerst, die anderen als Ausweichen, falls es im Kreis liefe
      const order = [wanted, ...list.keys()].filter((v, i, a) => a.indexOf(v) === i);
      for (const ri of order) {
        const r = list[ri];
        const inputs: [string, number][] = [];
        let ok = true;
        for (const [options, q] of r[1]) {
          const o = ranked(options).find((x) => !stack.has(x));
          if (!o) {
            ok = false;
            break;
          }
          if (options.length > 1 && !choiceOf.has(o)) choiceOf.set(o, { key: options.join(","), options: options.map(full) });
          inputs.push([o, q]);
        }
        if (!ok) continue;
        result = { recipe: r, index: ri, count: list.length, inputs, stopped: false };
        break;
      }
    }
    decided.set(id, result);
    for (const [o] of result.inputs) decide(o);
    stack.delete(id);
  }
  decide(tgt);

  // Bedarf von oben nach unten weitergeben, jedes Item erst, wenn alle Abnehmer fertig sind
  const parents = new Map<string, number>();
  for (const d of decided.values()) for (const [o] of d.inputs) parents.set(o, (parents.get(o) ?? 0) + 1);
  const need = new Map<string, number>([[tgt, Math.max(0, Math.floor(quantity))]]);
  const edges: FlowEdge[] = [];
  const nodes = new Map<string, FlowNode>();
  const ready = [tgt];
  while (ready.length) {
    const id = ready.shift()!;
    const d = decided.get(id)!;
    const n = need.get(id) ?? 0;
    const have = id === tgt || !stock ? 0 : Math.min(stock.get(full(id)) ?? 0, n);
    const rest = n - have;
    const per = d.recipe?.[0] ?? 1;
    const crafts = d.recipe ? Math.ceil(rest / per) : 0;
    nodes.set(id, {
      item_id: full(id),
      need: n,
      have,
      missing: d.recipe ? 0 : rest,
      base: !d.recipe,
      crafts,
      perCraft: per,
      leftover: d.recipe ? crafts * per - rest : 0,
      station: d.recipe ? (d.recipe[2] ? "steinsaege" : "werkbank") : null,
      recipe: d.index,
      recipeCount: d.count,
      stage: 0,
      choice: choiceOf.get(id),
      stopped: d.stopped,
    });
    for (const [o, q] of d.inputs) {
      const c = crafts * q;
      need.set(o, (need.get(o) ?? 0) + c);
      edges.push({ from: full(o), to: full(id), count: c });
      const left = (parents.get(o) ?? 1) - 1;
      parents.set(o, left);
      if (left === 0) ready.push(o);
    }
  }

  // Spalten: Grundstoffe links, jedes Item eine Spalte rechts von seiner spätesten Zutat
  const stageOf = (id: string): number => {
    const node = nodes.get(id)!;
    const ins = decided.get(id)!.inputs;
    if (!ins.length) return 0;
    if (node.stage) return node.stage;
    node.stage = 1 + Math.max(...ins.map(([o]) => stageOf(o)));
    return node.stage;
  };
  for (const id of nodes.keys()) stageOf(id);

  // Was nicht gebraucht wird (Bedarf 0), fällt weg, außer dem Endprodukt
  const list = [...nodes.values()].filter((x) => x.need > 0 || short(x.item_id) === tgt);
  const keep = new Set(list.map((x) => x.item_id));
  return { nodes: list, edges: edges.filter((e) => e.count > 0 && keep.has(e.from) && keep.has(e.to)) };
}
