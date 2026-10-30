"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { Login } from "./Login";

const NAV = [
  { href: "/", label: "Suche" },
  { href: "/spieler", label: "Spieler" },
  { href: "/allgemein", label: "Allgemein" },
  { href: "/projekte", label: "Projekte" },
  { href: "/verlauf", label: "Verlauf" },
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
  const { mode, snapshot, session, authReady, error } = useData();
  const now = useNow();

  if (mode === "live" && authReady && !session) return <Login />;

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
          {NAV.map((n) => {
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
      </header>
      {mode === "demo" && <div className="banner">Demo-Modus: Beispieldaten, nichts wird gespeichert. Mit Supabase-Zugang zeigt die Seite echte Bestände.</div>}
      {offline && snapshot && <div className="banner">Der Sammler auf dem Pi meldet sich nicht ({ago(beat, now)}). Angezeigt wird der letzte bekannte Stand.</div>}
      {error && <div className="banner">Daten konnten nicht geladen werden: {error}</div>}
      {children}
    </>
  );
}
