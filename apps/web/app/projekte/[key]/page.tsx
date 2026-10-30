"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { Kanban } from "@/components/Kanban";
import { Loading } from "@/components/Loading";
import { MaterialImport } from "@/components/MaterialImport";
import { useData } from "@/lib/data";
import { fmt, itemName } from "@/lib/items";
import { projectBalance } from "@/lib/progress";

export default function ProjectPage() {
  const { key: raw } = useParams<{ key: string }>();
  const key = decodeURIComponent(raw);
  const { snapshot, actions } = useData();
  const [importing, setImporting] = useState(false);
  if (!snapshot) return <div className="page"><Loading /></div>;

  const label =
    snapshot.projects.find((p) => p.key === key)?.label ??
    snapshot.containers.find((c) => c.owner_type === "project" && c.owner_key === key)?.owner_label ??
    key;
  const balance = projectBalance(snapshot, key);
  const missingTotal = balance.reduce((n, b) => n + b.missing, 0);

  return (
    <main className="page">
      <div className="row">
        <Link href="/projekte" className="btn btn-quiet" style={{ marginLeft: -12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          Projekte
        </Link>
      </div>
      <div className="row">
        <h1 style={{ fontSize: 28 }}>{label}</h1>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setImporting((v) => !v)} aria-expanded={importing}>
          Materialliste einfügen
        </button>
      </div>

      {importing && <MaterialImport projectKey={key} onDone={() => setImporting(false)} />}

      <section className="panel" aria-labelledby="need">
        <div className="panel-head">
          <h2 id="need">Benötigt und vorhanden</h2>
          <span className="faint">{balance.length ? (missingTotal ? `${fmt.format(missingTotal)} fehlen noch` : "alles da") : ""}</span>
        </div>
        {balance.length === 0 ? (
          <p className="empty">Noch keine Ziele. Füge eine Materialliste ein, dann siehst du hier, was fehlt.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Benötigt</th>
                  <th className="r">In Projektkisten</th>
                  <th className="r">Im Allgemeingut</th>
                  <th className="r">Fehlt</th>
                  <th style={{ width: 160 }}>Fortschritt</th>
                  <th><span className="sr-only">Aktionen</span></th>
                </tr>
              </thead>
              <tbody>
                {balance.map((b) => {
                  const pct = Math.min(Math.round((b.inProject / b.needed) * 100), 100);
                  return (
                    <tr key={b.itemId}>
                      <td>
                        <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                          <ItemIcon id={b.itemId} size={18} />
                          {itemName(b.itemId)}
                        </span>
                      </td>
                      <td className="r">{fmt.format(b.needed)}</td>
                      <td className="r">{fmt.format(b.inProject)}</td>
                      <td className="r">{b.inCommon ? <Link href="/">{fmt.format(b.inCommon)}</Link> : "0"}</td>
                      <td className="r" style={{ color: b.missing ? "var(--down)" : "var(--up)", fontWeight: 600 }}>{fmt.format(b.missing)}</td>
                      <td>
                        <span className="progress" style={{ display: "block" }}><span style={{ width: `${pct}%` }} /></span>
                      </td>
                      <td className="r">
                        <button type="button" className="btn btn-quiet" aria-label={`${itemName(b.itemId)} entfernen`} onClick={() => actions.removeGoal(key, b.itemId)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="tasks" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 id="tasks">Aufgaben</h2>
        <Kanban projectKey={key} />
      </section>
    </main>
  );
}
