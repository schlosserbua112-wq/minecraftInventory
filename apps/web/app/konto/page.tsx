"use client";

import { PasswordForm } from "@/components/PasswordForm";
import { useData } from "@/lib/data";

export default function AccountPage() {
  const { mode, profile } = useData();
  return (
    <main className="page">
      <h1>Konto</h1>
      <section className="panel">
        <div className="panel-head">
          <h2>Passwort ändern</h2>
          <span className="faint">angemeldet als {profile?.username}</span>
        </div>
        <div className="panel-body">
          {mode === "demo" ? <p className="muted" style={{ margin: 0 }}>Im Demo-Modus gibt es keine Konten.</p> : <PasswordForm />}
        </div>
      </section>
    </main>
  );
}
