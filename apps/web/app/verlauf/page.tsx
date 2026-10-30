"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { totals } from "@/lib/derive";
import { fmt, itemName, matchesItem } from "@/lib/items";
import type { Dashboard, HistoryRow } from "@/lib/types";

type Point = { t: number; v: number };
const PERIODS = [7, 14, 30, 90];
const MAX_ITEMS = 24;

function series(rows: HistoryRow[]): Point[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.taken_at, (m.get(r.taken_at) ?? 0) + r.count);
  return [...m].map(([t, v]) => ({ t: Date.parse(t), v })).sort((a, b) => a.t - b.t);
}

const days = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const stamp = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Chart({ points, label }: { points: Point[]; label: string }) {
  const [hover, setHover] = useState<Point | null>(null);
  const W = 600, H = 220, PL = 52, PR = 12, PT = 12, PB = 28;
  if (points.length < 2) return <p className="empty" style={{ margin: 0 }}>Noch zu wenig Verlauf. Der Sammler speichert einmal pro Stunde einen Stand.</p>;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const vMax = Math.max(...points.map((p) => p.v)) * 1.1 || 1;
  const x = (t: number) => PL + ((t - t0) / (t1 - t0 || 1)) * (W - PL - PR);
  const y = (v: number) => H - PB - (v / vMax) * (H - PT - PB);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((f) => Math.round(vMax * f));
  const shown = hover ?? points[points.length - 1];

  function move(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const t = t0 + (((e.clientX - box.left) / box.width) * W - PL) / (W - PL - PR) * (t1 - t0);
    let best = points[0];
    for (const p of points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    setHover(best);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
      role="img"
      aria-label={`Verlauf ${label}, aktuell ${fmt.format(points[points.length - 1].v)}`}
      onPointerMove={move}
      onPointerLeave={() => setHover(null)}
    >
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={PL - 8} y={y(v) + 4} fontSize="12" fill="var(--faint)" textAnchor="end">{fmt.format(v)}</text>
        </g>
      ))}
      {[t0, (t0 + t1) / 2, t1].map((t, i) => (
        <text key={t} x={x(t)} y={H - 8} fontSize="12" fill="var(--faint)" textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{days.format(t)}</text>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {hover && <line x1={x(hover.t)} x2={x(hover.t)} y1={PT} y2={H - PB} stroke="var(--line-strong)" />}
      <circle cx={x(shown.t)} cy={y(shown.v)} r="4" fill="var(--accent)" />
      {hover && (
        <text x={Math.min(Math.max(x(hover.t), PL + 70), W - PR - 70)} y={PT + 4} fontSize="12" fill="var(--text)" textAnchor="middle">
          {fmt.format(hover.v)} · {stamp.format(hover.t)}
        </text>
      )}
    </svg>
  );
}

function ItemPanel({ item, points, period, onRemove }: { item: string; points?: Point[]; period: number; onRemove: () => void }) {
  const first = points?.[0], last = points?.[points.length - 1];
  const delta = points && points.length > 1 && first && last ? last.v - first.v : null;
  return (
    <section className="panel" aria-label={itemName(item)}>
      <div className="panel-head">
        <h2>
          <ItemIcon id={item} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemName(item)}</span>
        </h2>
        <span className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
          {last && <span className="num" style={{ fontWeight: 600 }}>{fmt.format(last.v)}</span>}
          {delta !== null && (
            <span className="num" style={{ color: delta >= 0 ? "var(--up)" : "var(--down)", whiteSpace: "nowrap" }} title={`seit ${period} Tagen`}>
              {delta >= 0 ? "+" : "−"}{fmt.format(Math.abs(delta))}
            </span>
          )}
          <button type="button" className="btn btn-quiet btn-small" onClick={onRemove} aria-label={`${itemName(item)} entfernen`}>Entfernen</button>
        </span>
      </div>
      <div className="panel-body">{points ? <Chart points={points} label={itemName(item)} /> : <Loading rows={3} />}</div>
    </section>
  );
}

