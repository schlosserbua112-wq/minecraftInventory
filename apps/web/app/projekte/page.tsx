"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { fmt } from "@/lib/items";
import { projectPercent } from "@/lib/progress";

export default function ProjectsPage() {
  const { snapshot, actions } = useData();
  const router = useRouter();
  const [name, setName] = useState("");
  if (!snapshot) return <div className="page"><Loading /></div>;

  // Projekte aus der Tabelle plus solche, die nur über Kistennamen existieren
  const keys = new Map(snapshot.projects.map((p) => [p.key, p.label]));
  for (const c of snapshot.containers) if (c.owner_type === "project" && c.owner_key && !keys.has(c.owner_key)) keys.set(c.owner_key, c.owner_label ?? c.owner_key);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const key = await actions.addProject(name);
    router.push(`/projekte/${encodeURIComponent(key)}`);
  }

  return (
    <main className="page">
      <div className="row">
        <h1>Projekte</h1>
        <span className="spacer" />
        <form onSubmit={create} className="row" style={{ gap: 8 }}>
          <label className="sr-only" htmlFor="new-project">Neues Projekt</label>
          <input id="new-project" className="input" placeholder="Neues Projekt, z. B. Leuchtturm" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit">Anlegen</button>
        </form>
      </div>
      <p className="muted" style={{ margin: "-12px 0 0" }}>Kisten mit dem Namen „Projekt &lt;Name&gt;“ zählen automatisch zum Projekt.</p>
      <div className="panel">
        {[...keys].length === 0 && <p className="empty">Noch keine Projekte. Leg eins an oder benenne eine Kiste „Projekt Burg“.</p>}
        <div className="list" style={{ padding: "4px 16px" }}>
          {[...keys].map(([key, label]) => {
            const pct = projectPercent(snapshot, key);
            const stock = snapshot.stock.filter((r) => r.owner_type === "project" && r.owner_key === key).reduce((n, r) => n + r.count, 0);
            const open = snapshot.tasks.filter((t) => t.project_key === key && (t.status === "todo" || t.status === "in_progress")).length;
            return (
              <Link key={key} href={`/projekte/${encodeURIComponent(key)}`} className="item-row">
                <span className="grow">
                  <span style={{ fontWeight: 500 }}>{label}</span>
                  <span className="sub">
                    {fmt.format(stock)} Items gesammelt · {open} offene Aufgaben
                  </span>
                </span>
                {pct !== null && (
                  <span style={{ width: 180, display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="progress" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></span>
                    <span className="num" style={{ width: 40, textAlign: "right" }}>{pct} %</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
