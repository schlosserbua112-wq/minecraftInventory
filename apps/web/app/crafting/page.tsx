"use client";

import { useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemPicker } from "@/components/ItemPicker";
import { useData } from "@/lib/data";
import { fmt, itemName } from "@/lib/items";
import { useItemNames } from "@/lib/itemicons";
import { craftableItems, craftFlow, woodTypes, type FlowNode } from "@mc/core";

const CARD_W = 200;
const CARD_H = 76;
const MIN_GAP = 48;
const MAX_GAP = 150;
const ROW_GAP = 18;
const VIA_H = 6;
const PORT_PAD = 12;
const HEAD = 34;

type Status = "ok" | "craft" | "missing";

/** Kurzer deutscher Name je Holzsorte; neue Sorten fallen auf den Brett-Namen ohne "holzbretter" zurück. */
const WOOD_DE: Record<string, string> = {
  oak: "Eiche", spruce: "Fichte", birch: "Birke", jungle: "Tropenbaum", acacia: "Akazie", dark_oak: "Schwarzeiche",
  pale_oak: "Blasseiche", mangrove: "Mangrove", cherry: "Kirsche", bamboo: "Bambus", crimson: "Karmesin", warped: "Wirr",
};
const woodLabel = (w: string) => WOOD_DE[w] ?? itemName(`minecraft:${w}_planks`).replace(/(holz)?bretter$/i, "");

/**
 * Crafting-Rechner: Endprodukt wählen, der Ablauf von den Grundstoffen bis zum Ergebnis steht als
 * Fluss von links nach rechts da. Optional mit dem eigenen Bestand abgeglichen.
 */
