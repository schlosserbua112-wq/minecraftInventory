import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Ablage der Kartenkacheln. Die Website liest `overworld/index.json` und lädt
 * `overworld/r.X.Z.png?v=<hash>`; nur geänderte Kacheln werden hochgeladen.
 */
export interface MapIndex {
  updated_at: string | null;
  /** Region-Datei ohne Endung ("r.0.-1") → Hash des PNG (für Cache und Änderungserkennung). */
  tiles: Record<string, string>;
}

export interface MapStore {
  loadIndex(): Promise<MapIndex>;
  /** Lädt die Kachel nur hoch, wenn sie sich geändert hat; liefert true bei Upload. */
  putTile(index: MapIndex, region: string, png: Buffer): Promise<boolean>;
  saveIndex(index: MapIndex): Promise<void>;
}

const DIM = "overworld";
const hash = (png: Buffer) => createHash("sha1").update(png).digest("hex").slice(0, 12);
const empty = (): MapIndex => ({ updated_at: null, tiles: {} });

/** Öffentlicher Bucket "map" in Supabase Storage (siehe Migration map_bucket). */
export class SupabaseMapStore implements MapStore {
  private db: SupabaseClient;
  constructor(url: string, serviceKey: string, private bucket = "map") {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async loadIndex(): Promise<MapIndex> {
    const { data, error } = await this.db.storage.from(this.bucket).download(`${DIM}/index.json`);
    if (error || !data) return empty();
    try {
      return { ...empty(), ...(JSON.parse(await data.text()) as MapIndex) };
    } catch {
      return empty();
    }
  }

  async putTile(index: MapIndex, region: string, png: Buffer) {
    const h = hash(png);
    if (index.tiles[region] === h) return false;
    await this.upload(`${DIM}/${region}.png`, png, "image/png", "86400");
    index.tiles[region] = h;
    return true;
  }

  async saveIndex(index: MapIndex) {
    index.updated_at = new Date().toISOString();
    await this.upload(`${DIM}/index.json`, Buffer.from(JSON.stringify(index)), "application/json", "60");
  }

  private async upload(path: string, body: Buffer, contentType: string, cacheControl: string) {
    const { error } = await this.db.storage.from(this.bucket).upload(path, body, { contentType, cacheControl, upsert: true });
    if (error) throw new Error(`Karte hochladen (${path}): ${error.message}`);
  }
}

/** Ohne Supabase: Kacheln in einen lokalen Ordner schreiben (zum Ansehen beim Testen). */
export class LocalMapStore implements MapStore {
  constructor(private dir: string) {}
  async loadIndex() {
    try {
      return JSON.parse(readFileSync(join(this.dir, DIM, "index.json"), "utf8")) as MapIndex;
    } catch {
      return empty();
    }
  }
  async putTile(index: MapIndex, region: string, png: Buffer) {
    const h = hash(png);
    if (index.tiles[region] === h) return false;
    mkdirSync(join(this.dir, DIM), { recursive: true });
    writeFileSync(join(this.dir, DIM, `${region}.png`), png);
    index.tiles[region] = h;
    return true;
  }
  async saveIndex(index: MapIndex) {
    index.updated_at = new Date().toISOString();
    mkdirSync(join(this.dir, DIM), { recursive: true });
    writeFileSync(join(this.dir, DIM, "index.json"), JSON.stringify(index));
  }
}
