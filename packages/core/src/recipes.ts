/**
 * Crafting-Rechnung für Projekte: Was fehlt, lässt sich vielleicht aus vorhandenen Materialien
 * an Werkbank oder Steinsäge herstellen, auch über Zwischenstufen (Stamm → Bretter → Treppe).
 *
 * Gegen Doppelzählung arbeitet die Rechnung auf einem gemeinsamen Vorrat: Erst bekommt jedes
 * benötigte Item seinen eigenen Bestand, danach wird für jede Lücke nacheinander gecraftet,
 * und was dafür verbraucht wird, steht den folgenden Items nicht mehr zur Verfügung.
 */
import { RECIPES } from "./recipes-data.js";

/** Ergebnis-Item (ohne "minecraft:") → Rezepte als [Menge je Craft, [[Item-Optionen], Menge je Craft][], 1 = Steinsäge] */
export type RecipeBook = Record<string, [number, [string[], number][], 1?][]>;

export interface CraftPlan {
  item_id: string;
  quantity: number;
  /** Direkt vorhanden und für dieses Item reserviert (höchstens `quantity`). */
  have: number;
  /** Zusätzlich aus Materialien craftbar. */
  craftable: number;
  /** Was danach noch fehlt. */
  missing: number;
  /** Fürs Craften verbrauchte Materialien aus dem Bestand, größte zuerst. */
  uses: { item_id: string; count: number }[];
}

const NS = "minecraft:";
const full = (id: string) => (id.includes(":") ? id : NS + id);
const short = (id: string) => (id.startsWith(NS) ? id.slice(NS.length) : id);

/** Wie viele Stufen tief gecraftet wird (Stamm → Bretter → Stock → Fackel sind drei). */
const MAX_DEPTH = 4;

export function planProject(
  needs: { item_id: string; quantity: number }[],
  stock: Map<string, number>,
  book: RecipeBook = RECIPES,
): CraftPlan[] {
  const pool = new Map(stock);
  const take = (p: Map<string, number>, id: string, n: number) => {
    const t = Math.min(p.get(id) ?? 0, n);
    if (t > 0) p.set(id, (p.get(id) ?? 0) - t);
    return t;
  };

  function obtainAny(opts: string[], n: number, p: Map<string, number>, visiting: Set<string>, depth: number): number {
    let got = 0;
    const ids = opts.map(full).sort((a, b) => (p.get(b) ?? 0) - (p.get(a) ?? 0));
    for (const id of ids) if (got < n) got += take(p, id, n - got);
    for (const id of ids) if (got < n) got += craft(id, n - got, p, visiting, depth);
    return got;
  }

  /** Bis zu `n` Stück von `id` aus dem Vorrat `p` craften; verbraucht Zutaten, gibt die Menge zurück. */
  function craft(id: string, n: number, p: Map<string, number>, visiting: Set<string>, depth: number): number {
    const recipes = book[short(id)];
    if (!recipes || depth >= MAX_DEPTH || visiting.has(id)) return 0;
    visiting.add(id);
    let made = 0;
    for (const [per, ings] of recipes) {
      if (made >= n) break;
      let crafts = Math.ceil((n - made) / per);
      for (let tries = 0; tries < 4 && crafts > 0; tries++) {
        const trial = new Map(p);
        let possible = crafts;
        for (const [opts, q] of ings) {
          possible = Math.min(possible, Math.floor(obtainAny(opts, crafts * q, trial, visiting, depth + 1) / q));
          if (possible === 0) break;
        }
        if (possible === crafts) {
          p.clear();
          for (const [k, v] of trial) p.set(k, v);
          break;
        }
        crafts = possible;
      }
      if (crafts <= 0) continue;
      const produced = crafts * per;
      const used = Math.min(produced, n - made);
      made += used;
      // Überschuss (z. B. 4 Treppen statt 3) bleibt im Vorrat für andere Items
      if (produced > used) p.set(id, (p.get(id) ?? 0) + produced - used);
    }
    visiting.delete(id);
    return made;
  }

  // 1. Jedes Item bekommt zuerst seinen eigenen Bestand
  const plans: CraftPlan[] = needs.map((nd) => {
    const have = take(pool, nd.item_id, nd.quantity);
    return { item_id: nd.item_id, quantity: nd.quantity, have, craftable: 0, missing: nd.quantity - have, uses: [] };
  });
  // 2. Lücken der Reihe nach aus dem verbleibenden Vorrat craften
  for (const plan of plans) {
    if (plan.missing <= 0) continue;
    const before = new Map(pool);
    const got = craft(plan.item_id, plan.missing, pool, new Set(), 0);
    if (got === 0) continue;
    plan.craftable = got;
    plan.missing -= got;
    plan.uses = [...before]
      .map(([item_id, n]) => ({ item_id, count: n - (pool.get(item_id) ?? 0) }))
      .filter((u) => u.count > 0)
      .sort((a, b) => b.count - a.count);
  }
  return plans;
}

/** Gibt es überhaupt ein Rezept (Werkbank/Steinsäge) für dieses Item? */
export const hasRecipe = (id: string, book: RecipeBook = RECIPES) => !!book[short(id)];