export default function CraftingPage() {
  useItemNames();
  const { snapshot, profile, mode } = useData();
  const [item, setItem] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [wood, setWood] = useState("oak");
  const [stonecutter, setStonecutter] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [recipes, setRecipes] = useState<Record<string, number>>({});
  const [raw, setRaw] = useState<string[]>([]);
  const [useStock, setUseStock] = useState(false);
  const [withCommon, setWithCommon] = useState(false);

  // Auswahl in der Adresse, damit man einen Link weitergeben kann
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const i = p.get("item");
    if (i) setItem(i.includes(":") ? i : `minecraft:${i}`);
    const n = Number(p.get("n"));
    if (n > 0) setQty(Math.floor(n));
  }, []);
  useEffect(() => {
    if (!item) return;
    const url = `${window.location.pathname}?item=${item.replace(/^minecraft:/, "")}&n=${qty}`;
    window.history.replaceState(null, "", url);
  }, [item, qty]);

  const options = useMemo(() => craftableItems(), []);
  const woods = useMemo(() => woodTypes(), []);

  const me = (mode === "demo" ? snapshot?.players[0]?.name : profile?.username)?.toLowerCase() ?? "";
  const stock = useMemo(() => {
    if (!useStock || !snapshot) return undefined;
    const m = new Map<string, number>();
    for (const r of snapshot.stock) {
      const mine = r.owner_type === "player" && r.owner_key === me;
      if (mine || (withCommon && r.owner_type === "common")) m.set(r.item_id, (m.get(r.item_id) ?? 0) + r.count);
    }
    return m;
  }, [useStock, withCommon, snapshot, me]);

  const flow = useMemo(
    () => (item ? craftFlow(item, qty, { wood, stonecutter, choices, recipes, raw, stock }) : null),
    [item, qty, wood, stonecutter, choices, recipes, raw, stock],
  );

  function pick(id: string) {
    setItem(id);
    setChoices({});
    setRecipes({});
    setRaw([]);
  }

  const usesWood = !!flow?.nodes.some((n) => n.choice?.options.some((o) => o.endsWith("_planks") || o.endsWith("_log")));
  const hasStone = useMemo(() => !!flow?.nodes.some((n) => n.station === "steinsaege") || stonecutter, [flow, stonecutter]);
  const leftovers = flow?.nodes.filter((n) => n.leftover > 0) ?? [];

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Crafting-Rechner</h1>
        <span className="faint">Werkbank{stonecutter ? " und Steinsäge" : ""}, alle Stufen bis zu den Grundstoffen</span>
      </div>

      <section className="panel">
        <div className="panel-body craft-controls">
          <div className="row">
            <ItemPicker options={options} taken={item ? [item] : []} onPick={pick} placeholder="Endprodukt suchen, z. B. Treppe" />
            {item && (
              <span className="craft-picked">
                <ItemIcon id={item} size={28} />
                <span>{itemName(item)}</span>
              </span>
            )}
            <label className="row" style={{ gap: 8 }}>
              <span className="muted">Menge</span>
              <input className="input num craft-qty" type="number" min={1} max={100000} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value) || 1))))} />
            </label>
            <div className="chips">
              {[1, 16, 64, 256].map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={qty === n} onClick={() => setQty(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {item && usesWood && (
            <div className="row">
              <span className="craft-label">Holzsorte</span>
              <div className="chips">
                {woods.map((w) => (
                  <button key={w} type="button" className="chip" aria-pressed={wood === w} onClick={() => setWood(w)}>
                    <ItemIcon id={`minecraft:${w}_planks`} size={16} />
                    {woodLabel(w)}
                  </button>
                ))}
              </div>
              <span className="faint" style={{ fontSize: 13 }}>gilt überall, wo jedes Holz geht</span>
            </div>
          )}
          {item && (
            <label className="row" style={{ gap: 10 }}>
              <input type="checkbox" role="switch" className="switch" checked={stonecutter} onChange={(e) => setStonecutter(e.target.checked)} />
              <span>Steinsäge benutzen</span>
              <span className="faint" style={{ fontSize: 13 }}>{hasStone ? "oft günstiger, z. B. 1 Stein → 1 Treppe" : "für dieses Rezept ohne Unterschied"}</span>
            </label>
          )}
        </div>
      </section>

      {!item && (
        <section className="panel">
          <div className="panel-body muted">Such oben ein Item aus, das man craften kann. Der Rechner zeigt dann jede Stufe vom Stamm bis zum fertigen Teil, mit Mengen und Rundung.</div>
        </section>
      )}

      {flow && (
        <section className="panel">
          <div className="panel-head">
            <h2>Ablauf</h2>
            <div className="row" style={{ gap: 8 }}>
              {useStock && (
                <label className="row" style={{ gap: 8, fontSize: 13 }}>
                  <input type="checkbox" role="switch" className="switch" checked={withCommon} onChange={(e) => setWithCommon(e.target.checked)} />
                  <span className="muted">Allgemeingut mitzählen</span>
                </label>
              )}
              <div className="chips">
                <button type="button" className="chip" aria-pressed={!useStock} onClick={() => setUseStock(false)}>Nur Rechnung</button>
                <button type="button" className="chip" aria-pressed={useStock} onClick={() => setUseStock(true)}>Mit meinem Bestand</button>
              </div>
            </div>
          </div>
          {useStock && (
            <div className="craft-legend">
              <span><i style={{ background: "var(--up)" }} />vorhanden</span>
              <span><i style={{ background: "var(--accent)" }} />craftbar aus deinem Bestand</span>
              <span><i style={{ background: "var(--down)" }} />fehlt etwas</span>
            </div>
          )}
          <FlowDiagram
            nodes={flow.nodes}
            edges={flow.edges}
            target={item!}
            withStock={useStock}
            onRecipe={(id, i) => setRecipes((r) => ({ ...r, [id]: i }))}
            onChoice={(key, id) => setChoices((c) => ({ ...c, [key]: id }))}
            onRaw={(id, on) => setRaw((r) => (on ? [...r, id] : r.filter((x) => x !== id)))}
          />
          {leftovers.length > 0 && (
            <div className="craft-foot">
              <span className="faint">Übrig nach dem Craften:</span>
              {leftovers.map((n) => (
                <span key={n.item_id} className="row" style={{ gap: 6 }}>
                  <ItemIcon id={n.item_id} size={16} />
                  <span className="complete num">+{fmt.format(n.leftover)}</span>
                  {itemName(n.item_id)}
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function statusOf(nodes: FlowNode[], edges: { from: string; to: string }[]): Map<string, Status> {
  const by = new Map(nodes.map((n) => [n.item_id, n]));
  const ins = new Map<string, string[]>();
  for (const e of edges) ins.set(e.to, [...(ins.get(e.to) ?? []), e.from]);
  const memo = new Map<string, Status>();
  const st = (id: string): Status => {
    const hit = memo.get(id);
    if (hit) return hit;
    const n = by.get(id)!;
    let s: Status;
    if (n.have >= n.need && n.need > 0) s = "ok";
    else if (n.base) s = n.missing > 0 ? "missing" : "ok";
    else s = (ins.get(id) ?? []).every((o) => st(o) !== "missing") ? "craft" : "missing";
    memo.set(id, s);
    return s;
  };
  for (const n of nodes) st(n.item_id);
  return memo;
}

function FlowDiagram({
  nodes,
  edges,
  target,
  withStock,
  onRecipe,
  onChoice,
  onRaw,
}: {
  nodes: FlowNode[];
  edges: { from: string; to: string; count: number }[];
  target: string;
  withStock: boolean;
  onRecipe: (id: string, i: number) => void;
  onChoice: (key: string, id: string) => void;
  onRaw: (id: string, on: boolean) => void;
}) {
  // Spaltenabstand an die verfügbare Breite anpassen; wird es zu eng, scrollt der Ablauf seitlich
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState(1200);
  useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const layout = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.item_id, n]));
    const last = Math.max(0, ...nodes.map((n) => n.stage));
    const gap = last ? Math.max(MIN_GAP, Math.min(MAX_GAP, (avail - (last + 1) * CARD_W) / last)) : 0;
    const colX = (c: number) => c * (CARD_W + gap);

    // Linien über mehrere Spalten bekommen in jeder Zwischenspalte einen Platz, damit sie nicht durch Karten laufen
    interface Slot { key: string; h: number; next: string[]; y: number }
    const cols: Slot[][] = Array.from({ length: last + 1 }, () => []);
    const slots = new Map<string, Slot>();
    const slot = (key: string, c: number, h: number) => {
      let s = slots.get(key);
      if (!s) {
        s = { key, h, next: [], y: 0 };
        slots.set(key, s);
        cols[c].push(s);
      }
      return s;
    };
    for (const n of nodes) slot(n.item_id, n.stage, CARD_H);
    const paths = edges.map((e) => {
      const s = byId.get(e.from)!.stage;
      const t = byId.get(e.to)!.stage;
      const hops = [e.from];
      for (let c = s + 1; c < t; c++) {
        const key = `${e.from}>${e.to}@${c}`;
        slot(key, c, VIA_H);
        hops.push(key);
      }
      hops.push(e.to);
      for (let i = 0; i < hops.length - 1; i++) slots.get(hops[i])!.next.push(hops[i + 1]);
      return { e, hops };
    });

    // Von rechts nach links: jede Spalte nach der mittleren Höhe ihrer Abnehmer sortieren
    const stack = (col: Slot[]) => {
      let y = 0;
      for (const s of col) {
        s.y = y;
        y += s.h + ROW_GAP;
      }
      return y - ROW_GAP;
    };
    const heights: number[] = [];
    for (let c = last; c >= 0; c--) {
      const col = cols[c];
      const key = (s: Slot) => (s.next.length ? s.next.reduce((a, k) => a + slots.get(k)!.y + slots.get(k)!.h / 2, 0) / s.next.length : 0);
      const want = new Map(col.map((s) => [s, key(s)]));
      col.sort((a, b) => want.get(a)! - want.get(b)! || b.h - a.h);
      heights[c] = stack(col);
      // Spalte so verschieben, dass sie im Schnitt auf Höhe ihrer Abnehmer liegt
      if (c < last && col.length) {
        const mid = col.reduce((a, s) => a + want.get(s)! - (s.y + s.h / 2), 0) / col.length;
        for (const s of col) s.y += mid;
      }
    }
    const top = Math.min(...[...slots.values()].map((s) => s.y));
    for (const s of slots.values()) s.y += HEAD - top;
    const height = Math.max(...[...slots.values()].map((s) => s.y + s.h)) + 8;

    const xy = new Map(nodes.map((n) => [n.item_id, { x: colX(n.stage), y: slots.get(n.item_id)!.y }]));

    // Anschlusspunkte an den Karten nach der Höhe der Nachbarn verteilen
    const outs = new Map<string, typeof paths>();
    const ins = new Map<string, typeof paths>();
    for (const p of paths) {
      outs.set(p.e.from, [...(outs.get(p.e.from) ?? []), p]);
      ins.set(p.e.to, [...(ins.get(p.e.to) ?? []), p]);
    }
    const portY = (list: typeof paths, p: (typeof paths)[number], hop: (p: (typeof paths)[number]) => string) => {
      const sorted = [...list].sort((a, b) => slots.get(hop(a))!.y - slots.get(hop(b))!.y);
      const i = sorted.indexOf(p);
      return sorted.length <= 1 ? CARD_H / 2 : PORT_PAD + (i * (CARD_H - 2 * PORT_PAD)) / (sorted.length - 1);
    };
    const lines = paths.map((p) => {
      const { e, hops } = p;
      const a = slots.get(e.from)!;
      const b = slots.get(e.to)!;
      const s = byId.get(e.from)!.stage;
      const pts: [number, number][] = [[colX(s) + CARD_W, a.y + portY(outs.get(e.from)!, p, (q) => q.hops[1])]];
      hops.slice(1, -1).forEach((k, i) => {
        const v = slots.get(k)!;
        const x = colX(s + 1 + i);
        pts.push([x, v.y + v.h / 2], [x + CARD_W, v.y + v.h / 2]);
      });
      const end: [number, number] = [colX(byId.get(e.to)!.stage), b.y + portY(ins.get(e.to)!, p, (q) => q.hops[q.hops.length - 2])];
      pts.push(end);
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        // Gerade Strecke durch eine Zwischenspalte, sonst Kurve von Spalte zu Spalte
        if (i % 2 === 0) d += ` L${x1} ${y1}`;
        else {
          const mx = (x0 + x1) / 2;
          d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
        }
      }
      return { key: `${e.from}>${e.to}`, d, count: e.count, end };
    });

    return { xy, lines, colX, last, width: colX(last) + CARD_W, height };
  }, [nodes, edges, avail]);

  const status = useMemo(() => statusOf(nodes, edges), [nodes, edges]);
  const stageName = (c: number) => (c === layout.last ? "Ergebnis" : c === 0 ? "Grundstoffe" : `Stufe ${c}`);

  return (
    <div className="flow-scroll" ref={setBox}>
      <div className="flow" style={{ width: layout.width, height: layout.height }}>
        {Array.from({ length: layout.last + 1 }, (_, c) => (
          <span key={c} className="craft-label flow-col" style={{ left: layout.colX(c) }}>
            {stageName(c)}
          </span>
        ))}
        <svg width={layout.width} height={layout.height} className="flow-lines" aria-hidden="true">
          {layout.lines.map((l) => (
            <path key={l.key} d={l.d} />
          ))}
          {layout.lines.map((l) => (
            <text key={l.key} x={l.end[0] - 8} y={l.end[1] - 5} textAnchor="end">
              {fmt.format(l.count)}
            </text>
          ))}
        </svg>
        {nodes.map((n) => {
          const p = layout.xy.get(n.item_id)!;
          return (
            <FlowCard
              key={n.item_id}
              n={n}
              x={p.x}
              y={p.y}
              isTarget={n.item_id === target}
              status={withStock ? status.get(n.item_id) : undefined}
              withStock={withStock}
              onRecipe={onRecipe}
              onChoice={onChoice}
              onRaw={onRaw}
            />
          );
        })}
      </div>
    </div>
  );
}

function FlowCard({
  n,
  x,
  y,
  isTarget,
  status,
  withStock,
  onRecipe,
  onChoice,
  onRaw,
}: {
  n: FlowNode;
  x: number;
  y: number;
  isTarget: boolean;
  status?: Status;
  withStock: boolean;
  onRecipe: (id: string, i: number) => void;
  onChoice: (key: string, id: string) => void;
  onRaw: (id: string, on: boolean) => void;
}) {
  const sub: string[] = [];
  if (n.base) sub.push(n.stopped ? "nicht weiter aufgelöst" : "Grundstoff");
  else sub.push(`${fmt.format(n.crafts)}× craften · ${n.perCraft} je Craft`);
  if (n.station === "steinsaege") sub.push("Steinsäge");
  const stock = withStock && !isTarget && n.have > 0 ? `hab ${fmt.format(n.have)}` : null;
  const missing = withStock && n.base && n.missing > 0 ? `fehlt ${fmt.format(n.missing)}` : null;

  return (
    <div className="flow-card" data-status={status} data-target={isTarget || undefined} style={{ left: x, top: y, width: CARD_W, height: CARD_H }}>
      <ItemIcon id={n.item_id} size={30} />
      <div className="flow-text">
        <div className="flow-name" title={itemName(n.item_id)}>
          <b className="num">{fmt.format(n.need)}</b> {itemName(n.item_id)}
        </div>
        <div className="flow-sub">{sub.join(" · ")}</div>
        {(stock || missing || n.leftover > 0) && (
          <div className="flow-sub">
            {[
              stock && <span key="s" className="complete">{stock}</span>,
              missing && <span key="m" className="missing">{missing}</span>,
              n.leftover > 0 && <span key="l" className="complete">{fmt.format(n.leftover)} übrig</span>,
            ]
              .filter(Boolean)
              .flatMap((el, i) => (i ? [" · ", el] : [el]))}
          </div>
        )}
      </div>
      <div className="flow-tools">
        {n.choice && n.choice.options.length > 1 && (
          <select className="flow-select" aria-label={`Statt ${itemName(n.item_id)}`} value={n.item_id} onChange={(e) => onChoice(n.choice!.key, e.target.value)}>
            {n.choice.options.map((o) => (
              <option key={o} value={o}>
                {itemName(o)}
              </option>
            ))}
          </select>
        )}
        {n.recipeCount > 1 && !n.stopped && (
          <button type="button" className="flow-btn" title="Anderes Rezept" onClick={() => onRecipe(n.item_id, (n.recipe + 1) % n.recipeCount)}>
            Rezept {n.recipe + 1}/{n.recipeCount}
          </button>
        )}
        {!isTarget && (n.stopped || !n.base) && (
          <button type="button" className="flow-btn" title={n.stopped ? "Wieder bis zu den Grundstoffen auflösen" : "Nicht craften, als Grundstoff behandeln"} onClick={() => onRaw(n.item_id, !n.stopped)}>
            {n.stopped ? "auflösen" : "nicht craften"}
          </button>
        )}
      </div>
    </div>
  );
}
