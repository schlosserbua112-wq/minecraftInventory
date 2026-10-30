"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useData } from "./data";
import { supabase } from "./supabase";

/** Flaches Item-Bild oder Block als Würfel (oben, links, rechts); Werte sind Data-URLs, tint eine CSS-Farbe. */
export type IconTexture = ({ flat: string } | { top: string; side: string; front: string; tintTopOnly?: boolean }) & { tint?: string };

interface IconFile {
  version: string;
  textures: Record<string, string>;
  /** [Textur, Färbung?] oder ["cube", oben, links, rechts, Färbung?]; Färbung als 0xRRGGBB, 1 am Ende = nur die Oberseite (Grasblock) */
  items: Record<string, [number, number?] | ["cube", number, number, number, number?, 1?]>;
  /** Deutsche Namen aus dem Sprachpaket (ältere Dateien haben keine) */
  names?: Record<string, string>;
}

let icons: Map<string, IconTexture> | null = null;
let names: Map<string, string> = new Map();
let loading = false;
let version = 0;
const listeners = new Set<() => void>();

function parse(file: IconFile): Map<string, IconTexture> {
  const url = (i: number) => `data:image/png;base64,${file.textures[i]}`;
  const m = new Map<string, IconTexture>();
  const color = (n: number | undefined) => (n === undefined ? undefined : `#${n.toString(16).padStart(6, "0")}`);
  for (const [id, e] of Object.entries(file.items)) {
    m.set(
      `minecraft:${id}`,
      e[0] === "cube" ? { top: url(e[1]), side: url(e[2]), front: url(e[3]), tint: color(e[4]), tintTopOnly: e[5] === 1 } : { flat: url(e[0]), tint: color(e[1]) },
    );
  }
  return m;
}

/**
 * Original-Texturen aus dem privaten Bucket "items" (vom Skript scripts/item-icons.mjs aus dem
 * eigenen Minecraft-Client hochgeladen). Im Demo-Modus optional aus public/item-icons.json.
 */
async function load(live: boolean) {
  if (loading || icons) return;
  loading = true;
  try {
    let text: string | null = null;
    if (live) {
      const { data } = await supabase().storage.from("items").download("icons.json");
      text = data ? await data.text() : null;
    } else {
      const res = await fetch("/item-icons.json");
      text = res.ok ? await res.text() : null;
    }
    if (!text) return;
    const file = JSON.parse(text) as IconFile;
    icons = parse(file);
    names = new Map(Object.entries(file.names ?? {}).map(([id, n]) => [`minecraft:${id}`, n]));
    version++;
    for (const fn of listeners) fn();
  } catch (err) {
    console.warn("Item-Icons nicht geladen:", err);
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Deutscher Name aus dem Sprachpaket, falls geladen. */
export const germanName = (id: string): string | undefined => names.get(id);

function useLoad() {
  const { mode, session } = useData();
  const live = mode === "live";
  useEffect(() => {
    if (!live || session) load(live);
  }, [live, session]);
}

/** Textur eines Items, sobald geladen; sonst undefined (dann bleibt das Ersatzsymbol). */
export function useItemTexture(id: string): IconTexture | undefined {
  useLoad();
  return useSyncExternalStore(subscribe, () => icons?.get(id), () => undefined);
}

/** Neu zeichnen, sobald Icons und Namen geladen sind (für Seiten, die Item-Namen zeigen). */
export function useItemNames(): number {
  useLoad();
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
