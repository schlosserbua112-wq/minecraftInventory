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
export interface ScanRow { id: number; requested_at: string; finished_at: string | null; result: string | null }
/** Eigenes Verlauf-Dashboard: gewählte Items und Zeitraum, je Benutzer gespeichert. */
export interface Dashboard { id: number; name: string; items: string[]; days: number; position: number }
export interface HistoryRow { taken_at: string; owner_type: OwnerType; owner_key: string; item_id: string; count: number }

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
}

export interface Actions {
  requestScan(): Promise<void>;
  addZone(z: Omit<ZoneRow, "id">): Promise<void>;
  removeZone(id: number): Promise<void>;
  addLandmark(l: LandmarkInput): Promise<void>;
  updateLandmark(id: number, l: LandmarkInput): Promise<void>;
  removeLandmark(id: number): Promise<void>;
  loadHistory(itemId: string, days: number): Promise<HistoryRow[]>;
  listDashboards(): Promise<Dashboard[]>;
  /** Anlegen (ohne id) oder ändern; liefert das gespeicherte Dashboard. */
  saveDashboard(d: Omit<Dashboard, "id"> & { id?: number }): Promise<Dashboard>;
  deleteDashboard(id: number): Promise<void>;
  /** Unbenannte Kiste als „Meine“ (true) oder „Nicht meine“ (false) markieren. */
  claimContainer(id: string, mine: boolean): Promise<void>;
  setShowUnnamed(on: boolean): Promise<void>;
}

