import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { regionOf, type AggregateResult, type ContainerSnapshot, type PlayerSnapshot, type StockRow } from "@mc/core";

/** Ziel für die gesammelten Daten. */
export interface Sink {
  write(players: PlayerSnapshot[], containers: ContainerSnapshot[], result: AggregateResult, historyMinutes?: number): Promise<void>;
  heartbeat(mode: string, message?: string): Promise<void>;
  /** Offene "Jetzt suchen"-Anfragen abholen und als gestartet markieren. */
  takeScanRequests(): Promise<number[]>;
  finishScanRequests(ids: number[], result: string): Promise<void>;
}

const key = (r: Pick<StockRow, "source_kind" | "source_id" | "item_id">) => `${r.source_kind}|${r.source_id}|${r.item_id}`;

/** Schreibt nach Supabase und schickt nur Änderungen seit dem letzten Lauf. */
export class SupabaseSink implements Sink {
  private db: SupabaseClient;
  private last = new Map<string, StockRow>();
  private lastHistorySlot = "";

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

  async heartbeat(mode: string, message?: string) {
    const now = new Date().toISOString();
    await this.check(
      this.db.from("collector_status").upsert({ id: 1, heartbeat_at: now, last_live_poll_at: now, mode, message: message ?? null, version: "0.1.0" }),
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
}
