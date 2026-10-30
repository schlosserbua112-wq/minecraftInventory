import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StockRow } from "@mc/core";
import type { Actions, Dashboard, HistoryRow, Snapshot } from "./types";

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
  const [players, containers, stock, zones, status, scans, settings] = await Promise.all([
    all<Snapshot["players"][number]>("players", "uuid, name, online, last_seen"),
    all<Snapshot["containers"][number]>("containers", "id, dimension, x, y, z, kind, custom_name, owner_type, owner_key, owner_label"),
    all<StockRow>("stock_items", "source_kind, source_id, owner_type, owner_key, owner_label, item_id, count"),
    all<Snapshot["zones"][number]>("zones"),
    all<NonNullable<Snapshot["status"]>>("collector_status", "heartbeat_at, mode, message"),
    supabase().from("scan_requests").select("id, requested_at, finished_at, result").order("requested_at", { ascending: false }).limit(5),
    // Fehlt die Tabelle noch (SQL nicht ausgeführt), bleibt der Schalter einfach aus
    supabase().from("app_settings").select("show_unnamed").eq("id", 1).maybeSingle(),
  ]);
  return {
    players, containers, stock, zones, status: status[0] ?? null, scans: scans.data ?? [],
    showUnnamed: Boolean(settings.data?.show_unnamed),
  };
}

/** Ruft `onChange` auf, wenn sich Bestände, Spieler, Status oder Einstellungen ändern. */
export function subscribeChanges(onChange: () => void): () => void {
  const channel = supabase().channel("tracker");
  for (const table of ["stock_items", "players", "collector_status", "scan_requests", "app_settings", "container_claims"]) {
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

const DASH_COLS = "id, name, items, days, position";

/** Fehlt die Tabelle noch, sagt die Meldung, was zu tun ist. */
function dashError(e: { code?: string; message: string }) {
  return e.code === "42P01" || e.code === "PGRST205" ? "Die Tabelle für Dashboards fehlt noch. Das SQL dafür muss einmal in Supabase laufen." : e.message;
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
    listDashboards: async () => {
      const { data, error } = await db().from("history_dashboards").select(DASH_COLS).order("position").order("id");
      if (error) throw new Error(dashError(error));
      return (data ?? []) as Dashboard[];
    },
    saveDashboard: async ({ id, ...d }) => {
      const q = id === undefined ? db().from("history_dashboards").insert(d) : db().from("history_dashboards").update(d).eq("id", id);
      const { data, error } = await q.select(DASH_COLS).single();
      if (error) throw new Error(dashError(error));
      return data as Dashboard;
    },
    deleteDashboard: async (id) => {
      const { error } = await db().from("history_dashboards").delete().eq("id", id);
      if (error) throw new Error(dashError(error));
    },
    claimContainer: async (id, mine) => {
      const { error } = await db().rpc("claim_container", { p_container: id, p_mine: mine });
      if (error) throw new Error(error.message);
      refresh();
    },
    setShowUnnamed: (on) => after(db().from("app_settings").update({ show_unnamed: on }).eq("id", 1)),
  };
}
