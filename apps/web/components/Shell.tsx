"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { signOut } from "@/lib/users";
import { Login } from "./Login";
import { PasswordForm } from "./PasswordForm";

const NAV = [
  { href: "/", label: "Suche" },
  { href: "/inventare", label: "Wer hat was?" },
  { href: "/projekte", label: "Projekte" },
  { href: "/entnahmen", label: "Diebstahl-Tracker" },
  { href: "/statistiken", label: "Statistiken" },
];

/** Einträge im Menü unter dem eigenen Namen. Verwaltung und Benutzer sehen nur Admins. */
const ACCOUNT_MENU = [
  { href: "/konto", label: "Kontoeinstellungen", admin: false },
  { href: "/verwaltung", label: "Verwaltung", admin: true },
  { href: "/benutzer", label: "Benutzer", admin: true },
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
  const nav = NAV;

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
        {profile && (
          <span className="row" style={{ gap: 4 }}>
            <AccountMenu name={profile.username} admin={profile.is_admin} pathname={pathname} />
            {mode === "live" && <button type="button" className="btn btn-quiet" onClick={signOut}>Abmelden</button>}
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

function AccountMenu({ name, admin, pathname }: { name: string; admin: boolean; pathname: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const items = ACCOUNT_MENU.filter((i) => admin || !i.admin);
  const here = items.some((i) => pathname.startsWith(i.href));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="menu" ref={box}>
      <button
        type="button"
        className="btn btn-quiet"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={here ? "page" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {name}
        <span aria-hidden="true" className="menu-caret">▾</span>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((i) => (
            <Link key={i.href} href={i.href} role="menuitem" aria-current={pathname.startsWith(i.href) ? "page" : undefined} onClick={() => setOpen(false)}>
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
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
