"use client";

import { parseMaterialList } from "@mc/core";
import { useMemo, useState } from "react";
import { useData } from "@/lib/data";
import { fmt, itemName } from "@/lib/items";
import { ItemIcon } from "./ItemIcon";
import { useItemNames } from "@/lib/itemicons";

/** Materialliste einfügen oder hochladen, Vorschau prüfen, dann als Projektziele speichern. */
export function MaterialImport({ projectKey, onDone }: { projectKey: string; onDone: () => void }) {
  useItemNames(); // deutsche Namen nachladen
  const { actions, snapshot } = useData();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "add">("replace");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseMaterialList(text), [text]);
  const hasGoals = snapshot?.goals.some((g) => g.project_key === projectKey);

  async function save() {
    setSaving(true);
    try {
      await actions.setGoals(projectKey, parsed.items.map((i) => ({ item_id: i.itemId, target: i.count })), hasGoals ? mode : "replace", text);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-label="Materialliste">
      <div className="panel-head">
        <h2>Materialliste</h2>
        <label className="btn btn-quiet" style={{ cursor: "pointer" }}>
          Datei wählen
          <input
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setText(await f.text());
            }}
          />
        </label>
      </div>
      <div className="panel-body cols">
        <label className="field">
          Liste einfügen (eine Zeile pro Material, z. B. „428× Stone Bricks“)
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Materials for Medieval Nether Portal\n428× Stone Bricks  (6 stacks + 44)\n104× Cobblestone"} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {parsed.title && <p style={{ margin: 0 }}>Erkannt: <strong>{parsed.title}</strong>{parsed.info && <span className="faint"> · {parsed.info}</span>}</p>}
          {parsed.items.length === 0 ? (
            <p className="empty" style={{ padding: 0 }}>Die Vorschau erscheint, sobald du eine Liste einfügst.</p>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
              <table>
                <tbody>
                  {parsed.items.map((i) => (
                    <tr key={i.itemId}>
                      <td>
                        <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                          <ItemIcon id={i.itemId} size={18} />
                          <span>
                            {itemName(i.itemId)} <span className="faint" style={{ fontSize: 12 }}>{i.itemId}</span>
                          </span>
                        </span>
                      </td>
                      <td className="r">{fmt.format(i.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parsed.skipped.length > 0 && (
            <p style={{ margin: 0, color: "var(--down)", fontSize: 13 }}>Nicht erkannt: {parsed.skipped.join(" · ")}</p>
          )}
          {hasGoals && parsed.items.length > 0 && (
            <div className="chips" role="radiogroup" aria-label="Bestehende Ziele">
              <button type="button" className="chip" role="radio" aria-checked={mode === "replace"} aria-pressed={mode === "replace"} onClick={() => setMode("replace")}>Ziele ersetzen</button>
              <button type="button" className="chip" role="radio" aria-checked={mode === "add"} aria-pressed={mode === "add"} onClick={() => setMode("add")}>Zu Zielen addieren</button>
            </div>
          )}
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!parsed.items.length || saving} onClick={save}>
              {saving ? "Speichere …" : `${parsed.items.length} Ziele übernehmen`}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onDone}>Abbrechen</button>
          </div>
        </div>
      </div>
    </section>
  );
}
