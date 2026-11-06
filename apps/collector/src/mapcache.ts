import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Merkt sich je Region, welcher Dateistand zuletzt gezeichnet wurde, und die Biome dazu.
 * Ist der Stempel (Größe + Änderungszeit) gleich, muss die Region-Datei nicht wieder per FTP
 * geladen werden: die Kachel liegt schon im Bucket, die Biome kommen aus dem Cache.
 * Liegt auf dem Volume des Pi (/data/map-cache), ein paar MB für die ganze Welt.
 */
export interface CachedRegion {
  stamp: string;
  /** false: Region hat keine fertigen Chunks, also keine Kachel */
  tile: boolean;
  biomes?: { palette: string[]; cells: Uint8Array };
}

export class RegionCache {
  private ok = true;
  constructor(private dir: string) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      this.ok = false; // z. B. schreibgeschützt: dann eben jedes Mal alles laden
    }
  }

  /**
   * Region, die gerade gezeichnet wird. Steht beim nächsten Start noch etwas drin, ist der
   * Sammler dabei abgestürzt (z. B. Speicher voll); die Region wird dann einmal übersprungen,
   * damit der Lauf nicht jedes Mal an derselben Stelle stirbt.
   */
  markCurrent(region: string | null) {
    if (!this.ok) return;
    try {
      writeFileSync(join(this.dir, "_current"), region ?? "");
    } catch {
      // egal
    }
  }

  /** Region, bei der der letzte Lauf abgestürzt ist (einmalig, danach vergessen). */
  takeCrashed(): string | null {
    if (!this.ok) return null;
    try {
      const r = readFileSync(join(this.dir, "_current"), "utf8").trim();
      this.markCurrent(null);
      return r || null;
    } catch {
      return null;
    }
  }

  get(region: string): CachedRegion | null {
    if (!this.ok) return null;
    try {
      const raw = JSON.parse(readFileSync(join(this.dir, `${region}.json`), "utf8")) as {
        stamp: string;
        tile: boolean;
        palette?: string[];
        cells?: string;
      };
      const biomes = raw.palette && raw.cells ? { palette: raw.palette, cells: new Uint8Array(Buffer.from(raw.cells, "base64")) } : undefined;
      return { stamp: raw.stamp, tile: raw.tile, biomes };
    } catch {
      return null;
    }
  }

  set(region: string, entry: CachedRegion) {
    if (!this.ok) return;
    try {
      const body = {
        stamp: entry.stamp,
        tile: entry.tile,
        ...(entry.biomes && { palette: entry.biomes.palette, cells: Buffer.from(entry.biomes.cells).toString("base64") }),
      };
      writeFileSync(join(this.dir, `${region}.json`), JSON.stringify(body));
    } catch (err) {
      console.warn(`[karte] Cache ${region}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
