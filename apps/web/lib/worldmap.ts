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
  const { mode, session } = useData();
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
        if (m && s.signedUrl) tiles.push({ x: Number(m[1]) * 512, z: Number(m[2]) * 512, url: s.signedUrl });
      }
      if (!cancelled) setState({ tiles, updatedAt: index.updated_at });
    })().catch((err) => console.warn("Weltkarte nicht geladen:", err));
    return () => {
      cancelled = true;
    };
  }, [mode, session?.user.id]);

  return state;
}
