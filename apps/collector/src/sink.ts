import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { COMMON_CLAIM, regionOf, type AggregateResult, type ContainerSnapshot, type PlayerSnapshot, type StockRow, type TakeConfidence, type TakeEvent } from "@mc/core";

/** Ziel für die gesammelten Daten. */
export interface Sink {
  write(players: PlayerSnapshot[], containers: ContainerSnapshot[], result: AggregateResult, historyMinutes?: number): Promise<void>;
  heartbeat(mode: string, message?: string, extra?: HeartbeatExtra): Promise<void>;
  /** Offene "Jetzt suchen"-Anfragen abholen und als gestartet markieren. */
  takeScanRequests(): Promise<number[]>;
  finishScanRequests(ids: number[], result: string): Promise<void>;
  /** Zonen aus der Verwaltung der Website. */
  loadZones(): Promise<Zone[]>;
  /** Kontonamen und Aliase, klein geschrieben → Kontoname. */
  loadOwners(): Promise<Map<string, string>>;
  /** Website-Schalter für unbenannte Kisten und „Meine“-Markierungen (Kisten-ID → Kontoname). */
  loadUnnamed(): Promise<UnnamedState>;
  /** Entnahmen aus fremden Kisten speichern. Fehler werden nur gemeldet, die Runde läuft weiter. */
  writeTakes(events: TakeEvent[]): Promise<void>;
}

export interface UnnamedState {
  show: boolean;
  claims: Map<string, string>;
  /** Auf der Website als „keine Spielerkiste“ ausgeblendet. */
  hidden: Set<string>;
}

export interface HeartbeatExtra {
  last_zone_scan_at?: string;
  last_full_scan_at?: string;
}

export interface Zone {
  name: string;
  dimension: string;
  center_x: number;
  center_z: number;
  radius: number;
}

const key = (r: Pick<StockRow, "source_kind" | "source_id" | "item_id">) => `${r.source_kind}|${r.source_id}|${r.item_id}`;

/** Schreibt nach Supabase und schickt nur Änderungen seit dem letzten Lauf. */
export class SupabaseSink implements Sink {
  private db: SupabaseClient;
  private last = new Map<string, StockRow>();
  private lastHistorySlot = "";
  /** Unbenannte Kisten aus dem letzten Lauf, um verschwundene aus `containers` zu löschen. */
  private lastUnnamed: string | null = null;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async init() {
    // Startzustand laden, damit nach einem Neustart nur echte Änderungen geschrieben werden
    const { data, error } = await this.db.from("stock_items").select("source_kind, source_id, owner_type, owner_key, owner_label, item_id, count");
    if (error) throw error;
    for (const r of data as StockRow[]) this.last.set(key(r), r);
  }

  async write(players: PlayerSnapshot[], containers: ContainerSnapshot[], result: AggregateResult, historyMinutes = 60) {
    const now = new Date().toISOString();

    await this.check(
      this.db.from("players").upsert(
        players.map((p) => ({ uuid: p.uuid, name: p.name, online: p.online, last_seen: p.online ? now : undefined, updated_at: now })),
        { onConflict: "uuid" },
      ),
    );

    const named = containers.filter((c) => result.owners.has(c.id));
    if (named.length) {
      await this.check(
        this.db.from("containers").upsert(
          named.map((c) => {
            const o = result.owners.get(c.id)!;
            return {
              id: c.id, dimension: c.dimension, x: c.x, y: c.y, z: c.z, kind: c.kind, custom_name: c.customName,
              owner_type: o.type, owner_key: o.key, owner_label: o.label, region: regionOf(c.x, c.z).file, last_seen_at: now,
            };
          }),
        ),
      );
    }

    // Unbenannte Kisten, die nicht mehr zählen (Schalter aus, abgebaut, leer), aus der Kistenliste nehmen
    const unnamedIds = named.filter((c) => !c.customName).map((c) => c.id).sort();
    const unnamedKey = unnamedIds.join(",");
    if (unnamedKey !== this.lastUnnamed) {
      let q = this.db.from("containers").delete().is("custom_name", null);
      if (unnamedIds.length) q = q.not("id", "in", `(${unnamedIds.map((id) => `"${id}"`).join(",")})`);
      await this.check(q);
      this.lastUnnamed = unnamedKey;
    }

    const next = new Map(result.rows.map((r) => [key(r), r]));
    const changed = result.rows.filter((r) => {
      const prev = this.last.get(key(r));
      return !prev || prev.count !== r.count || prev.owner_key !== r.owner_key || prev.owner_type !== r.owner_type;
    });
    const removed = [...this.last.values()].filter((r) => !next.has(key(r)));

    if (changed.length) {
      await this.check(this.db.from("stock_items").upsert(changed.map((r) => ({ ...r, updated_at: now }))));
    }
    for (const r of removed) {
      await this.check(
        this.db.from("stock_items").delete().match({ source_kind: r.source_kind, source_id: r.source_id, item_id: r.item_id }),
      );
    }
    this.last = next;

    await this.writeHistory(result.rows, historyMinutes);
    console.log(`[sink] ${changed.length} geändert, ${removed.length} entfernt, ${result.unassigned.length} nicht zugeordnet`);
  }

