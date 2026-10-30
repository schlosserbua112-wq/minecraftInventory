"use client";

import { useMemo, useState } from "react";
import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { MapView, type MapPin } from "@/components/MapView";
import { useData } from "@/lib/data";
import { OWNER_COLOR, coords, kindLabel } from "@/lib/derive";
import { fmt } from "@/lib/items";

type Filter = "all" | "free" | "mine" | "common" | "hidden";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "free", label: "Ohne Besitzer" },
  { id: "mine", label: "Meine Kisten" },
  { id: "common", label: "Allgemeinheit" },
  { id: "hidden", label: "Ausgeblendet" },
];

const ownerText = (c: { free: boolean; mine: boolean; common: boolean; owner_label: string | null }) =>
  c.free ? "ohne Besitzer" : c.mine ? "meine" : c.common ? "Allgemeinheit" : c.owner_label ?? "";

/** Koordinaten aus einer Kisten-ID "<dimension>:<x>:<y>:<z>". */
function posOf(id: string) {
  const [x, y, z] = id.split(":").slice(-3).map(Number);
  return { x: x!, y: y!, z: z! };
}

/**
 * Unbenannte Kisten in den Zonen. Jeder kann eine anklicken und „Meine“ wählen;
 * die Zuordnung hängt an der Position und übersteht neue Scans.
 */
