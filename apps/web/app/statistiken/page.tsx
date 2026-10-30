"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { totalDistance, type DistanceKind, type Ranked } from "@mc/core";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import { useItemNames } from "@/lib/itemicons";
import { hearts, km, METRICS, mobName, playTime, type Metric } from "@/lib/stats";
import type { PlayerStatsRow } from "@/lib/types";
import { listProfiles, type Profile } from "@/lib/users";

const DISTANCE_LABEL: Record<DistanceKind, string> = {
  walk: "Gehen und Klettern",
  sprint: "Sprinten",
  swim: "Schwimmen",
  fly: "Fliegen",
  ride: "Reiten, Boot, Lore",
  fall: "Gefallen",
};

/** Items im Besitz als zusätzliche Spalte; kommt aus den Beständen, nicht aus der Stats-Datei. */
const OWNED: Metric = { id: "owned", label: "Items im Besitz", value: () => 0, format: (n) => fmt.format(n) };

interface Line {
  row: PlayerStatsRow;
  online: boolean;
  owned: number;
}

/** Statistiken aller Spieler aus den Stats-Dateien des Servers: Rekorde, Vergleich und Einzelansicht. */
export default function StatsPage() {
  useItemNames();
  const { snapshot, actions, mode } = useData();
  const [rows, setRows] = useState<PlayerStatsRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sort, setSort] = useState("play");
  const [picked, setPicked] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const reload = useCallback(
    () =>
      actions
        .listStats()
        .then((list) => {
          setRows(list);
          setProblem(null);
        })
        .catch((e) => {
          setProblem(e instanceof Error ? e.message : String(e));
          setRows((r) => r ?? []);
        }),
    [actions],
  );
  useEffect(() => {
    reload();
    return actions.subscribeStats(reload);
  }, [actions, reload]);
  useEffect(() => {
    if (mode === "live") listProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, [mode]);

  const lines = useMemo<Line[]>(() => {
    if (!rows || !snapshot) return [];
    const account = new Map<string, string>();
    for (const p of profiles) {
      account.set(p.username.toLowerCase(), p.username.toLowerCase());
      for (const a of p.aliases ?? []) account.set(a.toLowerCase(), p.username.toLowerCase());
    }
    const owned = new Map<string, number>();
    for (const r of snapshot.stock) if (r.owner_type === "player") owned.set(r.owner_key, (owned.get(r.owner_key) ?? 0) + r.count);
    const players = new Map(snapshot.players.map((p) => [p.uuid, p]));
    return rows.map((row) => {
      const p = players.get(row.uuid);
      const name = p?.name ?? row.name;
      // Inventarzeilen tragen schon den Kontonamen; sonst über Kontoname oder Alias
      const key =
        snapshot.stock.find((r) => r.source_kind !== "container" && r.source_id === row.uuid)?.owner_key ?? account.get(name.toLowerCase()) ?? name.toLowerCase();
      return { row: { ...row, name }, online: p?.online ?? false, owned: owned.get(key) ?? 0 };
    });
  }, [rows, snapshot, profiles]);

  if (!rows || !snapshot) return <div className="page"><Loading /></div>;

  const metric = [...METRICS, OWNED].find((m) => m.id === sort) ?? METRICS[0]!;
  const valueOf = (l: Line, m: Metric) => (m.id === "owned" ? l.owned : m.value(l.row.stats));
  const sorted = [...lines].sort((a, b) => valueOf(b, metric) - valueOf(a, metric) || a.row.name.localeCompare(b.row.name));
  const max = Math.max(1, ...sorted.map((l) => valueOf(l, metric)));
  const current = sorted.find((l) => l.row.uuid === picked) ?? sorted[0];
  const newest = rows.reduce<string | null>((a, r) => (!a || r.updated_at > a ? r.updated_at : a), null);

  return (
    <main className="page">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1>Statistiken</h1>
        <p className="muted" style={{ margin: 0 }}>
          Aus den Statistik-Dateien des Servers, die Minecraft beim Speichern und Ausloggen schreibt. Der Sammler liest sie bei jedem Zonen-Scan
          {newest ? `, zuletzt ${ago(newest)}` : ""}. Items im Besitz zählen Inventar, Enderkiste und eigene Kisten.
        </p>
      </div>

      {problem && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{problem}</p>}

      {sorted.length === 0 ? (
        !problem && (
          <div className="panel">
            <p className="empty" style={{ margin: 0 }}>
              Noch keine Statistiken. Sobald der Sammler die Stats-Dateien gelesen hat (beim nächsten Zonen-Scan), erscheinen sie hier.
            </p>
          </div>
        )
      ) : (
        <>
          <section aria-label="Rekorde" className="stat-tiles">
            {[...METRICS, OWNED].map((m) => {
              const best = [...lines].sort((a, b) => valueOf(b, m) - valueOf(a, m))[0]!;
              const v = valueOf(best, m);
              return (
                <button key={m.id} type="button" className="stat-tile" aria-pressed={sort === m.id} onClick={() => setSort(m.id)} title={`Nach ${m.label} sortieren`}>
                  <span className="faint">{m.label}</span>
                  <span className="stat-value num">{m.format(v)}</span>
                  <span className="muted">{v > 0 ? best.row.name : "noch niemand"}</span>
                </button>
              );
            })}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Alle Spieler</h2>
              <span className="faint">sortiert nach {metric.label}</span>
            </div>
            <div className="panel-body table-wrap" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <table className="compare stats-table">
                <thead>
                  <tr>
                    <th scope="col">Spieler</th>
                    {[...METRICS, OWNED].map((m) => (
                      <th key={m.id} scope="col" className="r" aria-sort={sort === m.id ? "descending" : undefined}>
                        <button type="button" className="th-sort" onClick={() => setSort(m.id)} aria-pressed={sort === m.id}>
                          {m.label}{sort === m.id ? " ↓" : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((l, i) => (
                    <tr key={l.row.uuid} onClick={() => setPicked(l.row.uuid)} aria-selected={l.row.uuid === current?.row.uuid}>
                      <td>
                        <button type="button" className="cell-btn" onClick={() => setPicked(l.row.uuid)}>
                          <span className="faint num" style={{ width: 18, textAlign: "right" }}>{i + 1}</span>
                          <span className="dot" style={{ background: l.online ? "var(--up)" : "var(--line-strong)" }} />
                          <span className="strong">{l.row.name}</span>
                        </button>
                      </td>
                      {[...METRICS, OWNED].map((m) => {
                        const v = valueOf(l, m);
                        return (
                          <td key={m.id} className={`r${sort === m.id ? " sorted" : ""}`}>
                            {m.format(v)}
                            {sort === m.id && (
                              <span className="mini-bar" aria-hidden="true">
                                <span style={{ width: `${(v / max) * 100}%` }} />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {current && <PlayerDetail line={current} />}
        </>
      )}
    </main>
  );
}

function PlayerDetail({ line }: { line: Line }) {
  const s = line.row.stats;
  const c = s.custom;
  const counters: [string, string][] = [
    ["Spielzeit", playTime(c.play_time ?? 0)],
    ["Tode", fmt.format(c.deaths ?? 0)],
    ["Seit dem letzten Tod", playTime(c.time_since_death ?? 0)],
    ["Mob-Kills", fmt.format(c.mob_kills ?? 0)],
    ["Spieler-Kills", fmt.format(c.player_kills ?? 0)],
    ["Schaden ausgeteilt", hearts(c.damage_dealt ?? 0)],
    ["Schaden erlitten", hearts(c.damage_taken ?? 0)],
    ["Blöcke abgebaut", fmt.format(s.totals.mined)],
    ["Items hergestellt", fmt.format(s.totals.crafted)],
    ["Items benutzt", fmt.format(s.totals.used)],
    ["Werkzeuge kaputt", fmt.format(s.totals.broken)],
    ["Aufgehoben", fmt.format(s.totals.picked_up)],
    ["Sprünge", fmt.format(c.jump ?? 0)],
    ["Fische gefangen", fmt.format(c.fish_caught ?? 0)],
    ["Tiere gezüchtet", fmt.format(c.animals_bred ?? 0)],
    ["Gehandelt", fmt.format(c.traded_with_villager ?? 0)],
    ["Verzaubert", fmt.format(c.enchant_item ?? 0)],
    ["Geschlafen", fmt.format(c.sleep_in_bed ?? 0)],
    ["Kisten geöffnet", fmt.format(c.open_chest ?? 0)],
    ["Items im Besitz", fmt.format(line.owned)],
  ];
  const kinds = (Object.keys(DISTANCE_LABEL) as DistanceKind[]).filter((k) => s.distance[k] > 0);
  const longest = Math.max(1, ...kinds.map((k) => s.distance[k]));

  return (
    <section className="panel" aria-label={`Statistik von ${line.row.name}`}>
      <div className="panel-head">
        <h2>{line.row.name}</h2>
        <span className="faint">{line.online ? "online" : "offline"} · Stand {ago(line.row.updated_at)}</span>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <dl className="stat-grid">
          {counters.map(([label, value]) => (
            <div key={label}>
              <dt className="faint">{label}</dt>
              <dd className="num">{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="stat-sub">Unterwegs: {km(totalDistance(s))}</h3>
          {kinds.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Noch keine Strecke.</p>
          ) : (
            <div className="list">
              {kinds.map((k) => (
                <div key={k} className="dist-row">
                  <span className="muted">{DISTANCE_LABEL[k]}</span>
                  <span className="bar" style={{ flex: "1 1 auto" }}>
                    <span style={{ width: `${(s.distance[k] / longest) * 100}%`, background: k === "fall" ? "var(--down)" : "var(--own-player)" }} />
                  </span>
                  <span className="num" style={{ minWidth: 72, textAlign: "right" }}>{km(s.distance[k])}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cols">
          <TopList title="Am meisten abgebaut" list={s.top.mined} kind="item" empty="Noch nichts abgebaut." />
          <TopList title="Getötet" list={s.top.killed} kind="mob" empty="Noch nichts getötet." />
          <TopList title="Gestorben durch" list={s.top.killed_by} kind="mob" empty={(c.deaths ?? 0) > 0 ? "Nur durch Fallen, Lava und Co." : "Noch nie gestorben."} />
          <TopList title="Am meisten hergestellt" list={s.top.crafted} kind="item" empty="Noch nichts hergestellt." />
          <TopList title="Am meisten benutzt" list={s.top.used} kind="item" empty="Noch nichts benutzt." />
        </div>
      </div>
    </section>
  );
}

function TopList({ title, list, kind, empty }: { title: string; list: Ranked; kind: "item" | "mob"; empty: string }) {
  return (
    <div>
      <h3 className="stat-sub">{title}</h3>
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>{empty}</p>
      ) : (
        <div className="list">
          {list.map(([id, n]) => (
            <div key={id} className="item-row" style={{ cursor: "default", minHeight: 36, padding: "5px 8px" }}>
              {kind === "item" ? <ItemIcon id={id} size={20} /> : <span className="dot" style={{ background: "var(--down)" }} />}
              <span className="grow">{kind === "item" ? itemName(id) : mobName(id)}</span>
              <span className="qty">{fmt.format(n)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
