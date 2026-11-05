"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseMaterialList } from "@mc/core";
import { ItemIcon } from "@/components/ItemIcon";
import { fmt, itemName } from "@/lib/items";
import { knownItemIds, useItemNames } from "@/lib/itemicons";
import type { Project } from "@/lib/types";

export type ImportTarget = { name: string } | { id: number };
export type ImportMode = "set" | "add";

const EXAMPLE = "Materials for Burg:\n\n* Stone Bricks: 1,234\n* Oak Log: 64";

/**
 * Materialliste (z. B. aus Litematica: „Materials for X:“ und „* Stone Bricks: 1,234“) einfügen
 * oder als .txt hochladen, prüfen und in ein neues oder bestehendes Projekt übernehmen.
 */
export function MaterialImport({
  projects,
  activeId,
  onClose,
  onImport,
}: {
  projects: Project[];
  activeId: number | null;
  onClose: () => void;
  onImport: (target: ImportTarget, items: { item_id: string; quantity: number }[], mode: ImportMode) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [target, setTarget] = useState<"new" | number>("new");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [mode, setMode] = useState<ImportMode>("set");
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const namesVersion = useItemNames(); // Item-Liste kommt nachgeladen dazu
  const known = useMemo(() => {
    const ids = knownItemIds();
    return ids.length ? new Set(ids) : undefined;
  }, [namesVersion]);
  const list = useMemo(() => parseMaterialList(text, known), [text, known]);
  const unknown = useMemo(() => new Set(list.unknown.map((u) => u.itemId)), [list]);

  // Projektname aus der Kopfzeile vorschlagen, solange niemand selbst einen eingetippt hat
  useEffect(() => {
    if (!nameTouched) setName(list.title ?? "");
  }, [list.title, nameTouched]);
  // Unbekannte Items erst mal abwählen, bekannte an
  useEffect(() => setOff(new Set(list.unknown.map((u) => u.itemId))), [list]);

  useEffect(() => {
    textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
  }

  const chosen = list.items.filter((i) => !off.has(i.itemId));
  const total = chosen.reduce((s, i) => s + i.count, 0);
  const existing = typeof target === "number" ? projects.find((p) => p.id === target) : undefined;
  const ready = chosen.length > 0 && (target !== "new" || !!name.trim()) && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await onImport(
        target === "new" ? { name: name.trim().slice(0, 60) } : { id: target },
        chosen.map((i) => ({ item_id: i.itemId, quantity: i.count })),
        mode,
      );
      onClose();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const toggle = (id: string) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="panel sheet" role="dialog" aria-modal="true" aria-labelledby="import-title" onSubmit={submit}>
        <div className="panel-head">
          <h2 id="import-title">Materialliste importieren</h2>
          <button type="button" className="btn btn-quiet btn-small" onClick={onClose} disabled={busy} aria-label="Schließen">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="panel-body sheet-body">
          <div className="import-source">
            <label htmlFor="import-text" className="muted">Liste einfügen, etwa aus Litematica, oder als Textdatei hochladen</label>
            <textarea id="import-text" ref={textRef} className="textarea" placeholder={EXAMPLE} value={text} onChange={(e) => { setText(e.target.value); setFileName(null); }} spellCheck={false} />
            <div className="row" style={{ gap: 8 }}>
              <label className="btn btn-small">
                Datei wählen
                <input type="file" accept=".txt,text/plain" className="sr-only" onChange={readFile} />
              </label>
              {fileName && <span className="faint">{fileName}</span>}
              {text && <button type="button" className="btn btn-quiet btn-small" onClick={() => { setText(""); setFileName(null); }}>Leeren</button>}
            </div>
          </div>

          {text.trim() && (
            list.items.length === 0 ? (
              <p className="empty" style={{ margin: 0 }}>Keine Materialien erkannt. Erwartet werden Zeilen wie „* Stone Bricks: 1,234“.</p>
            ) : (
              <>
                <div className="import-target">
                  <span className="row" style={{ gap: 8 }}>
                    <label className="sr-only" htmlFor="import-into">Ziel</label>
                    <select id="import-into" className="select" value={String(target)} onChange={(e) => setTarget(e.target.value === "new" ? "new" : Number(e.target.value))}>
                      <option value="new">Neues Projekt</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          In „{p.name}“{p.id === activeId ? " (offen)" : ""}
                        </option>
                      ))}
                    </select>
                    {target === "new" ? (
                      <>
                        <label className="sr-only" htmlFor="import-name">Name des neuen Projekts</label>
                        <input id="import-name" className="input" style={{ flex: "1 1 180px", minWidth: 0 }} maxLength={60} placeholder="Name des Projekts" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} />
                      </>
                    ) : (
                      <span className="chips" role="radiogroup" aria-label="Wenn ein Item schon im Projekt ist">
                        <button type="button" role="radio" className="chip" aria-checked={mode === "set"} aria-pressed={mode === "set"} onClick={() => setMode("set")}>Mengen ersetzen</button>
                        <button type="button" role="radio" className="chip" aria-checked={mode === "add"} aria-pressed={mode === "add"} onClick={() => setMode("add")}>Mengen addieren</button>
                      </span>
                    )}
                  </span>
                  {target === "new" && list.title && name.trim() !== list.title && <span className="faint">Name in der Liste: {list.title}</span>}
                  {existing && <span className="faint">{existing.items.length} Items sind schon drin. {mode === "set" ? "Gleiche Items bekommen die Menge aus der Liste." : "Mengen aus der Liste kommen zu den vorhandenen dazu."} Andere bleiben, wie sie sind.</span>}
                </div>

                <div className="import-list" aria-label="Erkannte Materialien">
                  {list.items.map((i) => {
                    const isUnknown = unknown.has(i.itemId);
                    const prev = existing?.items.find((x) => x.item_id === i.itemId)?.quantity;
                    return (
                      <label key={i.itemId} className="import-row" data-off={off.has(i.itemId) || undefined}>
                        <input type="checkbox" checked={!off.has(i.itemId)} onChange={() => toggle(i.itemId)} />
                        <ItemIcon id={i.itemId} size={18} />
                        <span className="grow">
                          <span>{isUnknown ? i.name : itemName(i.itemId)}</span>
                          <span className="sub">
                            {isUnknown ? "nicht erkannt, bitte prüfen" : i.name}
                            {prev ? ` · schon ${fmt.format(prev)} im Projekt` : ""}
                          </span>
                        </span>
                        <span className="num">{fmt.format(i.count)}</span>
                      </label>
                    );
                  })}
                </div>
                {list.skipped.length > 0 && (
                  <details className="faint">
                    <summary>{list.skipped.length} {list.skipped.length === 1 ? "Zeile" : "Zeilen"} übersprungen</summary>
                    <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{list.skipped.slice(0, 20).map((s, n) => <li key={n}>{s}</li>)}</ul>
                  </details>
                )}
              </>
            )
          )}
          {problem && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{problem}</p>}
        </div>

        <div className="sheet-foot">
          <span className="faint">{chosen.length > 0 ? `${chosen.length} Items · ${fmt.format(total)} Stück` : ""}</span>
          <span className="spacer" />
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>{busy ? "Übernehme …" : target === "new" ? "Projekt anlegen" : "Übernehmen"}</button>
        </div>
      </form>
    </div>
  );
}
