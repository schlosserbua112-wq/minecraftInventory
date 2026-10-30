"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerType, StockRow } from "@mc/core";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { MapView, type MapPin } from "@/components/MapView";
import { useData } from "@/lib/data";
import { OWNER_COLOR, OWNER_LABEL, SOURCE_LABEL, coords, kindLabel, totals, type Location } from "@/lib/derive";
import { fmt, itemName, matchesItem } from "@/lib/items";
import { byOwner, colorOf, placesOf, scopeRows, useOwners, useStoredKeys, type Scope } from "@/lib/search";

const TYPES: (OwnerType | "all")[] = ["all", "common", "project", "player", "unassigned"];
const TYPE_LABEL: Partial<Record<OwnerType | "all", string>> = { all: "Alles", player: "Spielerkisten" };

type Variant = "a" | "b" | "c";

/** Wem gehört dieser Fundort, in einem Satzteil. */
function ownerText(l: Location): string {
  const r = l.row;
  const what = l.container ? kindLabel(l.container.kind) : SOURCE_LABEL[r.source_kind];
  if (r.owner_type === "player") return `${what} von ${r.owner_label}`;
  if (r.owner_type === "common") return `${what} · Allgemein`;
  if (r.owner_type === "project") return `${what} · Projekt ${r.owner_label}`;
  return `${what} „${r.owner_label}“ · nicht zugeordnet`;
}

function whereText(l: Location): string {
  if (l.container) return coords(l.container);
  return l.player?.online ? "trägt es gerade bei sich" : "Stand beim letzten Logout";
}

const initials = (s: string) => s.slice(0, 2);

