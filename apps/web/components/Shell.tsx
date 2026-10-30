"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { signOut } from "@/lib/users";
import { Login } from "./Login";
import { PasswordForm } from "./PasswordForm";

const NAV = [
  { href: "/", label: "Suche" },
  { href: "/inventare", label: "Wer hat was?" },
  { href: "/projekte", label: "Projekte" },
  { href: "/verwaltung", label: "Verwaltung" },
];

/** Lebenszeichen des Pi: nach 2 Minuten ohne Heartbeat gilt er als offline. */
function useNow(ms = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode, snapshot, session, authReady, error, profile, reloadProfile } = useData();
  const now = useNow();

  if (mode === "live") {
    if (!authReady) return null;
    if (!session) return <Login />;
    if (profile === undefined) return null;
    if (profile === null)
      return (
        <Gate title="Kein Zugang">
          <p className="muted" style={{ margin: 0 }}>Dein Konto hat noch keinen Zugang zum Tracker. Frag Valentin.</p>
          <button className="btn" type="button" onClick={signOut}>Abmelden</button>
        </Gate>
      );
    if (profile.must_change_password)
      return (
        <Gate title={`Hallo ${profile.username}`}>
          <p className="muted" style={{ margin: 0 }}>Bitte leg dir zuerst ein eigenes Passwort fest.</p>
          <PasswordForm onDone={reloadProfile} />
        </Gate>
      );
  }
  const nav = [
    ...NAV.slice(0, 2),
    ...(snapshot?.showUnnamed ? [{ href: "/kisten", label: "Unbenannte Kisten" }] : []),
    ...NAV.slice(2, 3),
    { href: "/entnahmen", label: "Entnahmen" },
    { href: "/statistiken", label: "Statistiken" },
    ...NAV.slice(3),
    ...(profile?.is_admin ? [{ href: "/benutzer", label: "Benutzer" }] : []),
  ];

  const beat = snapshot?.status?.heartbeat_at;
  const offline = mode === "live" && (!beat || now - Date.parse(beat) > 120_000);
  const online = snapshot?.players.filter((p) => p.online).length ?? 0;

  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark">
          Ressourcen-Tracker
        </Link>
        <nav className="nav" aria-label="Ansichten">
          {nav.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <span className="status" aria-live="polite">
          <span className="dot" style={{ background: offline ? "var(--down)" : "var(--up)" }} />
          {snapshot ? `${ago(beat, now)} aktualisiert · ${online} von ${snapshot.players.length} online` : "lädt …"}
        </span>
        {mode === "live" && profile && (
          <span className="row" style={{ gap: 4 }}>
            <Link href="/konto" className="btn btn-quiet" aria-current={pathname === "/konto" ? "page" : undefined}>{profile.username}</Link>
            <button type="button" className="btn btn-quiet" onClick={signOut}>Abmelden</button>
          </span>
        )}
      </header>
      {mode === "demo" && <div className="banner">Demo-Modus: Beispieldaten, nichts wird gespeichert. Mit Supabase-Zugang zeigt die Seite echte Bestände.</div>}
      {offline && snapshot && <div className="banner">Der Sammler auf dem Pi meldet sich nicht ({ago(beat, now)}). Angezeigt wird der letzte bekannte Stand.</div>}
      {error && <div className="banner">Daten konnten nicht geladen werden: {error}</div>}
      {children}
    </>
  );
}

function Gate({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <section className="panel" style={{ width: "100%", maxWidth: 420, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="wordmark">Ressourcen-Tracker</span>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
