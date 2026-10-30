"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/users";

/** Anmeldung mit Benutzername und Passwort. Konten legt ein Admin an. */
export function Login() {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(name, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="panel" style={{ width: "100%", maxWidth: 380, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="wordmark">Ressourcen-Tracker</span>
        <label className="field">
          Name
          <input className="input" required autoComplete="username" autoCapitalize="none" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Passwort
          <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Melde an …" : "Anmelden"}
        </button>
        {error && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{error}</p>}
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>Noch kein Konto? Frag Valentin.</p>
      </form>
    </main>
  );
}
