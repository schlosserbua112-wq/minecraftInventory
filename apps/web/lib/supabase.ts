import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StockRow } from "@mc/core";
import type { Actions, HistoryRow, Snapshot } from "./types";

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

export async function loadSnapshot(): Promise<Snapshot> {
  const [players, containers, stock, zones, projects, goals, tasks, status, scans, settings] = await Promise.all([
    all<Snapshot["players"][number]>("players", "uuid, name, online, last_seen"),
    all<Snapshot["containers"][number]>("containers", "id, dimension, x, y, z, kind, custom_name, owner_type, owner_key, owner_label"),
    all<StockRow>("stock_items", "source_kind, source_id, owner_type, owner_key, owner_label, item_id, count"),
    all<Snapshot["zones"][number]>("zones"),
    all<Snapshot["projects"][number]>("projects", "key, label"),
    all<Snapshot["goals"][number]>("project_goals"),
    all<Snapshot["tasks"][number]>("project_tasks", "id, project_key, title, assignee, status, position"),
    all<NonNullable<Snapshot["status"]>>("collector_status", "heartbeat_at, mode, message"),
    supabase().from("scan_requests").select("id, requested_at, finished_at, result").order("requested_at", { ascending: false }).limit(5),
    // Fehlt die Tabelle noch (SQL nicht ausgeführt), bleibt der Schalter einfach aus
    supabase().from("app_settings").select("show_unnamed").eq("id", 1).maybeSingle(),
  ]);
  return {
    players, containers, stock, zones, projects, goals, tasks, status: status[0] ?? null, scans: scans.data ?? [],
    showUnnamed: Boolean(settings.data?.show_unnamed),
  };
}

/** Ruft `onChange` auf, wenn sich Bestände, Spieler, Status oder Aufgaben ändern. */
export function subscribeChanges(onChange: () => void): () => void {
  const channel = supabase().channel("tracker");
  for (const table of ["stock_items", "players", "collector_status", "scan_requests", "project_tasks", "app_settings", "container_claims"]) {
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

export function supabaseActions(refresh: () => void): Actions {
  const db = () => supabase();
  const after = async (q: PromiseLike<{ error: unknown }>) => {
    await ok(q);
    refresh();
  };
  return {
    requestScan: () => after(db().from("scan_requests").insert({})),
    addZone: (z) => after(db().from("zones").insert(z)),
    removeZone: (id) => after(db().from("zones").delete().eq("id", id)),
    addProject: async (label) => {
      const key = label.trim().toLowerCase();
      await after(db().from("projects").upsert({ key, label: label.trim() }, { onConflict: "key", ignoreDuplicates: true }));
      return key;
    },
    setGoals: async (projectKey, goals, mode, rawText) => {
      if (mode === "replace") await ok(db().from("project_goals").delete().eq("project_key", projectKey));
      let rows = goals;
      if (mode === "add") {
        const { data, error } = await db().from("project_goals").select("item_id, target").eq("project_key", projectKey);
        if (error) throw error;
        const have = new Map((data ?? []).map((g) => [g.item_id as string, g.target as number]));
        rows = goals.map((g) => ({ ...g, target: g.target + (have.get(g.item_id) ?? 0) }));
      }
      await ok(db().from("project_goals").upsert(rows.map((g) => ({ project_key: projectKey, ...g }))));
      if (rawText) await ok(db().from("material_lists").insert({ project_key: projectKey, raw_text: rawText }));
      refresh();
    },
    removeGoal: (projectKey, itemId) => after(db().from("project_goals").delete().match({ project_key: projectKey, item_id: itemId })),
    addTask: (t) => after(db().from("project_tasks").insert(t)),
    updateTask: (id, patch) => after(db().from("project_tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)),
    removeTask: (id) => after(db().from("project_tasks").delete().eq("id", id)),
    loadHistory: async (itemId, days) => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await db()
        .from("stock_history")
        .select("taken_at, owner_type, owner_key, item_id, count")
        .eq("item_id", itemId)
        .gte("taken_at", since)
        .order("taken_at");
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
    claimContainer: async (id, mine) => {
      const { error } = await db().rpc("claim_container", { p_container: id, p_mine: mine });
      if (error) throw new Error(error.message);
      refresh();
    },
    setShowUnnamed: (on) => after(db().from("app_settings").update({ show_unnamed: on }).eq("id", 1)),
  };
}
