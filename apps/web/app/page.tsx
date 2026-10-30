"use client";

import { useMemo, useState } from "react";
import type { OwnerType } from "@mc/core";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { MapView, containerPins, type MapPin } from "@/components/MapView";
import { OwnerSplit } from "@/components/OwnerSplit";
import { useData } from "@/lib/data";
import { OWNER_COLOR, OWNER_LABEL, SOURCE_LABEL, coords, kindLabel, locations, totals } from "@/lib/derive";
import { fmt, itemName, matchesItem } from "@/lib/items";

const FILTERS: (OwnerType | "all")[] = ["all", "common", "project", "player", "unassigned"];
const FILTER_LABEL: Partial<Record<OwnerType, string>> = { player: "Spielerkisten" };

export default function SearchPage() {
  const { snapshot } = useData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OwnerType | "all">("all");
  const [item, setItem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Übersicht zeigt nur Kisten; Inventare und Enderkisten stehen unter "Inventare"
  const rows = useMemo(
    () => (snapshot ? snapshot.stock.filter((r) => r.source_kind === "container" && (filter === "all" || r.owner_type === filter)) : []),
    [snapshot, filter],
  );
  const results = useMemo(() => totals(rows).filter((t) => matchesItem(t.item_id, query)), [rows, query]);
  const places = useMemo(
    () => (snapshot && item ? locations({ ...snapshot, stock: rows }, item) : []),
    [snapshot, rows, item],
  );

  const pins: MapPin[] = useMemo(() => {
    if (!snapshot) return [];
    if (!item) return containerPins(snapshot.containers);
    return places
      .map((p, i) => ({ p, n: i + 1 }))
      .filter(({ p }) => p.container)
      .map(({ p, n }) => ({
        id: p.container!.id,
        x: p.container!.x,
        z: p.container!.z,
        ownerType: p.row.owner_type,
        label: String(n),
        title: `${p.row.owner_label} · ${fmt.format(p.row.count)} · ${coords(p.container!)}`,
      }));
  }, [snapshot, item, places]);

  if (!snapshot) return <div className="page"><Loading /></div>;

  const total = places.reduce((n, p) => n + p.row.count, 0);

  return (
    <main className="split">
      <section className="side" aria-label="Suche">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ color: "var(--muted)" }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <span className="sr-only">Item suchen</span>
          <input
            type="search"
            placeholder="Wo liegen unsere Diamanten?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setItem(null);
            }}
          />
        </label>
        <div className="chips" role="group" aria-label="Filter nach Besitz">
          {FILTERS.map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f !== "all" && <span className="dot" style={{ background: OWNER_COLOR[f] }} />}
              {f === "all" ? "Alle Kisten" : FILTER_LABEL[f] ?? OWNER_LABEL[f]}
            </button>
          ))}
        </div>

        {item ? (
          <>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn btn-quiet" onClick={() => setItem(null)} style={{ marginLeft: -12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                Alle Items
              </button>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <ItemIcon id={item} size={32} />
              <h1>
                <span className="num">{fmt.format(total)}</span> {itemName(item)}
              </h1>
            </div>
            <OwnerSplit rows={places.map((p) => p.row)} />
            <div className="list">
              {places.map((p, i) => {
                const id = p.container?.id ?? `${p.row.source_kind}:${p.row.source_id}`;
                return (
                  <button key={id} type="button" className="item-row" aria-current={selected === id} onClick={() => setSelected(id)}>
                    <span className="pin" style={{ background: OWNER_COLOR[p.row.owner_type] }}>{i + 1}</span>
                    <span className="grow">
                      <span>
                        {p.row.owner_type === "unassigned" ? `„${p.row.owner_label}“` : p.row.owner_label} · {p.container ? kindLabel(p.container.kind) : SOURCE_LABEL[p.row.source_kind]}
                      </span>
                      <span className="sub">{p.container ? coords(p.container) : p.player?.online ? "trägt es gerade bei sich" : "Stand beim letzten Logout"}</span>
                    </span>
                    <span className="qty">{fmt.format(p.row.count)}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="list" aria-label="Items">
            {results.length === 0 && <p className="empty">Nichts gefunden. Versuch es mit dem deutschen oder englischen Namen, z. B. „Eisen“ oder „iron“.</p>}
            {results.slice(0, 200).map((t) => (
              <button key={t.item_id} type="button" className="item-row" onClick={() => setItem(t.item_id)}>
                <ItemIcon id={t.item_id} />
                <span className="grow">
                  <span>{itemName(t.item_id)}</span>
                  <span className="sub">{t.places === 1 ? "1 Ort" : `${t.places} Orte`}</span>
                </span>
                <span className="qty">{fmt.format(t.count)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="main with-map" aria-label="Karte">
        <div className="row" style={{ fontSize: 13, color: "var(--muted)" }}>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>Oberwelt</span>
          {snapshot.zones.filter((z) => z.is_main).map((z) => (
            <span key={z.id}>
              {z.name}: {z.center_x} / {z.center_z}, Radius {z.radius}
            </span>
          ))}
          <span className="spacer" />
          <span>{item ? `${pins.length} Kisten mit ${itemName(item)}` : `${pins.length} benannte Kisten`}</span>
        </div>
        <MapView pins={pins} zones={snapshot.zones} selectedId={selected} onSelect={setSelected} focus={item ?? "all"} />
      </section>
    </main>
  );
}
