"use client";

import { useState, type FormEvent } from "react";
import { claimAccount, signIn } from "@/lib/users";

/**
 * Anmeldung mit Benutzername und Passwort.
 * Wer zum ersten Mal kommt, legt mit seinem Minecraft-Namen selbst ein Passwort fest.
 */
export function Login() {
  const [first, setFirst] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (first && password !== repeat) return setError("Die beiden Passwörter sind nicht gleich.");
    setBusy(true);
    try {
      if (first) await claimAccount(name.trim(), password);
      await signIn(name.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setFirst(!first);
    setError("");
    setPassword("");
    setRepeat("");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="panel" style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="wordmark">Ressourcen-Tracker</span>
        {first && <p className="muted" style={{ margin: 0, fontSize: 14 }}>Gib deinen Minecraft-Namen ein und lege dein Passwort fest. Das geht, sobald du einmal auf dem Server warst.</p>}
        <label className="field">
          {first ? "Minecraft-Name" : "Name oder Alias"}
          <input className="input" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          {first ? "Neues Passwort" : "Passwort"}
          <input className="input" type="password" required autoComplete={first ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {first && (
          <label className="field">
            Passwort wiederholen
            <input className="input" type="password" required autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? (first ? "Lege Konto an …" : "Melde an …") : first ? "Konto anlegen und anmelden" : "Anmelden"}
        </button>
        {error && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{error}</p>}
        <button type="button" className="btn btn-quiet" onClick={switchMode} style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
          {first ? "Ich habe schon ein Konto" : "Zum ersten Mal hier? Passwort festlegen"}
        </button>
      </form>
    </main>
  );
}