  /** Alle `minutes` Minuten eine Summe je Besitzer und Item (auf volle Abschnitte gerundet). */
  private async writeHistory(rows: StockRow[], minutes: number) {
    const slot = minutes * 60_000;
    const stamp = new Date(Math.floor(Date.now() / slot) * slot).toISOString();
    if (stamp === this.lastHistorySlot) return;
    const sums = new Map<string, { owner_type: string; owner_key: string; item_id: string; count: number }>();
    for (const r of rows) {
      const k = `${r.owner_type}|${r.owner_key}|${r.item_id}`;
      const s = sums.get(k) ?? { owner_type: r.owner_type, owner_key: r.owner_key, item_id: r.item_id, count: 0 };
      s.count += r.count;
      sums.set(k, s);
    }
    await this.check(this.db.from("stock_history").upsert([...sums.values()].map((s) => ({ ...s, taken_at: stamp }))));
    this.lastHistorySlot = stamp;
  }

  async heartbeat(mode: string, message?: string, extra: HeartbeatExtra = {}) {
    const now = new Date().toISOString();
    await this.check(
      this.db.from("collector_status").upsert({ id: 1, heartbeat_at: now, last_live_poll_at: now, mode, message: message ?? null, version: "0.2.0", ...extra }),
    );
  }

