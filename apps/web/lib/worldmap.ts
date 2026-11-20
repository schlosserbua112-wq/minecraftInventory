"use client";

import { useEffect, useState } from "react";
import { useData } from "./data";
import { supabase } from "./supabase";

/** Eine Kachel der Weltkarte: eine Region, 512 × 512 Blöcke ab (x, z). */
export interface MapTile {
  x: number;
  z: number;
  url: string;
}

interface MapIndex {
  updated_at: string | null;
  tiles: Record<string, string>;
}

/**
 * Kacheln der Oberwelt aus dem privaten Bucket "map" (vom Sammler gezeichnet).
 * Ohne Anmeldung oder ohne Karte: leere Liste, die Karte bleibt dann schematisch.
 */
export function useWorldMap(): { tiles: MapTile[]; updatedAt: string | null } {
  const { mode, session, snapshot } = useData();
  // Nach einem "Karte neu zeichnen" die Kacheln neu laden
  const redrawn = snapshot?.scans.find((r) => r.kind === "map" && r.finished_at)?.finished_at ?? null;
  const [state, setState] = useState<{ tiles: MapTile[]; updatedAt: string | null }>({ tiles: [], updatedAt: null });

  useEffect(() => {
    if (mode !== "live" || !session) return;
    let cancelled = false;
    (async () => {
      const bucket = supabase().storage.from("map");
      const { data, error } = await bucket.download("overworld/index.json");
      if (error || !data) return;
      const index = JSON.parse(await data.text()) as MapIndex;
      const regions = Object.keys(index.tiles);
      if (!regions.length) return;
      const { data: signed } = await bucket.createSignedUrls(
        regions.map((r) => `overworld/${r}.png`),
        6 * 3600,
      );
      const tiles: MapTile[] = [];
      for (const s of signed ?? []) {
        const m = /r\.(-?\d+)\.(-?\d+)\.png$/.exec(s.path ?? "");
        const hash = index.tiles[`r.${m?.[1]}.${m?.[2]}`];
        // Hash anhängen, damit geänderte Kacheln nicht aus dem Cache kommen
        if (m && s.signedUrl) tiles.push({ x: Number(m[1]) * 512, z: Number(m[2]) * 512, url: hash ? `${s.signedUrl}&v=${hash}` : s.signedUrl });
      }
      if (!cancelled) setState({ tiles, updatedAt: index.updated_at });
    })().catch((err) => console.warn("Weltkarte nicht geladen:", err));
    return () => {
      cancelled = true;
    };
  }, [mode, session?.user.id, redrawn]);

  return state;
}

/** Biom-Ebene vom Sammler: Grenzlinien [x0, z0, x1, z1, …] und ein Schild je Fläche. */
export interface BiomeLayer {
  updated_at: string | null;
  lines: number[][];
  labels: { id: string; name: string; x: number; z: number; area: number }[];
}

/** Eine zusammenhängende Biomfläche; `rings` als flache Listen [x0, z0, …] (Löcher eigene Ringe). */
export interface BiomeArea {
  id: string;
  x: number;
  z: number;
  area: number;
  rings: number[][];
}

/**
 * Lädt eine JSON-Datei aus dem Bucket "map" einmal je Anmeldung und Kartenstand und teilt sie
 * zwischen allen Komponenten (Suche und Karte brauchen dieselben Biome). null: Datei fehlt.
 */
const jsonCache = new Map<string, Promise<unknown | null>>();
function loadMapJson<T>(path: string, key: string): Promise<T | null> {
  const k = `${path}|${key}`;
  let p = jsonCache.get(k);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase().storage.from("map").download(path);
      if (error || !data) return null;
      return JSON.parse(await data.text()) as unknown;
    })();
    p.catch(() => jsonCache.delete(k));
    jsonCache.set(k, p);
  }
  return p as Promise<T | null>;
}

function useMapJson<T>(path: string, enabled: boolean): { data: T | null; missing: boolean } {
  const { mode, session, snapshot } = useData();
  const redrawn = snapshot?.scans.find((r) => r.kind === "map" && r.finished_at)?.finished_at ?? null;
  const [state, setState] = useState<{ data: T | null; missing: boolean; key: string | null }>({ data: null, missing: false, key: null });
  const key = enabled && mode === "live" && session ? `${session.user.id}|${redrawn}` : null;

  useEffect(() => {
    if (!key || state.key === key) return;
    let cancelled = false;
    loadMapJson<T>(path, key)
      .then((data) => !cancelled && setState({ data, missing: !data, key }))
      .catch((err) => console.warn(`${path} nicht geladen:`, err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data: enabled ? state.data : null, missing: enabled && state.missing };
}

/**
 * Lädt overworld/biomes.json erst, wenn die Biom-Ansicht (oder die Biom-Suche) sie braucht.
 * `missing`: eingeschaltet, aber der Sammler hat noch keine Biome gezeichnet.
 */
export function useBiomes(enabled: boolean): { layer: BiomeLayer | null; missing: boolean } {
  const { data, missing } = useMapJson<BiomeLayer>("overworld/biomes.json", enabled);
  return { layer: data, missing };
}

/**
 * Umrisse aller Biomflächen (overworld/biome-areas.json) für das Hervorheben eines gesuchten Bioms.
 * Fehlt die Datei noch (Karte seit dem Update nicht neu gezeichnet), ist `areas` null.
 */
export function useBiomeAreas(enabled: boolean): BiomeArea[] | null {
  return useMapJson<{ areas: BiomeArea[] }>("overworld/biome-areas.json", enabled).data?.areas ?? null;
}
