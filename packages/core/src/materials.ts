/** Ergebnis des Material-Listen-Parsers (z. B. Export aus einem Bauplan-Tool). */
export interface MaterialList {
  /** Vorschlag für den Projektnamen aus "Materials for <Name>". */
  title: string | null;
  /** Info-Zeile wie "897 blocks · 252 steps", unverändert. */
  info: string | null;
  items: { name: string; itemId: string; count: number }[];
  /** Zeilen, die nicht als Material erkannt wurden. */
  skipped: string[];
  /** Erkannte Namen, deren ID nicht in `knownIds` steht (nur wenn `knownIds` übergeben wurde). */
  unknown: { name: string; itemId: string; count: number }[];
}

const TITLE_RE = /^materials?\s+for\s+(.+?)\s*:?$/i;
const BULLET_RE = /^(?:[*\-•·]|\d+[.)])\s+/;
const INFO_RE = /^\d[\d.,]*\s+blocks?\b/i;
// "428× Stone Bricks  (6 stacks + 44)", auch "428x", "428 x", "x428"
const LINE_RE = /^(?:(\d[\d.,]*)\s*[×x]|[×x]\s*(\d[\d.,]*))\s+(.+?)\s*(?:\(.*\))?\s*$/i;
// "* Stone Bricks: 113,786" (Litematica-Liste), auch "Stone Bricks = 12" oder "Stone Bricks × 12"
// Litematica-Datei-Export als Tabelle: "| Stone Bricks | 113786 | 100 | 5 |"
const TABLE_RE = /^\|\s*([^|]*[a-z][^|]*?)\s*\|\s*(\d[\d.,' ]*)\s*\|/i;
const RULE_RE = /^[+\-=|\s]+$|^\|?\s*item\s*\|/i;
const NAME_FIRST_RE = /^(.*?[a-z].*?)\s*(?::|=|\s[×x])\s*(\d[\d.,' ]*\d|\d)\s*(?:\(.*\))?$/i;

/** "Flint & Steel" → "minecraft:flint_and_steel" */
export function nameToItemId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `minecraft:${slug}`;
}

export function parseMaterialList(text: string, knownIds?: Set<string>): MaterialList {
  const result: MaterialList = { title: null, info: null, items: [], skipped: [], unknown: [] };
  const byId = new Map<string, MaterialList["items"][number]>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(BULLET_RE, "").trim();
    if (!line || RULE_RE.test(line)) continue;

    const title = TITLE_RE.exec(line);
    if (title && result.title === null) {
      result.title = title[1].replace(/_/g, " ").replace(/\s+/g, " ").trim() || null;
      continue;
    }
    if (INFO_RE.test(line) && result.info === null) {
      result.info = line;
      continue;
    }

    const m = LINE_RE.exec(line);
    const n = m ? null : (TABLE_RE.exec(line) ?? NAME_FIRST_RE.exec(line));
    if (!m && !n) {
      result.skipped.push(line);
      continue;
    }
    const count = Number((m ? (m[1] ?? m[2]) : n![2]).replace(/[.,' ]/g, ""));
    const name = (m ? m[3] : n![1]).trim();
    if (!count || !name) {
      result.skipped.push(line);
      continue;
    }
    const itemId = nameToItemId(name);
    const existing = byId.get(itemId);
    if (existing) existing.count += count;
    else {
      const entry = { name, itemId, count };
      byId.set(itemId, entry);
      result.items.push(entry);
    }
  }

  if (knownIds) result.unknown = result.items.filter((i) => !knownIds.has(i.itemId));
  return result;
}

export interface MaterialBalance {
  itemId: string;
  needed: number;
  /** In Kisten dieses Projekts. */
  inProject: number;
  /** Im Allgemeingut verfügbar. */
  inCommon: number;
  /** Fehlt noch, nachdem Projekt- und Allgemein-Bestand angerechnet sind. */
  missing: number;
}

/** Abgleich benötigt vs. vorhanden: zuerst Projektkisten, dann Allgemeingut. */
export function balanceMaterials(
  needed: { itemId: string; count: number }[],
  projectStock: Map<string, number>,
  commonStock: Map<string, number>,
): MaterialBalance[] {
  return needed.map(({ itemId, count }) => {
    const inProject = projectStock.get(itemId) ?? 0;
    const inCommon = commonStock.get(itemId) ?? 0;
    return { itemId, needed: count, inProject, inCommon, missing: Math.max(count - inProject - inCommon, 0) };
  });
}
