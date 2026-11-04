import { useEffect, useMemo, useState } from "react";
import type { OwnerType, StockRow } from "@mc/core";
import { useData } from "./data";
import { OWNER_COLOR, locations, type Location } from "./derive";
import type { Snapshot } from "./types";
import { listProfiles, type Profile } from "./users";

/**
 * Gut unterscheidbare Spielerfarben; die Besitzart-Farben bleiben für "Alle".
 * Muss zu private.player_palette() in der Datenbank passen (Migration 20261031000200_player_colors.sql).
 */
export const PLAYER_COLORS = ["#4ea8ff", "#ff8a3d", "#6ad15a", "#ff5fa2", "#2fd4c4", "#ffd43b", "#a67cff", "#e8483f", "#c8a27a", "#f2f2f2"];

/** Feste Ersatzfarbe aus dem Namen, für Spieler ohne Konto (oder ohne gespeicherte Farbe). */
export function fallbackColor(key: string): string {
  let h = 0;
  for (const ch of key.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export interface Owner {
  /** owner_key der Bestände (Kontoname oder Spielername, klein) */
  key: string;
  label: string;
  color: string;
  isMe: boolean;
  /** Inventar und Enderkiste sind privat; es zählen nur die Kisten. */
  hidden: boolean;
  online: boolean;
  /** Zuletzt auf dem Server gesehen (ISO), über alle Minecraft-Namen des Kontos */
  lastSeen: string | null;
}

export type Scope = { mode: "all"; type: OwnerType | "all" } | { mode: "players"; keys: string[] };

/** Demo: ein Konto mit privatem Inventar, damit der Zustand sichtbar ist. */
const DEMO_PROFILES: Profile[] = [
  { id: "demo", username: "Vale", is_admin: true, must_change_password: false, created_at: new Date(0).toISOString(), inventory_public: true, aliases: [], color: PLAYER_COLORS[0] },
  { id: "demo-lena", username: "Lena", is_admin: false, must_change_password: false, created_at: new Date(0).toISOString(), inventory_public: false, aliases: [], color: PLAYER_COLORS[3] },
];

function useProfiles(): Profile[] {
  const { mode } = useData();
  const [profiles, setProfiles] = useState<Profile[]>(mode === "demo" ? DEMO_PROFILES : []);
  useEffect(() => {
    if (mode === "live") listProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, [mode]);
  return profiles;
}

/** Alle Spieler, denen etwas gehören kann, "ich" zuerst. */
export function useOwners(): Owner[] {
  const { snapshot, profile } = useData();
  const profiles = useProfiles();
  const meId = profile?.id;

  return useMemo(() => {
    if (!snapshot) return [];
    const accountOf = new Map<string, Profile>();
    for (const p of profiles) {
      accountOf.set(p.username.toLowerCase(), p);
      for (const a of p.aliases ?? []) accountOf.set(a.toLowerCase(), p);
    }
    const byKey = new Map<string, Owner>();
    const add = (key: string, label: string, online = false, lastSeen: string | null = null) => {
      const acc = accountOf.get(key);
      const prev = byKey.get(key);
      byKey.set(key, {
        key,
        label: prev?.label ?? acc?.username ?? label,
        // Fest pro Konto gespeichert, damit jeder Spieler bei allen Betrachtern gleich aussieht
        color: acc?.color ?? fallbackColor(key),
        isMe: !!acc && acc.id === meId,
        hidden: !!acc && !acc.inventory_public && acc.id !== meId,
        online: (prev?.online ?? false) || online,
        lastSeen: [prev?.lastSeen, lastSeen].filter((t): t is string => !!t).sort().at(-1) ?? null,
      });
    };
    for (const p of snapshot.players) {
      const acc = accountOf.get(p.name.toLowerCase());
      add((acc?.username ?? p.name).toLowerCase(), acc?.username ?? p.name, p.online, p.last_seen);
    }
    for (const r of snapshot.stock) if (r.owner_type === "player") add(r.owner_key, r.owner_label);
    for (const c of snapshot.containers) if (c.owner_type === "player" && c.owner_key) add(c.owner_key, c.owner_label ?? c.owner_key);

    return [...byKey.values()]
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.label.localeCompare(b.label, "de"));
  }, [snapshot, profiles, meId]);
}

/** Bestände im gewählten Bereich. Private Inventare anderer fallen immer weg (die Datenbank liefert sie live ohnehin nicht). */
export function scopeRows(snapshot: Snapshot, owners: Owner[], scope: Scope): StockRow[] {
  const hidden = new Set(owners.filter((o) => o.hidden).map((o) => o.key));
  const keys = scope.mode === "players" ? new Set(scope.keys) : null;
  const type = scope.mode === "all" ? scope.type : "all";
  return snapshot.stock.filter((r) => {
    if (r.source_kind !== "container" && hidden.has(r.owner_key)) return false;
    if (keys) return r.owner_type === "player" && keys.has(r.owner_key);
    return type === "all" || r.owner_type === type;
  });
}

/** Farbe eines Bestands: im Spielerfilter je Spieler, sonst je Besitzart. */
export function colorOf(row: Pick<StockRow, "owner_type" | "owner_key">, scope: Scope, owners: Owner[]): string {
  if (scope.mode === "players") return owners.find((o) => o.key === row.owner_key)?.color ?? OWNER_COLOR.player;
  return OWNER_COLOR[row.owner_type];
}

/** Summen je Besitzer (owner_key) für eine Zeilenmenge. */
export function byOwner(rows: StockRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.owner_key, (m.get(r.owner_key) ?? 0) + r.count);
  return m;
}

export function placesOf(snapshot: Snapshot, rows: StockRow[], item: string): Location[] {
  return locations({ ...snapshot, stock: rows }, item);
}

/** Auswahl im Spielerfilter pro Browser merken. */
export function useStoredKeys(owners: Owner[]): [string[], (k: string[]) => void] {
  const [keys, setKeys] = useState<string[] | null>(null);
  useEffect(() => {
    if (keys !== null || !owners.length) return;
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem("suche.spieler") ?? "[]");
    } catch {}
    const known = saved.filter((k) => owners.some((o) => o.key === k));
    const me = owners.find((o) => o.isMe);
    setKeys(known.length ? known : me ? [me.key] : [owners[0].key]);
  }, [owners, keys]);
  const set = (k: string[]) => {
    setKeys(k);
    try {
      localStorage.setItem("suche.spieler", JSON.stringify(k));
    } catch {}
  };
  return [keys ?? [], set];
}
