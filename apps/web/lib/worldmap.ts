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

/**
 * Lädt overworld/biomes.json erst, wenn die Biom-Ansicht eingeschaltet ist.
 * `missing`: eingeschaltet, aber der Sammler hat noch keine Biome gezeichnet.
 */
export function useBiomes(enabled: boolean): { layer: BiomeLayer | null; missing: boolean } {
  const { mode, session, snapshot } = useData();
  const redrawn = snapshot?.scans.find((r) => r.kind === "map" && r.finished_at)?.finished_at ?? null;
  const [state, setState] = useState<{ layer: BiomeLayer | null; missing: boolean; key: string | null }>({ layer: null, missing: false, key: null });
  const key = enabled && mode === "live" && session ? `${session.user.id}|${redrawn}` : null;

  useEffect(() => {
    if (!key || state.key === key) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase().storage.from("map").download("overworld/biomes.json");
      if (cancelled) return;
      if (error || !data) return setState({ layer: null, missing: true, key });
      setState({ layer: JSON.parse(await data.text()) as BiomeLayer, missing: false, key });
    })().catch((err) => console.warn("Biome nicht geladen:", err));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { layer: enabled ? state.layer : null, missing: enabled && state.missing };
}