export default function SearchPage() {
  const { snapshot } = useData();
  const owners = useOwners();
  const [variant, setVariant] = useState<Variant>("a");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "players">("all");
  const [type, setType] = useState<OwnerType | "all">("all");
  const [keys, setKeys] = useStoredKeys(owners);
  const [item, setItem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const v = p.get("v");
    if (v === "a" || v === "b" || v === "c") setVariant(v);
    if (p.get("modus") === "spieler") setMode("players");
    const q = p.get("q");
    if (q) setQuery(q);
    const i = p.get("item");
    if (i) setItem(i);
  }, []);

  const scope: Scope = mode === "players" ? { mode, keys } : { mode, type };
  const ownerOf = useMemo(() => new Map(owners.map((o) => [o.key, o])), [owners]);
  const picked = owners.filter((o) => keys.includes(o.key));

  const rows = useMemo(() => (snapshot ? scopeRows(snapshot, owners, scope) : []), [snapshot, owners, mode, type, keys.join()]);
  const results = useMemo(() => totals(rows).filter((t) => matchesItem(t.item_id, query)), [rows, query]);
  const places = useMemo(() => (snapshot && item ? placesOf(snapshot, rows, item) : []), [snapshot, rows, item]);

  const pins: MapPin[] = useMemo(() => {
    if (!snapshot) return [];
    if (!item) {
      return snapshot.containers
        .filter((c) => c.owner_type && (mode === "players" ? c.owner_type === "player" && keys.includes(c.owner_key!) : type === "all" || c.owner_type === type))
        .map((c) => {
          const o = ownerOf.get(c.owner_key ?? "");
          return {
            id: c.id,
            x: c.x,
            z: c.z,
            ownerType: c.owner_type!,
            color: mode === "players" ? o?.color : undefined,
            label: mode === "players" && variant === "c" ? initials(o?.label ?? "") : undefined,
            title: `${c.owner_type === "player" ? `Kiste von ${c.owner_label}` : c.custom_name ?? "Kiste"} · ${coords(c)}`,
          };
        });
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
        label: variant === "c" && mode === "players" ? initials(p.row.owner_label) : String(n),
        title: `${ownerText(p)} · ${fmt.format(p.row.count)} · ${coords(p.container!)}`,
      }));
  }, [snapshot, item, places, mode, type, keys.join(), owners, variant]);

  const legend =
    mode === "players" ? picked.map((o) => ({ label: o.isMe ? `${o.label} (ich)` : o.label, color: o.color })) : undefined;

  if (!snapshot) return <div className="page"><Loading /></div>;

  const total = places.reduce((n, p) => n + p.row.count, 0);
  const toggle = (k: string) => setKeys(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
  const pick = (id: string) => {
    setItem(id);
    setSelected(null);
  };

  const searchBox = (
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
  );

  const modeSwitch = (
    <div className="seg" role="group" aria-label="Suchbereich">
      <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>Alle Items</button>
      <button type="button" aria-pressed={mode === "players"} onClick={() => setMode("players")}>Nach Spieler</button>
    </div>
  );

  const typeChips = (
    <div className="chips" role="group" aria-label="Filter nach Besitz">
      {TYPES.map((f) => (
        <button key={f} type="button" className="chip" aria-pressed={type === f} onClick={() => setType(f)}>
          {f !== "all" && <span className="dot" style={{ background: OWNER_COLOR[f] }} />}
          {TYPE_LABEL[f] ?? OWNER_LABEL[f as OwnerType]}
        </button>
      ))}
    </div>
  );

  const hiddenNote = mode === "players" && picked.some((o) => o.hidden) && (
    <p className="note">
      <LockIcon />
      {picked.filter((o) => o.hidden).map((o) => o.label).join(", ")} {picked.filter((o) => o.hidden).length === 1 ? "zeigt" : "zeigen"} Inventar und Enderkiste nur sich selbst. Gezählt werden nur die Kisten.
    </p>
  );

  const back = (
    <button type="button" className="btn btn-quiet" onClick={() => setItem(null)} style={{ marginLeft: -12, alignSelf: "flex-start" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      Alle Items
    </button>
  );

  const detailHead = item && (
    <div className="row" style={{ gap: 12 }}>
      <ItemIcon id={item} size={32} />
      <h1>
        <span className="num">{fmt.format(total)}</span> {itemName(item)}
      </h1>
    </div>
  );

  const placeRow = (p: Location, i: number, showOwner = true) => {
    const id = p.container?.id ?? `${p.row.source_kind}:${p.row.source_id}`;
    return (
      <button key={id} type="button" className="item-row" aria-current={selected === id} onClick={() => setSelected(id)}>
        <span className="pin" style={{ background: colorOf(p.row, scope, owners) }}>{p.container ? i + 1 : ""}</span>
        <span className="grow">
          <span>{showOwner ? ownerText(p) : p.container ? kindLabel(p.container.kind) : SOURCE_LABEL[p.row.source_kind]}</span>
          <span className="sub">{whereText(p)}</span>
        </span>
        <span className="qty">{fmt.format(p.row.count)}</span>
      </button>
    );
  };

  /** Anteil je Besitzer als Balken: im Spielerfilter je Spieler, sonst je Besitzart. */
  const split = (r: StockRow[]) => {
    const parts =
      mode === "players"
        ? [...byOwner(r)].map(([k, n]) => ({ label: ownerOf.get(k)?.isMe ? "Ich" : ownerOf.get(k)?.label ?? k, color: ownerOf.get(k)?.color ?? OWNER_COLOR.player, n }))
        : (["common", "player", "project", "unassigned"] as OwnerType[])
            .map((t) => ({ label: OWNER_LABEL[t], color: OWNER_COLOR[t], n: r.reduce((s, x) => (x.owner_type === t ? s + x.count : s), 0) }))
            .filter((x) => x.n > 0);
    if (!parts.length) return null;
    return (
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
    );
  };

  /** Fundorte nach Besitzer gruppiert (Spielerfilter) oder als eine Liste. */
  const placesList = () => {
    if (mode !== "players") return <div className="list">{places.map((p, i) => placeRow(p, i))}</div>;
    const groups = picked
      .map((o) => ({ o, list: places.map((p, i) => ({ p, i })).filter(({ p }) => p.row.owner_key === o.key) }))
      .filter((g) => g.list.length);
    return groups.map(({ o, list }) => (
      <div key={o.key} className="group">
        <div className="group-head">
          <span className="dot" style={{ background: o.color }} />
          <span>{o.isMe ? "Bei mir" : `Bei ${o.label}`}</span>
          <span className="spacer" />
          <span className="num faint">{fmt.format(list.reduce((n, { p }) => n + p.row.count, 0))}</span>
        </div>
        <div className="list">{list.map(({ p, i }) => placeRow(p, i, false))}</div>
      </div>
    ));
  };

  const emptyText =
    mode === "players" && !picked.length
      ? "Wähl oben mindestens einen Spieler aus."
      : query
        ? "Nichts gefunden. Versuch es mit dem deutschen oder englischen Namen, z. B. „Eisen“ oder „iron“."
        : "Hier liegt noch nichts.";

  // ── Variante A: Umschalter, Spieler-Chips, Liste mit Besitzern ──
  const sideA = (
    <>
      {searchBox}
      {modeSwitch}
      {mode === "all" ? typeChips : (
        <div className="chips" role="group" aria-label="Spieler">
          {owners.map((o) => (
            <button key={o.key} type="button" className="chip" aria-pressed={keys.includes(o.key)} onClick={() => toggle(o.key)} title={o.hidden ? "Inventar privat: nur Kisten" : undefined}>
              <span className="dot" style={{ background: o.color }} />
              {o.isMe ? "Ich" : o.label}
              {o.hidden && <LockIcon />}
            </button>
          ))}
        </div>
      )}
      {hiddenNote}
      {item ? (
        <>
          {back}
          {detailHead}
          {split(places.map((p) => p.row))}
          {placesList()}
        </>
      ) : (
        <div className="list" aria-label="Items">
          {results.length === 0 && <p className="empty">{emptyText}</p>}
          {results.slice(0, 200).map((t) => {
            const parts = mode === "players" ? [...byOwner(rows.filter((r) => r.item_id === t.item_id))] : [];
            return (
              <button key={t.item_id} type="button" className="item-row" onClick={() => pick(t.item_id)}>
                <ItemIcon id={t.item_id} />
                <span className="grow">
                  <span>{itemName(t.item_id)}</span>
                  <span className="sub">
                    {mode === "players"
                      ? parts.map(([k, n]) => `${ownerOf.get(k)?.isMe ? "ich" : ownerOf.get(k)?.label ?? k} ${fmt.format(n)}`).join(" · ")
                      : t.places === 1 ? "1 Ort" : `${t.places} Orte`}
                  </span>
                </span>
                <span className="qty">{fmt.format(t.count)}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  // ── Variante B: Spielerauswahl als Liste, Ergebnisse als Vergleichstabelle ──
  const cols = mode === "players" ? picked.slice(0, 4) : [];
  const sideB = (
    <>
      {searchBox}
      {modeSwitch}
      {mode === "all" ? typeChips : (
        <fieldset className="checklist">
          <legend className="sr-only">Spieler</legend>
          {owners.map((o) => (
            <label key={o.key} className="check">
              <input type="checkbox" checked={keys.includes(o.key)} onChange={() => toggle(o.key)} />
              <span className="avatar" style={{ background: o.color }}>{initials(o.label)}</span>
              <span className="grow">{o.isMe ? `${o.label} (ich)` : o.label}</span>
              {o.hidden ? <span className="faint small"><LockIcon /> nur Kisten</span> : o.online && <span className="small" style={{ color: "var(--up)" }}>online</span>}
            </label>
          ))}
        </fieldset>
      )}
      {hiddenNote}
      {item ? (
        <>
          {back}
          {detailHead}
          {split(places.map((p) => p.row))}
          <div className="list">{places.map((p, i) => placeRow(p, i))}</div>
        </>
      ) : results.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="table-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>Item</th>
                {cols.map((o) => (
                  <th key={o.key} className="r">
                    <span className="badge" style={{ justifyContent: "flex-end" }}>
                      <span className="dot" style={{ background: o.color }} />
                      {o.isMe ? "Ich" : o.label}
                    </span>
                  </th>
                ))}
                <th className="r">Summe</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 200).map((t) => {
                const per = byOwner(rows.filter((r) => r.item_id === t.item_id));
                return (
                  <tr key={t.item_id} onClick={() => pick(t.item_id)}>
                    <td>
                      <button type="button" className="cell-btn" onClick={() => pick(t.item_id)}>
                        <ItemIcon id={t.item_id} size={18} />
                        {itemName(t.item_id)}
                      </button>
                    </td>
                    {cols.map((o) => (
                      <td key={o.key} className={`r${per.get(o.key) ? "" : " faint"}`}>{per.get(o.key) ? fmt.format(per.get(o.key)!) : "–"}</td>
                    ))}
                    <td className="r strong">{fmt.format(t.count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  // ── Variante C: Spielerköpfe und Inventar-Raster ──
  const sideC = (
    <>
      <div className="heads" role="group" aria-label="Wessen Items?">
        <button type="button" className="head head-all" aria-pressed={mode === "all"} onClick={() => setMode("all")} title="Alle Items">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>
          <span className="head-label">Alle</span>
        </button>
        {owners.map((o) => {
          const on = mode === "players" && keys.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              className="head"
              aria-pressed={on}
              onClick={() => {
                if (mode === "all") {
                  setMode("players");
                  setKeys([o.key]);
                } else toggle(o.key);
              }}
              title={o.hidden ? `${o.label}: Inventar privat, nur Kisten` : o.label}
            >
              <span className="avatar" style={{ background: o.color }}>{initials(o.label)}</span>
              <span className="head-label">{o.isMe ? "Ich" : o.label}</span>
              {o.hidden && <span className="head-lock"><LockIcon /></span>}
            </button>
          );
        })}
      </div>
      {searchBox}
      {mode === "all" && typeChips}
      {hiddenNote}
      {item ? (
        <>
          {back}
          {detailHead}
          {split(places.map((p) => p.row))}
          {placesList()}
        </>
      ) : results.length === 0 ? (
        <p className="empty">{emptyText}</p>
      ) : (
        <div className="slots" aria-label="Items">
          {results.slice(0, 200).map((t) => {
            const holders = mode === "players" ? [...byOwner(rows.filter((r) => r.item_id === t.item_id)).keys()] : [];
            return (
              <button key={t.item_id} type="button" className="slot" onClick={() => pick(t.item_id)} title={`${itemName(t.item_id)}: ${fmt.format(t.count)}`}>
                <ItemIcon id={t.item_id} size={30} />
                <span className="slot-count">{t.count >= 10000 ? `${Math.round(t.count / 1000)}k` : t.count}</span>
                {holders.length > 0 && (
                  <span className="slot-owners">
                    {holders.map((k) => <span key={k} style={{ background: ownerOf.get(k)?.color }} />)}
                  </span>
                )}
                <span className="sr-only">{itemName(t.item_id)}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <main className="split">
      <section className={`side${variant === "b" ? " side-wide" : ""}`} aria-label="Suche">
        {variant === "a" ? sideA : variant === "b" ? sideB : sideC}
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
        <MapView pins={pins} zones={snapshot.zones} selectedId={selected} onSelect={setSelected} focus={`${item ?? "all"}|${mode}|${keys.join()}`} legend={legend} />
      </section>
    </main>
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

