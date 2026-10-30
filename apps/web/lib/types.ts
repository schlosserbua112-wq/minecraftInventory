import type { OwnerType, StockRow } from "@mc/core";

export interface PlayerRow { uuid: string; name: string; online: boolean; last_seen: string | null }
export interface ContainerRow {
  id: string; dimension: string; x: number; y: number; z: number; kind: string;
  custom_name: string | null; owner_type: OwnerType | null; owner_key: string | null; owner_label: string | null;
}
export interface ZoneRow { id: number; name: string; dimension: string; center_x: number; center_z: number; radius: number; is_main: boolean }
/** Benannter, farbiger Punkt auf der Karte, für alle sichtbar. */
export interface LandmarkRow { id: number; name: string; color: string; x: number; z: number; created_by: string | null }
export type LandmarkInput = Pick<LandmarkRow, "name" | "color" | "x" | "z">;
export interface StatusRow { heartbeat_at: string; mode: string | null; message: string | null }
export interface ScanRow { id: number; requested_at: string; finished_at: string | null; result: string | null; kind?: "scan" | "map" }
/** Projekt: benötigte Items und die Kisten, deren Inhalt dazu zählt. Für alle sichtbar. */
export interface Project {
  id: number;
  name: string;
  created_by: string | null;
  items: { item_id: string; quantity: number }[];
  /** Einzelne Kisten (Kisten-IDs) */
  containers: string[];
  /** Spieler (Kontoname klein), deren Kisten alle zählen */
  owners: string[];
}

/** Entnahme aus einer Spielerkiste durch jemand anderen, vom Sammler geschätzt. Sichtbar für Besitzer und Admins. */
export interface TakeRow {
  id: number;
  taken_at: string;
  container_id: string;
  owner_key: string;
  owner_label: string;
  item_id: string;
  count: number;
  suspects: string[];
  confidence: "sicher" | "wahrscheinlich" | "möglich";
  distance: number | null;
}

export interface Snapshot {
  players: PlayerRow[];
  containers: ContainerRow[];
  stock: StockRow[];
  zones: ZoneRow[];
  landmarks: LandmarkRow[];
  status: StatusRow | null;
  scans: ScanRow[];
  /** Admin-Schalter: unbenannte Kisten auf der Website zeigen und per „Meine“ zuordnen lassen. */
  showUnnamed: boolean;
  /** Als „keine Spielerkiste“ ausgeblendete unbenannte Kisten (Kisten-IDs). */
  hidden: string[];
}

export interface Actions {
  /** "map": Weltkarte sofort neu zeichnen lassen (nur Admins) */
  requestScan(kind?: "scan" | "map"): Promise<void>;
  addZone(z: Omit<ZoneRow, "id">): Promise<void>;
  removeZone(id: number): Promise<void>;
  addLandmark(l: LandmarkInput): Promise<void>;
  updateLandmark(id: number, l: LandmarkInput): Promise<void>;
  removeLandmark(id: number): Promise<void>;
  listProjects(): Promise<Project[]>;
  /** Ruft `onChange` auf, wenn jemand ein Projekt ändert. */
  subscribeProjects(onChange: () => void): () => void;
  /** Legt ein leeres Projekt an und liefert seine id. */
  createProject(name: string): Promise<number>;
  renameProject(id: number, name: string): Promise<void>;
  deleteProject(id: number): Promise<void>;
  /** Menge setzen; 0 entfernt das Item aus dem Projekt. */
  setProjectItem(id: number, itemId: string, quantity: number): Promise<void>;
  /** Kiste oder Spieler zum Bestand des Projekts zählen (true) oder nicht mehr (false). */
  setProjectSource(id: number, source: { container: string } | { owner: string }, on: boolean): Promise<void>;
  /** Unbenannte Kiste als „Meine“ (true) oder „Nicht meine“ (false) markieren. */
  claimContainer(id: string, mine: boolean): Promise<void>;
  /** Unbenannte Kiste der Allgemeinheit zuordnen; aufheben geht mit `claimContainer(id, false)`. */
  claimCommon(id: string): Promise<void>;
  setShowUnnamed(on: boolean): Promise<void>;
  /** Unbenannte Kiste ausblenden (true) oder wieder einblenden (false). */
  hideContainer(id: string, hidden: boolean): Promise<void>;
  /** Entnahmen aus den eigenen Kisten (Admins: aus allen), neueste zuerst. */
  listTakes(): Promise<TakeRow[]>;
  subscribeTakes(onChange: () => void): () => void;
  /** Eintrag als erledigt entfernen. */
  deleteTake(id: number): Promise<void>;
}

