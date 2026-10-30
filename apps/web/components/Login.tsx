"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

/** Anmeldung per Magic Link. Lesen dürfen nur E-Mails aus der Freundesliste (RLS). */
export function Login() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else setState("sent");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="panel" style={{ width: "100%", maxWidth: 400, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="wordmark">Ressourcen-Tracker</span>
        <p className="muted" style={{ margin: 0 }}>Nur für unsere Minecraft-Runde. Gib deine E-Mail ein, du bekommst einen Anmeldelink.</p>
        <label className="field">
          E-Mail
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sende …" : "Anmeldelink senden"}
        </button>
        {state === "sent" && <p style={{ margin: 0, color: "var(--up)" }}>Link ist unterwegs. Schau in dein Postfach.</p>}
        {state === "error" && <p style={{ margin: 0, color: "var(--down)" }}>Das hat nicht geklappt: {message}</p>}
      </form>
    </main>
  );
}
