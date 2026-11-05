import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StockRow } from "@mc/core";
import type { Actions, PlayerStatsRow, Project, Snapshot, TakeRow } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) client = createClient(url!, anonKey!);
  return client;
}

async function all<T>(table: string, columns = "*"): Promise<T[]> {
  // PostgREST liefert standardmäßig max. 1000 Zeilen, deshalb seitenweise
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase().from(table).select(columns).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function loadScans() {
  const recent = (cols: string) => supabase().from("scan_requests").select(cols).order("requested_at", { ascending: false }).limit(5);
  const res = await recent("id, requested_at, finished_at, result, kind");
  // Spalte "kind" fehlt noch (SQL nicht ausgeführt): ohne sie laden
  return res.error?.code === "42703" ? recent("id, requested_at, finished_at, result") : res;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [players, containers, stock, zones, status, scans, hidden, landmarks, labels] = await Promise.all([
    all<Snapshot["players"][number]>("players", "uuid, name, online, last_seen"),
    all<Snapshot["containers"][number]>("containers", "id, dimension, x, y, z, kind, custom_name, owner_type, owner_key, owner_label"),
    all<StockRow>("stock_items", "source_kind, source_id, owner_type, owner_key, owner_label, item_id, count"),
    all<Snapshot["zones"][number]>("zones"),
    all<NonNullable<Snapshot["status"]>>("collector_status", "heartbeat_at, mode, message"),
    loadScans(),
    supabase().from("container_hidden").select("container_id"),
    // Ebenso: ohne Tabelle einfach keine Landmarks
    supabase().from("landmarks").select("id, name, color, x, z, created_by").order("name"),
    // Ohne Tabelle (SQL noch nicht ausgeführt) einfach keine Anzeigenamen
    supabase().from("container_labels").select("container_id, label"),
  ]);
  const labelMap = Object.fromEntries((labels.data ?? []).map((r) => [r.container_id as string, r.label as string]));
  return {
    players, containers: containers.map((c) => ({ ...c, label: labelMap[c.id] ?? null })), stock, zones, landmarks: landmarks.data ?? [], status: status[0] ?? null, scans: (scans.data ?? []) as unknown as Snapshot["scans"],
    hidden: (hidden.data ?? []).map((r) => r.container_id as string),
    labels: labelMap,
  };
}

/** Ruft `onChange` auf, wenn sich Bestände, Spieler, Status oder Zuordnungen ändern. */
export function subscribeChanges(onChange: () => void): () => void {
  const channel = supabase().channel("tracker");
  for (const table of ["stock_items", "players", "collector_status", "scan_requests", "container_claims", "container_hidden", "container_labels", "landmarks", "zones"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return () => {
    supabase().removeChannel(channel);
  };
}

async function ok(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q;
  if (error) throw error;
}

const PROJECT_COLS = "id, name, created_by, build_project_items(item_id, quantity, added_at), build_project_sources(container_id, owner_key)";

/** Fehlt die Tabelle noch, sagt die Meldung, was zu tun ist; RLS-Fehler werden verständlich. */
function projectError(e: { code?: string; message: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST200") return new Error("Die Tabellen für Projekte fehlen noch. Das SQL dafür muss einmal in Supabase laufen.");
  if (e.code === "42501") return new Error("Das darfst du nicht. Löschen kann nur, wer das Projekt angelegt hat, oder ein Admin.");
  return new Error(e.message);
}
async function projectOk(q: PromiseLike<{ error: { code?: string; message: string } | null }>) {
  const { error } = await q;
  if (error) throw projectError(error);
}

interface ProjectRecord {
  id: number;
  name: string;
  created_by: string | null;
  build_project_items: { item_id: string; quantity: number; added_at: string }[];
  build_project_sources: { container_id: string | null; owner_key: string | null }[];
}

/** Fehlt die Tabelle noch, sagt die Meldung, was zu tun ist; RLS-Fehler werden verständlich. */
async function landmarkOk(q: PromiseLike<{ error: { code?: string; message: string } | null }>) {
  const { error } = await q;
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205") throw new Error("Die Tabelle für Landmarks fehlt noch. Das SQL dafür muss einmal in Supabase laufen.");
  if (error.code === "42501") throw new Error("Das darfst du nicht. Ändern und löschen kann nur, wer das Landmark gesetzt hat, oder ein Admin.");
  throw new Error(error.message);
}

export function supabaseActions(refresh: () => void): Actions {
  const db = () => supabase();
  const after = async (q: PromiseLike<{ error: unknown }>) => {
    await ok(q);
    refresh();
  };
  return {
    requestScan: async (kind = "scan") => {
      const { error } = await db().from("scan_requests").insert(kind === "map" ? { kind } : {});
      if (error?.code === "42703" || error?.code === "PGRST204") throw new Error("Die Spalte für Kartenanfragen fehlt noch. Das SQL dafür muss einmal in Supabase laufen.");
      if (error?.code === "42501") throw new Error("Nur Admins dürfen die Karte neu zeichnen lassen.");
      if (error) throw error;
      refresh();
    },
    addZone: (z) => after(db().from("zones").insert(z)),
    removeZone: (id) => after(db().from("zones").delete().eq("id", id)),
    addLandmark: async (l) => {
      await landmarkOk(db().from("landmarks").insert(l));
      refresh();
    },
    updateLandmark: async (id, l) => {
      // Ohne Recht liefert ein Update einfach 0 Zeilen, deshalb die Zeile zurückverlangen
      const { data, error } = await db().from("landmarks").update(l).eq("id", id).select("id");
      await landmarkOk(Promise.resolve({ error: error ?? (data?.length ? null : { code: "42501", message: "" }) }));
      refresh();
    },
    removeLandmark: async (id) => {
      const { data, error } = await db().from("landmarks").delete().eq("id", id).select("id");
      await landmarkOk(Promise.resolve({ error: error ?? (data?.length ? null : { code: "42501", message: "" }) }));
      refresh();
    },
    listProjects: async () => {
      const { data, error } = await db().from("build_projects").select(PROJECT_COLS).order("created_at").order("id");
      if (error) throw projectError(error);
      return ((data ?? []) as unknown as ProjectRecord[]).map(
        (p): Project => ({
          id: p.id,
          name: p.name,
          created_by: p.created_by,
          items: [...p.build_project_items].sort((a, b) => a.added_at.localeCompare(b.added_at)).map(({ item_id, quantity }) => ({ item_id, quantity })),
          containers: p.build_project_sources.flatMap((s) => (s.container_id ? [s.container_id] : [])),
          owners: p.build_project_sources.flatMap((s) => (s.owner_key ? [s.owner_key] : [])),
        }),
      );
    },
    subscribeProjects: (onChange) => {
      const channel = db().channel("projects");
      for (const table of ["build_projects", "build_project_items", "build_project_sources"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
      }
      channel.subscribe();
      return () => {
        db().removeChannel(channel);
      };
    },
    createProject: async (name) => {
      const { data, error } = await db().from("build_projects").insert({ name }).select("id").single();
      if (error) throw projectError(error);
      return (data as { id: number }).id;
    },
    renameProject: (id, name) => projectOk(db().from("build_projects").update({ name }).eq("id", id)),
    deleteProject: async (id) => {
      // Ohne Recht liefert ein Delete einfach 0 Zeilen, deshalb die Zeile zurückverlangen
      const { data, error } = await db().from("build_projects").delete().eq("id", id).select("id");
      if (error || !data?.length) throw projectError(error ?? { code: "42501", message: "" });
    },
    setProjectItem: (id, itemId, quantity) =>
      projectOk(
        quantity > 0
          ? db().from("build_project_items").upsert({ project_id: id, item_id: itemId, quantity }, { onConflict: "project_id,item_id", ignoreDuplicates: false })
          : db().from("build_project_items").delete().eq("project_id", id).eq("item_id", itemId),
      ),
    setProjectItems: async (id, items) => {
      const rows = items.filter((i) => i.quantity > 0).map((i) => ({ project_id: id, item_id: i.item_id, quantity: i.quantity }));
      if (rows.length) await projectOk(db().from("build_project_items").upsert(rows, { onConflict: "project_id,item_id", ignoreDuplicates: false }));
    },
    setProjectSource: async (id, source, on) => {
      const [col, value] = "container" in source ? (["container_id", source.container] as const) : (["owner_key", source.owner] as const);
      if (!on) return projectOk(db().from("build_project_sources").delete().eq("project_id", id).eq(col, value));
      const { error } = await db().from("build_project_sources").insert({ project_id: id, [col]: value });
      if (error && error.code !== "23505") throw projectError(error); // schon dabei
    },
    claimContainer: async (id, mine) => {
      const { error } = await db().rpc("claim_container", { p_container: id, p_mine: mine });
      if (error) throw new Error(error.message);
      refresh();
    },
    claimCommon: async (id) => {
      const { error } = await db().rpc("claim_container_common", { p_container: id });
      if (error) throw new Error(error.message);
      refresh();
    },
    hideContainer: async (id, hidden) => {
      const { error } = await db().rpc("hide_container", { p_container: id, p_hidden: hidden });
      if (error) throw new Error(error.message);
      refresh();
    },
    renameContainer: async (id, label) => {
      const { error } = await db().rpc("rename_container", { p_container: id, p_label: label });
      if (error?.code === "PGRST202") throw new Error("Umbenennen fehlt noch in der Datenbank. Das SQL dafür muss einmal in Supabase laufen.");
      if (error) throw new Error(error.message);
      refresh();
    },
    listTakes: async () => {
      const { data, error } = await db().from("container_takes").select("*").order("taken_at", { ascending: false }).limit(500);
      if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("Die Tabelle für Entnahmen fehlt noch. Das SQL dafür muss einmal in Supabase laufen.");
      if (error) throw new Error(error.message);
      return (data ?? []) as TakeRow[];
    },
    subscribeTakes: (onChange) => {
      const channel = db().channel("takes").on("postgres_changes", { event: "*", schema: "public", table: "container_takes" }, onChange);
      channel.subscribe();
      return () => {
        db().removeChannel(channel);
      };
    },
    deleteTake: async (id) => {
      const { data, error } = await db().from("container_takes").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("Das darfst du nicht. Löschen kann nur der Besitzer der Kiste oder ein Admin.");
    },
    listStats: async () => {
      const { data, error } = await db().from("player_stats").select("uuid, name, stats, updated_at");
      if (error?.code === "42P01" || error?.code === "PGRST205") throw new Error("Die Tabelle für Statistiken fehlt noch. Das SQL dafür muss einmal in Supabase laufen.");
      if (error) throw new Error(error.message);
      return (data ?? []) as PlayerStatsRow[];
    },
    subscribeStats: (onChange) => {
      const channel = db().channel("stats").on("postgres_changes", { event: "*", schema: "public", table: "player_stats" }, onChange);
      channel.subscribe();
      return () => {
        db().removeChannel(channel);
      };
    },
  };
}
