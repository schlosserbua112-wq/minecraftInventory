import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Technische Einstellungen des Sammlers, änderbar über die Pi-Kachel.
 * Geheimnisse (RCON, FTP, Supabase) gehören nicht hierher, die bleiben in der .env.
 */
export interface Settings {
  /** Sammler läuft weiter, holt aber keine Daten. */
  paused: boolean;
  sources: {
    /** Inventare der Spieler, die gerade online sind (RCON). */
    inventories: boolean;
    /** Enderkisten (online per RCON, offline aus playerdata). */
    enderChests: boolean;
    /** Inventare und Enderkisten von Offline-Spielern (FTP playerdata). */
    offlinePlayers: boolean;
    /** Bekannte Kisten in den Zonen (RCON /data get block). */
    zoneChests: boolean;
    /** Ganze Welt nach neuen Kisten durchsuchen (FTP Region-Dateien). */
    fullScan: boolean;
    /** Weltkarte der Oberwelt zeichnen und hochladen, täglich zur Vollscan-Uhrzeit (FTP Region-Dateien). */
    map: boolean;
    /** Positionen der Online-Spieler lesen und Entnahmen aus fremden Kisten melden (RCON). */
    takes: boolean;
    /** Spielerstatistiken (Spielzeit, Tode, Abgebautes …) aus den Stats-Dateien, bei jedem Zonen-Scan (FTP). */
    stats: boolean;
  };
  /** Spieler und bekannte Kisten abfragen, alle n Sekunden. */
  pollSeconds: number;
  /** Zonen nach neuen Kisten durchsuchen, alle n Minuten. */
  zoneScanMinutes: number;
  /** Uhrzeit (Stunde) für den täglichen Vollscan. */
  fullScanHour: number;
  /** Unbenannte Kisten mit Inhalt in Zonen: ignorieren, als Allgemein oder als nicht zugeordnet zählen. */
  unnamedChests: "ignore" | "common" | "unassigned";
}

export const LIMITS = {
  pollSeconds: [10, 30],
  zoneScanMinutes: [5, 240],
  fullScanHour: [0, 23],
} as const;

export function defaultSettings(pollSeconds = 15): Settings {
  return {
    paused: false,
    sources: { inventories: true, enderChests: true, offlinePlayers: true, zoneChests: true, fullScan: true, map: true, takes: true, stats: true },
    pollSeconds,
    zoneScanMinutes: 30,
    fullScanHour: 4,
    unnamedChests: "ignore",
  };
}

const clamp = (v: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** Übernimmt nur bekannte Felder und hält Zahlen in ihren Grenzen. */
export function normalizeSettings(input: unknown, base: Settings): Settings {
  const i = (input ?? {}) as Partial<Settings> & { sources?: Partial<Settings["sources"]> };
  const src: Partial<Settings["sources"]> = i.sources ?? {};
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    paused: bool(i.paused, base.paused),
    sources: {
      inventories: bool(src.inventories, base.sources.inventories),
      enderChests: bool(src.enderChests, base.sources.enderChests),
      offlinePlayers: bool(src.offlinePlayers, base.sources.offlinePlayers),
      zoneChests: bool(src.zoneChests, base.sources.zoneChests),
      fullScan: bool(src.fullScan, base.sources.fullScan),
      map: bool(src.map, base.sources.map),
      takes: bool(src.takes, base.sources.takes),
      stats: bool(src.stats, base.sources.stats),
    },
    pollSeconds: clamp(i.pollSeconds, LIMITS.pollSeconds, base.pollSeconds),
    zoneScanMinutes: clamp(i.zoneScanMinutes, LIMITS.zoneScanMinutes, base.zoneScanMinutes),
    fullScanHour: clamp(i.fullScanHour, LIMITS.fullScanHour, base.fullScanHour),
    unnamedChests: ["ignore", "common", "unassigned"].includes(i.unnamedChests as string) ? (i.unnamedChests as Settings["unnamedChests"]) : base.unnamedChests,
  };
}

/** Hält die Einstellungen im Speicher und schreibt sie in eine JSON-Datei im Docker-Volume. */
export class SettingsStore {
  private current: Settings;

  constructor(private file: string, private defaults: Settings) {
    this.current = defaults;
    try {
      this.current = normalizeSettings(JSON.parse(readFileSync(file, "utf8")), defaults);
    } catch {
      // Keine oder kaputte Datei: Standardwerte
    }
  }

  get(): Settings {
    return this.current;
  }

  update(input: unknown): Settings {
    this.current = normalizeSettings(input, this.current);
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.current, null, 2));
    renameSync(tmp, this.file);
    return this.current;
  }

  reset(): Settings {
    return this.update(this.defaults);
  }
}
