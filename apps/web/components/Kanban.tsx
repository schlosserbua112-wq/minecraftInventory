"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useData } from "@/lib/data";
import { TASK_STATUS, type TaskStatus } from "@/lib/types";

/** Kanban-Board je Projekt: Karten per Ziehen oder Auswahlfeld verschieben. */
export function Kanban({ projectKey }: { projectKey: string }) {
  const { snapshot, actions } = useData();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  if (!snapshot) return null;

  const tasks = snapshot.tasks.filter((t) => t.project_key === projectKey);
  const players = snapshot.players.map((p) => p.name).sort();

  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (id) actions.updateTask(id, { status });
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await actions.addTask({ project_key: projectKey, title: title.trim(), assignee: assignee || null, status: "todo" });
    setTitle("");
  }

  return (
    <>
      <form onSubmit={add} className="row" style={{ gap: 8 }}>
        <label className="sr-only" htmlFor="task-title">Neue Aufgabe</label>
        <input id="task-title" className="input" style={{ flex: "1 1 260px" }} placeholder="Neue Aufgabe, z. B. 428 Steinziegel brennen" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="sr-only" htmlFor="task-assignee">Verantwortlich</label>
        <select id="task-assignee" className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Niemand</option>
          {players.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn" type="submit">Hinzufügen</button>
      </form>
      <div className="kanban">
        {TASK_STATUS.map((col) => {
          const cards = tasks.filter((t) => t.status === col.id);
          return (
            <section
              key={col.id}
              className="kcol"
              data-over={over === col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={drop(col.id)}
              aria-label={col.label}
            >
              <div className="kcol-head">
                <span>{col.label}</span>
                <span className="faint num">{cards.length}</span>
              </div>
              <div className="kcards">
                {cards.length === 0 && <span className="faint" style={{ fontSize: 13, padding: 4 }}>Hierher ziehen</span>}
                {cards.map((t) => (
                  <article key={t.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}>
                    <span style={{ fontWeight: 500, textDecoration: t.status === "cancelled" ? "line-through" : undefined }}>{t.title}</span>
                    <div className="row" style={{ gap: 6 }}>
                      <label className="sr-only" htmlFor={`a${t.id}`}>Verantwortlich</label>
                      <select id={`a${t.id}`} className="select" value={t.assignee ?? ""} onChange={(e) => actions.updateTask(t.id, { assignee: e.target.value || null })}>
                        <option value="">Niemand</option>
                        {players.map((p) => <option key={p}>{p}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`s${t.id}`}>Status</label>
                      <select id={`s${t.id}`} className="select" value={t.status} onChange={(e) => actions.updateTask(t.id, { status: e.target.value as TaskStatus })}>
                        {TASK_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <span className="spacer" />
                      <button type="button" className="btn btn-quiet" style={{ minHeight: 32, padding: "0 8px" }} aria-label={`${t.title} löschen`} onClick={() => actions.removeTask(t.id)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
