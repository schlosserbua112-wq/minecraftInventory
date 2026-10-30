"use client";

import { useState, type FormEvent } from "react";
import { changeOwnPassword } from "@/lib/users";

/** Eigenes Passwort ändern: altes Passwort zur Bestätigung, neues zweimal. */
export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "error"; text?: string }>({ kind: "idle" });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) return setState({ kind: "error", text: "Das neue Passwort braucht mindestens 8 Zeichen." });
    if (newPw !== repeat) return setState({ kind: "error", text: "Die beiden neuen Passwörter sind nicht gleich." });
    setState({ kind: "busy" });
    try {
      await changeOwnPassword(oldPw, newPw);
      setOldPw("");
      setNewPw("");
      setRepeat("");
      setState({ kind: "ok", text: "Passwort geändert." });
      onDone?.();
    } catch (err) {
      setState({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 380 }}>
      <label className="field">
        Aktuelles Passwort
        <input className="input" type="password" required autoComplete="current-password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      </label>
      <label className="field">
        Neues Passwort
        <input className="input" type="password" required minLength={8} autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </label>
      <label className="field">
        Neues Passwort wiederholen
        <input className="input" type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={state.kind === "busy"}>
          {state.kind === "busy" ? "Speichere …" : "Passwort ändern"}
        </button>
        {state.text && (
          <span role={state.kind === "error" ? "alert" : "status"} style={{ color: state.kind === "error" ? "var(--down)" : "var(--up)" }}>
            {state.text}
          </span>
        )}
      </div>
    </form>
  );
}
