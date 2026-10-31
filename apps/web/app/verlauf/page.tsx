"use client";

import { useEffect, useMemo, useState } from "react";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { totals } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import type { HistoryRow } from "@/lib/types";

function series(rows: HistoryRow[]) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.taken_at, (m.get(r.taken_at) ?? 0) + r.count);
  return [...m].map(([t, v]) => ({ t: Date.parse(t), v })).sort((a, b) => a.t - b.t);
}

function Chart({ points }: { points: { t: number; v: number }[] }) {
  const W = 1000, H = 300, P = 36;
  if (points.length < 2) return <p className="empty">Noch zu wenig Verlauf. Der Sammler speichert einmal pro Stunde einen Stand.</p>;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const vMax = Math.max(...points.map((p) => p.v)) * 1.1 || 1;
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / vMax) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const ticks = [0, 0.5, 1].map((f) => Math.round(vMax * f));
  const days = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={`Verlauf, aktuell ${fmt.format(last.v)}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={P - 6} y={y(v) + 4} fontSize="12" fill="var(--faint)" textAnchor="end">{fmt.format(v)}</text>
        </g>
      ))}
      {[t0, (t0 + t1) / 2, t1].map((t) => (
        <text key={t} x={x(t)} y={H - 10} fontSize="12" fill="var(--faint)" textAnchor="middle">{days.format(t)}</text>
      ))}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={x(last.t)} cy={y(last.v)} r="4" fill="var(--accent)" />
    </svg>
  );
}

export default function HistoryPage() {
  const { snapshot, actions } = useData();
  const items = useMemo(() => (snapshot ? totals(snapshot.stock) : []), [snapshot]);
  const [item, setItem] = useState<string | null>(null);
  const [days, setDays] = useState(14);
  const [points, setPoints] = useState<{ t: number; v: number }[] | null>(null);
  const current = item ?? items[0]?.item_id ?? null;

  useEffect(() => {
    if (!current) return;
    let alive = true;
    setPoints(null);
    actions.loadHistory(current, days).then((rows) => alive && setPoints(series(rows)));
    return () => {
      alive = false;
    };
  }, [current, days, actions]);

  if (!snapshot) return <div className="page"><Loading /></div>;

  const weekAgo = points?.find((p) => p.t >= Date.now() - 7 * 86400_000);
  const delta = points?.length && weekAgo ? points[points.length - 1].v - weekAgo.v : null;

  return (
    <main className="page">
      <div className="row">
        <h1>Verlauf</h1>
        <span className="spacer" />
        <label className="sr-only" htmlFor="item">Item</label>
        <select id="item" className="select" value={current ?? ""} onChange={(e) => setItem(e.target.value)}>
          {items.map((i) => <option key={i.item_id} value={i.item_id}>{itemName(i.item_id)}</option>)}
        </select>
        <div className="chips" role="group" aria-label="Zeitraum">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={days === d} onClick={() => setDays(d)}>{d} Tage</button>
          ))}
        </div>
      </div>
      {current && (
        <section className="panel">
          <div className="panel-head">
            <h2>{itemName(current)}</h2>
            {delta !== null && (
              <span className="num" style={{ color: delta >= 0 ? "var(--up)" : "var(--down)" }}>
                {delta >= 0 ? "+" : "−"}{fmt.format(Math.abs(delta))} diese Woche
              </span>
            )}
          </div>
          <div className="panel-body">{points ? <Chart points={points} /> : <Loading rows={4} />}</div>
        </section>
      )}
    </main>
  );
}