/** Suchfeld mit Vorschlägen; Enter oder Klick fügt das Item zum Dashboard hinzu. */
function ItemPicker({ options, taken, onPick, disabled }: { options: string[]; taken: string[]; onPick: (id: string) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const matches = useMemo(() => (q.trim() ? options.filter((id) => !taken.includes(id) && matchesItem(id, q)).slice(0, 8) : []), [options, taken, q]);

  function pick(id: string) {
    onPick(id);
    setQ("");
    setCursor(0);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, matches.length - 1));
    else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
    else if (e.key === "Enter" && matches[cursor]) pick(matches[cursor]);
    else if (e.key === "Escape") setQ("");
    else return;
    e.preventDefault();
  }

  return (
    <div className="picker" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
      <label className="search">
        <span className="sr-only">Item hinzufügen</span>
        <input
          value={q}
          placeholder={disabled ? `Höchstens ${MAX_ITEMS} Items je Dashboard` : "Item hinzufügen, z. B. Diamant"}
          disabled={disabled}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="picker-list"
          aria-activedescendant={matches[cursor] ? `pick-${cursor}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={key}
        />
      </label>
      {open && q.trim() && (
        <ul className="picker-list" id="picker-list" role="listbox">
          {matches.length === 0 && <li className="faint" style={{ padding: "10px 0" }}>Kein passendes Item im Bestand.</li>}
          {matches.map((id, i) => (
            <li key={id} id={`pick-${i}`} role="option" aria-selected={i === cursor}>
              <button type="button" className="item-row" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => pick(id)}>
                <ItemIcon id={id} />
                <span className="grow">{itemName(id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HistoryPage() {
  const { snapshot, actions } = useData();
  const [boards, setBoards] = useState<Dashboard[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cache, setCache] = useState<Map<string, Point[]>>(new Map());
  const asked = useRef(new Set<string>());
  const tempId = useRef(-1);
  const latest = useRef<Dashboard[] | null>(null);
  latest.current = boards;

  const stock = useMemo(() => (snapshot ? totals(snapshot.stock) : []), [snapshot]);
  const options = useMemo(() => stock.map((s) => s.item_id), [stock]);

  useEffect(() => {
    let alive = true;
    actions
      .listDashboards()
      .then((list) => alive && setBoards(list))
      .catch((e) => {
        if (!alive) return;
        setProblem(e instanceof Error ? e.message : String(e));
        setBoards([]);
      });
    return () => {
      alive = false;
    };
  }, [actions]);

  // Gewähltes Dashboard im Link merken (?dashboard=3), damit es Neuladen übersteht
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("dashboard"));
    if (id) setActiveId(id);
  }, []);
  const active = boards?.find((b) => b.id === activeId) ?? boards?.[0] ?? null;
  useEffect(() => setName(active?.name ?? ""), [active?.id, active?.name]);
  const select = (id: number) => {
    setActiveId(id);
    const url = new URL(location.href);
    url.searchParams.set("dashboard", String(id));
    history.replaceState(null, "", url);
  };

  // Verlauf für jedes Item des Dashboards laden, schon geladene bleiben im Speicher
  useEffect(() => {
    if (!active) return;
    for (const item of active.items) {
      const k = `${item}|${active.days}`;
      if (asked.current.has(k)) continue;
      asked.current.add(k);
      actions
        .loadHistory(item, active.days)
        .then((rows) => setCache((c) => new Map(c).set(k, series(rows))))
        .catch(() => setCache((c) => new Map(c).set(k, [])));
    }
  }, [active, actions]);

  const fail = (e: unknown) => setProblem(e instanceof Error ? e.message : String(e));

  /** Sofort anzeigen, dann speichern. Schlägt das fehl, bleibt die Änderung bis zum Neuladen sichtbar. */
  function change(d: Dashboard, patch: Partial<Omit<Dashboard, "id">>) {
    const next = { ...d, ...patch };
    setBoards((bs) => bs?.map((b) => (b.id === d.id ? next : b)) ?? null);
    if (d.id < 0) return;
    const { id, ...rest } = next;
    actions.saveDashboard({ id, ...rest }).catch(fail);
  }

  async function create() {
    const list = boards ?? [];
    const draft = {
      name: list.length ? `Dashboard ${list.length + 1}` : "Mein Dashboard",
      items: list.length ? [] : options.slice(0, 4),
      days: 14,
      position: list.length ? Math.max(...list.map((b) => b.position)) + 1 : 0,
    };
    const temp = { ...draft, id: tempId.current-- };
    setBoards([...list, temp]);
    select(temp.id);
    try {
      const saved = await actions.saveDashboard(draft);
      // Was in der Zwischenzeit lokal geändert wurde, gleich mit speichern
      const now = latest.current?.find((b) => b.id === temp.id);
      const merged = { ...(now ?? saved), id: saved.id };
      if (now && (now.name !== saved.name || now.items.join() !== saved.items.join() || now.days !== saved.days)) actions.saveDashboard(merged).catch(fail);
      setBoards((bs) => bs?.map((b) => (b.id === temp.id ? merged : b)) ?? null);
      select(saved.id);
    } catch (e) {
      fail(e);
    }
  }

  function remove(d: Dashboard) {
    if (!confirm(`Dashboard „${d.name}“ löschen?`)) return;
    setBoards((bs) => bs?.filter((b) => b.id !== d.id) ?? null);
    setActiveId(null);
    if (d.id > 0) actions.deleteDashboard(d.id).catch(fail);
  }

  function rename() {
    if (!active) return;
    const n = name.trim().slice(0, 60);
    if (!n) return setName(active.name);
    if (n !== active.name) change(active, { name: n });
  }

  if (!snapshot || !boards) return <div className="page"><Loading /></div>;

  return (
    <main className="page" style={{ gap: 20 }}>
      <div className="row">
        <h1>Verlauf</h1>
        <span className="muted">Eigene Dashboards mit den Items, die dich interessieren. Nur du siehst sie.</span>
      </div>
      {problem && <div className="note" role="alert">{problem}</div>}

      <nav className="dash-tabs" aria-label="Dashboards">
        {boards.map((b) => (
          <button key={b.id} type="button" className="chip" aria-pressed={b.id === active?.id} onClick={() => select(b.id)}>
            {b.name}
            <span className="faint num">{b.items.length}</span>
          </button>
        ))}
        <button type="button" className="btn btn-quiet" style={{ minHeight: 36 }} onClick={create}>Neues Dashboard</button>
      </nav>

      {!active ? (
        <div className="panel">
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
            <h2>Noch kein Dashboard</h2>
            <p className="muted" style={{ margin: 0 }}>Leg ein Dashboard an und wähl die Items, deren Bestand du über die Zeit sehen willst, etwa Erze für die Werkzeuge oder Baumaterial für das nächste Projekt.</p>
            <button type="button" className="btn btn-primary" onClick={create}>Dashboard anlegen</button>
          </div>
        </div>
      ) : (
        <>
          <div className="dash-tools">
            <label className="sr-only" htmlFor="dash-name">Name des Dashboards</label>
            <input
              id="dash-name"
              className="input dash-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <ItemPicker
              options={options}
              taken={active.items}
              disabled={active.items.length >= MAX_ITEMS}
              onPick={(id) => change(active, { items: [...active.items, id] })}
            />
            <div className="chips" role="group" aria-label="Zeitraum">
              {PERIODS.map((d) => (
                <button key={d} type="button" className="chip" aria-pressed={active.days === d} onClick={() => change(active, { days: d })}>{d} Tage</button>
              ))}
            </div>
            <span className="spacer" />
            <button type="button" className="btn btn-quiet" onClick={() => remove(active)}>Dashboard löschen</button>
          </div>

          {active.items.length === 0 ? (
            <p className="empty">Dieses Dashboard ist noch leer. Such oben ein Item, um seinen Verlauf hier zu sehen.</p>
          ) : (
            <div className="dash-grid">
              {active.items.map((item) => (
                <ItemPanel
                  key={item}
                  item={item}
                  period={active.days}
                  points={cache.get(`${item}|${active.days}`)}
                  onRemove={() => change(active, { items: active.items.filter((i) => i !== item) })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