  async takeScanRequests() {
    const { data, error } = await this.db.from("scan_requests").select("id").is("started_at", null);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id as number);
    if (ids.length) await this.check(this.db.from("scan_requests").update({ started_at: new Date().toISOString() }).in("id", ids));
    return ids;
  }

  async finishScanRequests(ids: number[], result: string) {
    if (!ids.length) return;
    await this.check(this.db.from("scan_requests").update({ finished_at: new Date().toISOString(), result }).in("id", ids));
  }

  async loadZones() {
    const { data, error } = await this.db.from("zones").select("name, dimension, center_x, center_z, radius");
    if (error) throw error;
    return (data ?? []) as Zone[];
  }

  async loadOwners() {
    const { data, error } = await this.db.from("profiles").select("username, aliases");
    if (error) throw error;
    const m = new Map<string, string>();
    for (const p of (data ?? []) as { username: string; aliases: string[] | null }[]) {
      m.set(p.username.toLowerCase(), p.username);
      for (const a of p.aliases ?? []) m.set(a.toLowerCase(), p.username);
    }
    return m;
  }

  async loadUnnamed() {
    const [settings, claims, hidden] = await Promise.all([
      this.db.from("app_settings").select("show_unnamed").eq("id", 1).maybeSingle(),
      this.db.from("container_claims").select("*, profiles(username)"),
      this.db.from("container_hidden").select("container_id"),
    ]);
    // Tabellen fehlen noch (SQL nicht ausgeführt): Funktion bleibt aus, Sammler läuft weiter
    if (settings.error || claims.error) return { show: false, claims: new Map<string, string>(), hidden: new Set<string>() };
    const m = new Map<string, string>();
    for (const c of (claims.data ?? []) as unknown as { container_id: string; common?: boolean; profiles: { username: string } | null }[]) {
      if (c.common) m.set(c.container_id, COMMON_CLAIM);
      else if (c.profiles) m.set(c.container_id, c.profiles.username);
    }
    const h = new Set(hidden.error ? [] : (hidden.data ?? []).map((r) => r.container_id as string));
    return { show: Boolean(settings.data?.show_unnamed), claims: m, hidden: h };
  }

  /**
   * Wer in mehreren Abfragen hintereinander aus derselben Kiste dasselbe Item nimmt, landet in einer Zeile.
   * Schlüssel Kiste|Item|Verdächtiger → Zeile in container_takes.
   */
  private recentTakes = new Map<string, { id: number; count: number; confidence: TakeConfidence; at: number }>();
  private takesWarned = false;

  async writeTakes(events: TakeEvent[]) {
    const rank: Record<TakeConfidence, number> = { möglich: 0, wahrscheinlich: 1, sicher: 2 };
    const now = Date.now();
    for (const [k, v] of this.recentTakes) if (now - v.at > 5 * 60_000) this.recentTakes.delete(k);
    try {
      for (const e of events) {
        const k = `${e.container_id}|${e.item_id}|${e.suspects[0]}`;
        const prev = this.recentTakes.get(k);
        const taken_at = new Date(now).toISOString();
        if (prev) {
          const confidence = rank[e.confidence] > rank[prev.confidence] ? e.confidence : prev.confidence;
          await this.check(this.db.from("container_takes").update({ count: prev.count + e.count, confidence, taken_at }).eq("id", prev.id));
          this.recentTakes.set(k, { id: prev.id, count: prev.count + e.count, confidence, at: now });
          continue;
        }
        const { data, error } = await this.db.from("container_takes").insert({ ...e, taken_at }).select("id").single();
        if (error) throw error;
        this.recentTakes.set(k, { id: (data as { id: number }).id, count: e.count, confidence: e.confidence, at: now });
      }
      console.log(`[sink] ${events.length} Entnahmen aus fremden Kisten`);
      this.takesWarned = false;
    } catch (err) {
      // Tabelle fehlt noch (SQL nicht ausgeführt): einmal melden, Bestände laufen weiter
      if (!this.takesWarned) console.warn(`[sink] Entnahmen nicht gespeichert: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      this.takesWarned = true;
    }
  }

  private async check(q: PromiseLike<{ error: unknown }>) {
    const { error } = await q;
    if (error) throw error;
  }
}

/** Ohne Supabase-Zugang: nur auf der Konsole zusammenfassen. */
export class ConsoleSink implements Sink {
  async write(_p: PlayerSnapshot[], _c: ContainerSnapshot[], result: AggregateResult) {
    const total = result.rows.reduce((n, r) => n + r.count, 0);
    console.log(`[console] ${result.rows.length} Zeilen, ${total} Items, ${result.unassigned.length} nicht zugeordnet`);
  }
  async heartbeat() {}
  async takeScanRequests() {
    return [];
  }
  async finishScanRequests() {}
  /** Ohne Supabase: Zonen aus ZONES (JSON) oder eine Testzone um 0/0. */
  async loadZones(): Promise<Zone[]> {
    if (process.env.ZONES) return JSON.parse(process.env.ZONES) as Zone[];
    return [{ name: "Test", dimension: "minecraft:overworld", center_x: 0, center_z: 0, radius: 256 }];
  }
  async loadOwners() {
    return new Map<string, string>();
  }
  async loadUnnamed() {
    return { show: false, claims: new Map<string, string>(), hidden: new Set<string>() };
  }
  async writeTakes(events: TakeEvent[]) {
    for (const e of events) console.log(`[console] Entnahme: ${e.count}× ${e.item_id} aus ${e.container_id} (${e.owner_label}), ${e.confidence}: ${e.suspects.join(", ")}`);
  }
}
