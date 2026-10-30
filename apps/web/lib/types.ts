import type { OwnerType, StockRow } from "@mc/core";

export interface PlayerRow { uuid: string; name: string; online: boolean; last_seen: string | null }
export interface ContainerRow {
  id: string; dimension: string; x: number; y: number; z: number; kind: string;
  custom_name: string | null; owner_type: OwnerType | null; owner_key: string | null; owner_label: string | null;
}
export interface ZoneRow { id: number; name: string; dimension: string; center_x: number; center_z: number; radius: number; is_main: boolean }
export interface ProjectRow { key: string; label: string }
export interface GoalRow { project_key: string; item_id: string; target: number }
export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export interface TaskRow { id: number; project_key: string; title: string; assignee: string | null; status: TaskStatus; position: number }
export interface StatusRow { heartbeat_at: string; mode: string | null; message: string | null }
export interface ScanRow { id: number; requested_at: string; finished_at: string | null; result: string | null }
export interface HistoryRow { taken_at: string; owner_type: OwnerType; owner_key: string; item_id: string; count: number }

export interface Snapshot {
  players: PlayerRow[];
  containers: ContainerRow[];
  stock: StockRow[];
  zones: ZoneRow[];
  projects: ProjectRow[];
  goals: GoalRow[];
  tasks: TaskRow[];
  status: StatusRow | null;
  scans: ScanRow[];
}

export interface Actions {
  requestScan(): Promise<void>;
  addZone(z: Omit<ZoneRow, "id">): Promise<void>;
  removeZone(id: number): Promise<void>;
  addProject(label: string): Promise<string>;
  /** Ziele setzen: "replace" ersetzt alle Ziele des Projekts, "add" zählt dazu. */
  setGoals(projectKey: string, goals: { item_id: string; target: number }[], mode: "replace" | "add", rawText?: string): Promise<void>;
  removeGoal(projectKey: string, itemId: string): Promise<void>;
  addTask(t: Omit<TaskRow, "id" | "position">): Promise<void>;
  updateTask(id: number, patch: Partial<Omit<TaskRow, "id">>): Promise<void>;
  removeTask(id: number): Promise<void>;
  loadHistory(itemId: string, days: number): Promise<HistoryRow[]>;
}

export const TASK_STATUS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To-Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
];