export default function UnnamedChestsPage() {
  const { snapshot, actions, profile } = useData();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const me = profile?.username.toLowerCase() ?? "";
  const chests = useMemo(() => {
    if (!snapshot) return [];
    const sums = new Map<string, number>();
    for (const r of snapshot.stock) if (r.source_kind === "container") sums.set(r.source_id, (sums.get(r.source_id) ?? 0) + r.count);
    return snapshot.containers
      .filter((c) => c.custom_name === null && c.owner_type)
      .map((c) => ({
        ...c,
        items: sums.get(c.id) ?? 0,
        free: c.owner_type === "unassigned",
        common: c.owner_type === "common",
        mine: c.owner_type === "player" && c.owner_key === me,
      }))
      .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.free) - Number(a.free) || b.items - a.items);
  }, [snapshot, me]);

  const shown = filter === "hidden" ? [] : chests.filter((c) => filter === "all" || (filter === "free" ? c.free : filter === "common" ? c.common : c.mine));
  const pins: MapPin[] = shown.map((c) => ({
    id: c.id,
    x: c.x,
    z: c.z,
    ownerType: c.owner_type!,
    title: `${ownerText(c)} · ${coords(c)}`,
  }));

  if (!snapshot) return <div className="page"><Loading /></div>;

  const chest = chests.find((c) => c.id === selected);
  const rows = chest ? snapshot.stock.filter((r) => r.source_kind === "container" && r.source_id === chest.id) : [];
  // Kisten in derselben Spalte und direkt daneben (Doppelkisten, Stapel), oben zuerst
  const nearby = chest
    ? chests
        .filter((c) => c.dimension === chest.dimension && Math.abs(c.x - chest.x) <= 1 && Math.abs(c.z - chest.z) <= 1)
        .sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z)
    : [];
  const canRelease = chest && !chest.free && (chest.mine || chest.common || profile?.is_admin);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="split">
      <section className="side" aria-label="Unbenannte Kisten">
        <h1>Unbenannte Kisten</h1>
        {!snapshot.showUnnamed && (
          <p className="muted" style={{ margin: 0 }}>
            Ein Admin hat unbenannte Kisten ausgeblendet. Hier stehen nur noch Kisten, die schon jemand als „Meine“ markiert hat.
          </p>
        )}
        <div className="chips" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>

        {chest ? (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setSelected(null)} style={{ marginLeft: -12, alignSelf: "flex-start" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              Alle Kisten
            </button>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2>{kindLabel(chest.kind)} bei {coords(chest)}</h2>
              <span className="muted">
                {chest.free ? "Gehört noch niemandem." : chest.mine ? "Gehört dir." : chest.common ? "Gehört der Allgemeinheit und zählt wie eine Kiste „Allgemein“." : `Gehört ${chest.owner_label}.`}
              </span>
            </div>
            <div className="row">
              {chest.free && snapshot.showUnnamed && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => actions.claimContainer(chest.id, true))}>Meine</button>
              )}
              {chest.free && snapshot.showUnnamed && (
                <button type="button" className="btn" disabled={busy} onClick={() => act(() => actions.claimCommon(chest.id))}>Allgemeinheit</button>
              )}
              {canRelease && (
                <button type="button" className="btn" disabled={busy} onClick={() => act(() => actions.claimContainer(chest.id, false))}>
                  {chest.mine ? "Nicht meine" : chest.common ? "Nicht Allgemeinheit" : `Von ${chest.owner_label} lösen`}
                </button>
              )}
              {chest.free && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={busy}
                  title="Für Kisten, die niemandem gehören, z. B. schon geöffnete Loot-Kisten in Höhlen oder Strukturen"
                  onClick={() => act(async () => { await actions.hideContainer(chest.id, true); setSelected(null); })}
                >
                  Keine Spielerkiste, ausblenden
                </button>
              )}
            </div>
            {error && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{error}</p>}
            {nearby.length > 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="muted small">{nearby.length} Kisten an dieser Stelle</span>
                <div className="list" aria-label="Kisten an dieser Stelle">
                  {nearby.map((c) => (
                    <button key={c.id} type="button" className="item-row" aria-current={c.id === chest.id} onClick={() => { setSelected(c.id); setError(""); }}>
                      <span className="dot" style={{ background: OWNER_COLOR[c.owner_type!] }} />
                      <span className="grow">
                        <span>{kindLabel(c.kind)} · Höhe {c.y}</span>
                        <span className="sub">{ownerText(c)} · {coords(c)}</span>
                      </span>
                      <span className="qty">{fmt.format(c.items)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="panel">
              <div className="panel-head"><h2>Inhalt</h2><span className="faint num">{fmt.format(chest.items)}</span></div>
              <ItemTable rows={rows} empty="Die Kiste ist leer." />
            </div>
          </>
        ) : filter === "hidden" ? (
          <div className="list" aria-label="Ausgeblendete Kisten">
            {snapshot.hidden.length === 0 && <p className="empty">Keine Kiste ausgeblendet.</p>}
            {error && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{error}</p>}
            {snapshot.hidden.map((id) => (
              <div key={id} className="item-row" style={{ cursor: "default" }}>
                <span className="dot" style={{ background: "var(--line-strong)" }} />
                <span className="grow">
                  <span>{coords(posOf(id))}</span>
                  <span className="sub">zählt nicht mit</span>
                </span>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => act(() => actions.hideContainer(id, false))}>
                  Wieder einblenden
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="list" aria-label="Kisten">
            {shown.length === 0 && (
              <p className="empty">
                {chests.length === 0
                  ? "Noch keine unbenannten Kisten mit Inhalt in den Zonen. Der Sammler liefert sie nach dem Einschalten mit seiner nächsten Runde."
                  : "Keine Kiste in diesem Filter."}
              </p>
            )}
            {shown.map((c) => (
              <button key={c.id} type="button" className="item-row" onClick={() => { setSelected(c.id); setError(""); }}>
                <span className="dot" style={{ background: OWNER_COLOR[c.owner_type!] }} />
                <span className="grow">
                  <span>{kindLabel(c.kind)} · {coords(c)}</span>
                  <span className="sub">{ownerText(c)}</span>
                </span>
                <span className="qty">{fmt.format(c.items)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="main with-map" aria-label="Karte">
        <div className="row" style={{ fontSize: 13, color: "var(--muted)" }}>
          <span style={{ color: "var(--text)", fontWeight: 500 }}>Oberwelt</span>
          <span>Kiste anklicken, dann „Meine“ oder „Allgemeinheit“ wählen</span>
          <span className="spacer" />
          <span>{pins.length} Kisten</span>
        </div>
        <MapView pins={pins} zones={snapshot.zones} selectedId={selected} onSelect={(id) => { setSelected(id); setError(""); }} focus={filter} />
      </section>
    </main>
  );
}
