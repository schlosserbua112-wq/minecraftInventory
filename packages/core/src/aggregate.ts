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
export function aggregate(players: PlayerSnapshot[], containers: ContainerSnapshot[], unnamed: UnnamedRule = "ignore"): AggregateResult {
  const names = players.map((p) => p.name);
  const rows: StockRow[] = [];
  const unassigned: ContainerSnapshot[] = [];
  const owners = new Map<string, Owner>();

  for (const p of players) {
    const owner: Owner = { type: "player", key: p.name.toLowerCase(), label: p.name };
    rows.push(...rowsFor("inventory", p.uuid, owner, p.inventory));
    rows.push(...rowsFor("enderchest", p.uuid, owner, p.enderChest));
  }

  for (const c of containers) {
    let owner = classifyName(c.customName, names);
    if (!owner && unnamed !== "ignore" && !c.generated && c.items.length) owner = UNNAMED_OWNER[unnamed];
    if (!owner) continue;
    owners.set(c.id, owner);
    if (owner.type === "unassigned" && c.customName) unassigned.push(c);
    rows.push(...rowsFor("container", c.id, owner, c.items));
  }

  return { rows, unassigned, owners };
}
