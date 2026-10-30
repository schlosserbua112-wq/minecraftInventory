"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerType, StockRow } from "@mc/core";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { MapView, type MapPin } from "@/components/MapView";
import { useData } from "@/lib/data";
import { OWNER_COLOR, OWNER_LABEL, SOURCE_LABEL, coords, kindLabel, totals, type Location } from "@/lib/derive";
import { fmt, itemName, matchesItem } from "@/lib/items";
import { byOwner, colorOf, placesOf, scopeRows, useOwners, useStoredKeys, type Owner, type Scope } from "@/lib/search";

const TYPES: (OwnerType | "all")[] = ["all", "common", "project", "player", "unassigned"];
const TYPE_LABEL: Partial<Record<OwnerType | "all", string>> = { all: "Alles", player: "Spieler" };
/** Spalten der Tabelle bei "Alle Items" ohne Besitzfilter */
const TYPE_COLS: OwnerType[] = ["common", "player", "project"];
/** Mehr Spielerspalten passen nicht neben die Karte; die Summe zählt trotzdem alle Gewählten. */
const MAX_COLS = 4;

/** Wem gehört dieser Fundort, in einem Satzteil. */
function ownerText(l: Location): string {
  const r = l.row;
  const what = l.container ? kindLabel(l.container.kind) : SOURCE_LABEL[r.source_kind];
  if (r.owner_type === "player") return `${what} von ${r.owner_label}`;
  if (r.owner_type === "common") return `${what} · Allgemein`;
  if (r.owner_type === "project") return `${what} · Projekt ${r.owner_label}`;
  if (r.owner_key === "unbenannt") return `${what === "Fass" ? "Unbenanntes" : "Unbenannte"} ${what} · nicht zugeordnet`;
  return `${what} „${r.owner_label}“ · nicht zugeordnet`;
}

function whereText(l: Location): string {
  if (l.container) return coords(l.container);
  return l.player?.online ? "trägt es gerade bei sich" : "Stand beim letzten Logout";
}

const ownerName = (o: Owner) => (o.isMe ? "Ich" : o.label);

interface Column {
  key: string;
  label: string;
  color: string;
  count: (rows: StockRow[]) => number;
}

