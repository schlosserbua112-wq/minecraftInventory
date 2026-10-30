"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useData } from "./data";
import { supabase } from "./supabase";

/** Flaches Item-Bild oder Block als Würfel (oben, links, rechts); Werte sind Data-URLs. */
export type IconTexture = { flat: string } | { top: string; side: string; front: string };

interface IconFile {
  version: string;
  textures: Record<string, string>;
  items: Record<string, [number] | ["cube", number, number, number]>;
}

let icons: Map<string, IconTexture> | null = null;
let loading = false;
const listeners = new Set<() => void>();

function parse(file: IconFile): Map<string, IconTexture> {
  const url = (i: number) => `data:image/png;base64,${file.textures[i]}`;
  const m = new Map<string, IconTexture>();
  for (const [id, e] of Object.entries(file.items)) {
    m.set(`minecraft:${id}`, e[0] === "cube" ? { top: url(e[1]), side: url(e[2]), front: url(e[3]) } : { flat: url(e[0]) });
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
    icons = parse(JSON.parse(text) as IconFile);
    for (const fn of listeners) fn();
  } catch (err) {
    console.warn("Item-Icons nicht geladen:", err);
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Textur eines Items, sobald geladen; sonst undefined (dann bleibt das Ersatzsymbol). */
export function useItemTexture(id: string): IconTexture | undefined {
  const { mode, session } = useData();
  const live = mode === "live";
  useEffect(() => {
    if (!live || session) load(live);
  }, [live, session]);
  return useSyncExternalStore(subscribe, () => icons?.get(id), () => undefined);
}
