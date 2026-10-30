"use client";

import { regionsForZone } from "@mc/core";
import { useState, type FormEvent } from "react";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { ago, coords, kindLabel } from "@/lib/derive";

export default function AdminPage() {
  const { snapshot, actions } = useData();
  const [form, setForm] = useState({ name: "", x: "0", z: "0", r: "200" });
  const [busy, setBusy] = useState(false);
  if (!snapshot) return <div className="page"><Loading /></div>;

  const unassigned = snapshot.containers.filter((c) => c.owner_type === "unassigned");
  const lastScan = snapshot.scans[0];
  const scanning = lastScan && !lastScan.finished_at;

  async function addZone(e: FormEvent) {
    e.preventDefault();
    const r = Number(form.r), x = Number(form.x), z = Number(form.z);
    if (!form.name.trim() || !(r > 0) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    await actions.addZone({ name: form.name.trim(), dimension: "minecraft:overworld", center_x: x, center_z: z, radius: r, is_main: snapshot!.zones.length === 0 });
    setForm({ name: "", x: "0", z: "0", r: "200" });
  }

  return (
    <main className="page">
      <h1>Verwaltung</h1>

      <section className="panel" aria-labelledby="scan">
        <div className="panel-head">
          <h2 id="scan">Nach neuen Kisten suchen</h2>
          <span className="faint">Sammler {snapshot.status?.mode ?? "unbekannt"} · {ago(snapshot.status?.heartbeat_at)}</span>
        </div>
        <div className="panel-body row">
          <p className="muted" style={{ margin: 0, flex: "1 1 320px" }}>
            Der Pi prüft die Zonen ohnehin alle 10 Minuten und nachts die ganze Welt. Mit dem Knopf geht es sofort.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || Boolean(scanning)}
            onClick={async () => {
              setBusy(true);
              await actions.requestScan().finally(() => setBusy(false));
            }}
          >
            {scanning ? "Suche läuft …" : "Jetzt suchen"}
          </button>
          {lastScan?.finished_at && <span className="faint" style={{ flexBasis: "100%" }}>Letzte Suche {ago(lastScan.finished_at)}: {lastScan.result}</span>}
        </div>
      </section>

      <div className="cols">
        <section className="panel" aria-labelledby="zones">
          <div className="panel-head"><h2 id="zones">Zonen</h2><span className="faint">Region-Dateien, die regelmäßig geprüft werden</span></div>
          <div className="list" style={{ padding: "4px 16px" }}>
            {snapshot.zones.length === 0 && <p className="empty">Noch keine Zone. Leg die Hauptbasis an: Mittelpunkt und Radius in Blöcken.</p>}
            {snapshot.zones.map((z) => (
              <div key={z.id} className="item-row" style={{ cursor: "default" }}>
                <span className="grow">
                  <span>{z.name}{z.is_main && <span className="faint"> · Hauptzone</span>}</span>
                  <span className="sub">{z.center_x} / {z.center_z}, Radius {z.radius} · {regionsForZone(z.center_x, z.center_z, z.radius).join(", ")}</span>
                </span>
                <button type="button" className="btn btn-quiet" aria-label={`${z.name} löschen`} onClick={() => actions.removeZone(z.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={addZone} className="panel-body row" style={{ borderTop: "1px solid var(--line)", alignItems: "flex-end" }}>
            <label className="field" style={{ flex: "2 1 160px" }}>Name<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Farm im Norden" /></label>
            <label className="field" style={{ flex: "1 1 80px" }}>x<input className="input num" inputMode="numeric" value={form.x} onChange={(e) => setForm({ ...form, x: e.target.value })} /></label>
            <label className="field" style={{ flex: "1 1 80px" }}>z<input className="input num" inputMode="numeric" value={form.z} onChange={(e) => setForm({ ...form, z: e.target.value })} /></label>
            <label className="field" style={{ flex: "1 1 80px" }}>Radius<input className="input num" inputMode="numeric" value={form.r} onChange={(e) => setForm({ ...form, r: e.target.value })} /></label>
            <button className="btn" type="submit">Zone anlegen</button>
          </form>
        </section>

        <section className="panel" aria-labelledby="unassigned">
          <div className="panel-head"><h2 id="unassigned">Nicht zugeordnet</h2><span className="faint">{unassigned.length} Kisten</span></div>
          {unassigned.length === 0 ? (
            <p className="empty">Alle benannten Kisten passen zu einer Regel.</p>
          ) : (
            <>
              <p className="muted" style={{ margin: 0, padding: "12px 16px 0" }}>
                Der Name passt zu keiner Regel. Gültig sind ein Spielername, „Allgemein“ oder „Projekt &lt;Name&gt;“. Zum Umbenennen die Kiste leeren, abbauen, im Amboss neu benennen und wieder aufstellen.
              </p>
              <div className="list" style={{ padding: "4px 16px 8px" }}>
                {unassigned.map((c) => (
                  <div key={c.id} className="item-row" style={{ cursor: "default" }}>
                    <span className="grow">
                      <span>„{c.custom_name}“ · {kindLabel(c.kind)}</span>
                      <span className="sub">{coords(c)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