export default function SearchPage() {
  const { snapshot } = useData();
  const owners = useOwners();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "players">("all");
  const [type, setType] = useState<OwnerType | "all">("all");
  const [keys, setKeys] = useStoredKeys(owners);
  const [item, setItem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Modus im Link merken (?modus=spieler), damit er Neuladen übersteht
  useEffect(() => {
    if (new URLSearchParams(location.search).get("modus") === "spieler") setMode("players");
  }, []);
  const switchMode = (m: "all" | "players") => {
    setMode(m);
    setItem(null);
    const url = new URL(location.href);
    if (m === "players") url.searchParams.set("modus", "spieler");
    else url.searchParams.delete("modus");
    history.replaceState(null, "", url);
  };

  const scope: Scope = mode === "players" ? { mode, keys } : { mode, type };
  const keyList = keys.join();
  const ownerOf = useMemo(() => new Map(owners.map((o) => [o.key, o])), [owners]);
  const picked = owners.filter((o) => keys.includes(o.key));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (snapshot ? scopeRows(snapshot, owners, scope) : []), [snapshot, owners, mode, type, keyList]);
  const results = useMemo(() => totals(rows).filter((t) => matchesItem(t.item_id, query)), [rows, query]);
  const rowsByItem = useMemo(() => {
    const m = new Map<string, StockRow[]>();
    for (const r of rows) m.set(r.item_id, [...(m.get(r.item_id) ?? []), r]);
    return m;
  }, [rows]);
  const places = useMemo(() => (snapshot && item ? placesOf(snapshot, rows, item) : []), [snapshot, rows, item]);

  const pins: MapPin[] = useMemo(() => {
    if (!snapshot) return [];
    if (!item) {
      return snapshot.containers
        .filter((c) => c.owner_type && (mode === "players" ? c.owner_type === "player" && keys.includes(c.owner_key ?? "") : type === "all" || c.owner_type === type))
        .map((c) => ({
          id: c.id,
          x: c.x,
          z: c.z,
          ownerType: c.owner_type!,
          color: mode === "players" ? ownerOf.get(c.owner_key ?? "")?.color : undefined,
          title: `${c.owner_type === "player" ? `Kiste von ${c.owner_label}` : c.custom_name ?? "Kiste"} · ${coords(c)}`,
        }));
    }
    return places
      .map((p, i) => ({ p, n: i + 1 }))
      .filter(({ p }) => p.container)
      .map(({ p, n }) => ({
        id: p.container!.id,
        x: p.container!.x,
        z: p.container!.z,
        ownerType: p.row.owner_type,
        color: colorOf(p.row, scope, owners),
        label: String(n),
        title: `${ownerText(p)} · ${fmt.format(p.row.count)} · ${coords(p.container!)}`,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, item, places, mode, type, keyList, owners, ownerOf]);

  if (!snapshot) return <div className="page"><Loading /></div>;

  const toggle = (k: string) => setKeys(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
  const me = owners.find((o) => o.isMe);
  const hiddenPicked = mode === "players" ? picked.filter((o) => o.hidden) : [];

  const columns: Column[] =
    mode === "players"
      ? picked.slice(0, MAX_COLS).map((o) => ({ key: o.key, label: ownerName(o), color: o.color, count: (r) => r.reduce((n, x) => (x.owner_key === o.key ? n + x.count : n), 0) }))
      : type === "all"
        ? TYPE_COLS.map((t) => ({ key: t, label: OWNER_LABEL[t], color: OWNER_COLOR[t], count: (r) => r.reduce((n, x) => (x.owner_type === t ? n + x.count : n), 0) }))
        : [];

  /** Anteil je Besitzer als Balken: im Spielerfilter je Spieler, sonst je Besitzart. */
  const parts = (r: StockRow[]) =>
    mode === "players"
      ? [...byOwner(r)].map(([k, n]) => {
          const o = ownerOf.get(k);
          return { label: o ? ownerName(o) : k, color: o?.color ?? OWNER_COLOR.player, n };
        })
      : (["common", "player", "project", "unassigned"] as OwnerType[])
          .map((t) => ({ label: OWNER_LABEL[t], color: OWNER_COLOR[t], n: r.reduce((s, x) => (x.owner_type === t ? s + x.count : s), 0) }))
          .filter((x) => x.n > 0);

  const emptyText =
    mode === "players" && !picked.length
      ? "Wähl oben mindestens einen Spieler aus."
      : query
        ? "Nichts gefunden. Versuch es mit dem deutschen oder englischen Namen, z. B. „Eisen“ oder „iron“."
        : mode === "players"
          ? "Die gewählten Spieler haben noch nichts. Kisten zählen, sobald sie mit dem Spielernamen benannt sind."
          : "Hier liegt noch nichts.";

  return (
    <main className="split">
      <section className="side side-wide" aria-label="Suche">
        <label className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ color: "var(--muted)" }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <span className="sr-only">Item suchen</span>
          <input
            type="search"
            placeholder={mode === "players" && picked.length === 1 && picked[0].isMe ? "Wo liegen meine Diamanten?" : "Wo liegen unsere Diamanten?"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setItem(null);
            }}
          />
        </label>

        <div className="seg" role="group" aria-label="Suchbereich">
          <button type="button" aria-pressed={mode === "all"} onClick={() => switchMode("all")}>Alle Items</button>
          <button type="button" aria-pressed={mode === "players"} onClick={() => switchMode("players")}>Nach Spieler</button>
        </div>

        {mode === "all" ? (
          <div className="chips" role="group" aria-label="Filter nach Besitz">
            {TYPES.map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={type === f} onClick={() => setType(f)}>
                {f !== "all" && <span className="dot" style={{ background: OWNER_COLOR[f] }} />}
                {TYPE_LABEL[f] ?? OWNER_LABEL[f as OwnerType]}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span className="muted">
                {picked.length === 0 ? "Niemand gewählt" : picked.length === 1 ? "1 Spieler gewählt" : `${picked.length} Spieler gewählt`}
              </span>
              <span className="row" style={{ gap: 4 }}>
                {me && <button type="button" className="btn btn-quiet btn-small" onClick={() => setKeys([me.key])}>Nur ich</button>}
                <button type="button" className="btn btn-quiet btn-small" onClick={() => setKeys(owners.map((o) => o.key))}>Alle</button>
              </span>
            </div>
            <fieldset className="checklist">
              <legend className="sr-only">Spieler</legend>
              {owners.map((o) => (
                <label key={o.key} className="check">
                  <input type="checkbox" checked={keys.includes(o.key)} onChange={() => toggle(o.key)} />
                  <span className="avatar" style={{ background: o.color }}>{o.label.slice(0, 2)}</span>
                  <span className="grow">{o.isMe ? `${o.label} (ich)` : o.label}</span>
                  {o.hidden ? (
                    <span className="faint small" title="Inventar und Enderkiste sind privat"><LockIcon /> nur Kisten</span>
                  ) : (
                    o.online && <span className="small" style={{ color: "var(--up)" }}>online</span>
                  )}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {hiddenPicked.length > 0 && (
          <p className="note">
            <LockIcon />
            <span>
              {hiddenPicked.map((o) => o.label).join(", ")} {hiddenPicked.length === 1 ? "zeigt" : "zeigen"} Inventar und Enderkiste nur sich selbst. Gezählt werden nur die Kisten.
            </span>
          </p>
        )}

        {item ? (
          <ItemDetail
            item={item}
            places={places}
            parts={parts(places.map((p) => p.row))}
            selected={selected}
            onSelect={setSelected}
            onBack={() => setItem(null)}
            color={(r) => colorOf(r, scope, owners)}
          />
        ) : results.length === 0 ? (
          <p className="empty">{emptyText}</p>
        ) : (
          <div className="table-wrap">
            <table className="compare">
              <thead>
                <tr>
                  <th>Item</th>
                  {columns.map((c) => (
                    <th key={c.key} className="r">
                      <span className="badge">
                        <span className="dot" style={{ background: c.color }} />
                        {c.label}
                      </span>
                    </th>
                  ))}
                  <th className="r">{columns.length ? "Summe" : "Menge"}</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 200).map((t) => {
                  const r = rowsByItem.get(t.item_id) ?? [];
                  return (
                    <tr key={t.item_id} onClick={() => setItem(t.item_id)}>
                      <td>
                        <button type="button" className="cell-btn" onClick={() => setItem(t.item_id)}>
                          <ItemIcon id={t.item_id} size={20} />
                          {itemName(t.item_id)}
                        </button>
                      </td>
                      {columns.map((c) => {
                        const n = c.count(r);
                        return <td key={c.key} className={n ? "r" : "r faint"}>{n ? fmt.format(n) : "–"}</td>;
                      })}
                      <td className="r strong">{fmt.format(t.count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mode === "players" && picked.length > MAX_COLS && (
              <p className="note" style={{ marginTop: 10 }}>Spalten für die ersten {MAX_COLS} Spieler, die Summe zählt alle {picked.length}.</p>
            )}
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
          <span>
            {item
              ? `${pins.length} Kisten mit ${itemName(item)}`
              : mode === "players"
                ? `${pins.length} Kisten von ${picked.map((o) => (o.isMe ? "mir" : o.label)).join(", ") || "niemandem"}`
                : `${pins.length} benannte Kisten`}
          </span>
        </div>
        <MapView
          pins={pins}
          zones={snapshot.zones}
          selectedId={selected}
          onSelect={setSelected}
          focus={`${item ?? "all"}|${mode}|${keyList}`}
          legend={mode === "players" ? picked.map((o) => ({ label: o.isMe ? `${o.label} (ich)` : o.label, color: o.color })) : undefined}
        />
      </section>
    </main>
  );
}

function ItemDetail({
  item,
  places,
  parts,
  selected,
  onSelect,
  onBack,
  color,
}: {
  item: string;
  places: Location[];
  parts: { label: string; color: string; n: number }[];
  selected: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  color: (r: StockRow) => string;
}) {
  const total = places.reduce((n, p) => n + p.row.count, 0);
  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={onBack} style={{ marginLeft: -12, alignSelf: "flex-start" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        Alle Items
      </button>
      <div className="row" style={{ gap: 12 }}>
        <ItemIcon id={item} size={32} />
        <h1>
          <span className="num">{fmt.format(total)}</span> {itemName(item)}
        </h1>
      </div>
      {parts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="bar" role="img" aria-label={`Aufteilung: ${parts.map((p) => `${p.label} ${fmt.format(p.n)}`).join(", ")}`}>
            {parts.map((p) => <span key={p.label} style={{ flex: p.n, background: p.color }} />)}
          </div>
          <div className="row" style={{ gap: "6px 16px" }}>
            {parts.map((p) => (
              <span key={p.label} className="badge">
                <span className="dot" style={{ background: p.color }} />
                {p.label} <span className="num">{fmt.format(p.n)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="list">
        {places.length === 0 && <p className="empty">Im gewählten Bereich liegt davon nichts.</p>}
        {places.map((p, i) => {
          const id = p.container?.id ?? `${p.row.source_kind}:${p.row.source_id}`;
          return (
            <button key={id} type="button" className="item-row" aria-current={selected === id} onClick={() => onSelect(id)}>
              <span className="pin" style={{ background: color(p.row) }}>{p.container ? i + 1 : ""}</span>
              <span className="grow">
                <span>{ownerText(p)}</span>
                <span className="sub">{whereText(p)}</span>
              </span>
              <span className="qty">{fmt.format(p.row.count)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" style={{ flex: "0 0 12px" }}>
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
