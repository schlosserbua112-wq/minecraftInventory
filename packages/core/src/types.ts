/** Wem ein Bestand gehört (siehe Namensregeln im Planungsdokument). */
export type OwnerType = "player" | "common" | "project" | "unassigned";

export interface Owner {
  type: OwnerType;
  /** Normalisierter Schlüssel (klein geschrieben), z. B. "max", "burg", "allgemein". */
  key: string;
  /** Anzeigename, z. B. "Max", "Burg", "Allgemein". */
  label: string;
}

/**
 * Ein Item-Stack, wie ihn der Sammler aus NBT/SNBT normalisiert.
 * `components` entspricht dem Item-Komponenten-Format (ab 1.20.5),
 * `tag` dem alten Format. Welche Variante 26.3 nutzt, wird an echten Dateien geprüft.
 */
export interface ItemStack {
  id: string;
  count: number;
  components?: Record<string, unknown>;
  tag?: Record<string, unknown>;
}

export type ContainerKind = "chest" | "trapped_chest" | "barrel" | "shulker_box";

export interface ContainerSnapshot {
  /** Stabile ID aus Dimension und Koordinaten, siehe `containerId`. */
  id: string;
  dimension: string;
  x: number;
  y: number;
  z: number;
  kind: ContainerKind;
  /** Klartext des Amboss-Namens, `null` wenn unbenannt. */
  customName: string | null;
  items: ItemStack[];
}

export interface PlayerSnapshot {
  uuid: string;
  name: string;
  online: boolean;
  inventory: ItemStack[];
  enderChest: ItemStack[];
}

export type SourceKind = "inventory" | "enderchest" | "container";

/** Eine Zeile der Tabelle `stock_items`. */
export interface StockRow {
  source_kind: SourceKind;
  source_id: string;
  owner_type: OwnerType;
  owner_key: string;
  owner_label: string;
  item_id: string;
  count: number;
}
