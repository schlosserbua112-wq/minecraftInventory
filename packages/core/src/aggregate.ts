import { classifyName } from "./names.js";
import { countItems } from "./items.js";
import type { ContainerSnapshot, Owner, PlayerSnapshot, StockRow } from "./types.js";

export interface AggregateResult {
  rows: StockRow[];
  /** Benannte Kisten, deren Name keiner Regel entspricht. */
  unassigned: ContainerSnapshot[];
  /** Zuordnung je Kiste (unbenannte fehlen). */
  owners: Map<string, Owner>;
}

function rowsFor(
  sourceKind: StockRow["source_kind"],
  sourceId: string,
  owner: Owner,
  items: ContainerSnapshot["items"],
): StockRow[] {
  return [...countItems(items)].map(([item_id, count]) => ({
    source_kind: sourceKind,
    source_id: sourceId,
    owner_type: owner.type,
    owner_key: owner.key,
    owner_label: owner.label,
    item_id,
    count,
  }));
}

/** Was mit unbenannten Kisten passiert, die Items enthalten (generierte Loot-Kisten zählen nie). */
export type UnnamedRule = "ignore" | "common" | "unassigned";

const UNNAMED_OWNER: Record<Exclude<UnnamedRule, "ignore">, Owner> = {
  common: { type: "common", key: "allgemein", label: "Allgemein" },
  unassigned: { type: "unassigned", key: "unbenannt", label: "Unbenannt" },
};

/** Macht aus Spieler- und Kisten-Snapshots die Zeilen für `stock_items`. */
/**
 * `owners`: Konten mit Aliasen, als Map von Name/Alias (klein geschrieben) auf den Kontonamen.
 * Ein Spieler, dessen Minecraft-Name ein Alias ist, gehört dann zum Konto.
 */
export function aggregate(
  players: PlayerSnapshot[],
  containers: ContainerSnapshot[],
  unnamed: UnnamedRule = "ignore",
  owners: ReadonlyMap<string, string> = new Map(),
): AggregateResult {
  const names = new Map<string, string>();
  for (const p of players) names.set(p.name.toLowerCase(), owners.get(p.name.toLowerCase()) ?? p.name);
  for (const [alias, label] of owners) names.set(alias, label);
  const rows: StockRow[] = [];
  const unassigned: ContainerSnapshot[] = [];
  const byContainer = new Map<string, Owner>();

  for (const p of players) {
    const label = names.get(p.name.toLowerCase())!;
    const owner: Owner = { type: "player", key: label.toLowerCase(), label };
    rows.push(...rowsFor("inventory", p.uuid, owner, p.inventory));
    rows.push(...rowsFor("enderchest", p.uuid, owner, p.enderChest));
  }

  for (const c of containers) {
    let owner = classifyName(c.customName, names);
    if (!owner && unnamed !== "ignore" && !c.generated && c.items.length) owner = UNNAMED_OWNER[unnamed];
    if (!owner) continue;
    byContainer.set(c.id, owner);
    if (owner.type === "unassigned" && c.customName) unassigned.push(c);
    rows.push(...rowsFor("container", c.id, owner, c.items));
  }

  return { rows, unassigned, owners: byContainer };
}
