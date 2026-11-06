import {
  containerFromBlockEntity,
  groupDoubleChests,
  mergeDoubleChests,
  mergedAwayIds,
  mergeGroup,
  playerDimension,
  playerEnderChest,
  playerInventory,
  regionOf,
  regionsForZone,
  snbtFromDataGet,
  summarizeStats,
  type ContainerSnapshot,
  type PlayerPos,
  type PlayerSnapshot,
  type PlayerStats,
} from "@mc/core";
import { BiomeAtlas, containersFromRegion, readNbt, renderRegionMap } from "@mc/core/node";
import type { ServerConfig } from "./config.js";
import { Rcon } from "./rcon.js";
import type { MapStore } from "./mapstore.js";
import type { Settings } from "./settings.js";
import type { Zone } from "./sink.js";
import type { WorldFiles } from "./worldfiles.js";

/** Ordner der Region-Dateien je Dimension: 26.3-Layout zuerst (am Testserver gesehen), dann das alte. */
const REGION_DIRS: Record<string, string[]> = {
  "minecraft:overworld": ["dimensions/minecraft/overworld/region", "region"],
  "minecraft:the_nether": ["dimensions/minecraft/the_nether/region", "DIM-1/region"],
  "minecraft:the_end": ["dimensions/minecraft/the_end/region", "DIM1/region"],
};

const KIND_IDS: Record<ContainerSnapshot["kind"], string> = {
  chest: "minecraft:chest",
  trapped_chest: "minecraft:trapped_chest",
  barrel: "minecraft:barrel",
  shulker_box: "minecraft:shulker_box",
};

/** Antwort von `list uuids`: "… online: Name (uuid), Name2 (uuid2)". Vorangestellte fremde Ausgaben zählen nicht. */
export function parsePlayerList(response: string): { name: string; uuid: string }[] {
  const out: { name: string; uuid: string }[] = [];
  const at = response.lastIndexOf("players online:");
  for (const m of response.slice(Math.max(at, 0)).matchAll(/([A-Za-z0-9_]{1,16}) \(([0-9a-fA-F-]{36})\)/g)) out.push({ name: m[1]!, uuid: m[2]!.toLowerCase() });
  return out;
}

export interface PlayerStatsRow {
  uuid: string;
  name: string;
  stats: PlayerStats;
}

export interface LiveResult {
  players: PlayerSnapshot[];
  containers: ContainerSnapshot[];
  /** Positionen der Online-Spieler (nur mit Quelle „Entnahmen“). */
  positions?: PlayerPos[];
  /** Kisten, die in dieser Abfrage live per RCON gelesen wurden (bei Doppelkisten beide Hälften). */
  liveIds?: Set<string>;
  /** Doppelkisten als [ID der Kiste, ID der zweiten Hälfte], damit alte Daten der Hälfte umziehen. */
  mergedHalves?: [string, string][];
}

/**
 * Holt die Daten vom echten Server:
 * - jede Abfrage: Online-Spieler und bekannte Kisten in den Zonen per RCON
 * - Zonen-Scan: Region-Dateien der Zonen nach Kisten durchsuchen, Offline-Spieler aus playerdata
 * - Vollscan: alle Region-Dateien; Kisten außerhalb der Zonen zählen mit dem Stand aus der Datei
 */
export class LiveCollector {
  private rcon?: Rcon;
  private rconQueue: Promise<unknown> = Promise.resolve();
  /** Kisten in Zonen, werden live per RCON nachgelesen. */
  private zoneContainers = new Map<string, ContainerSnapshot>();
  /** Kisten außerhalb der Zonen, Stand aus dem letzten Vollscan. */
  private outsideContainers = new Map<string, ContainerSnapshot>();
  private offlinePlayers = new Map<string, PlayerSnapshot>();
  private names = new Map<string, string>();
  private regionDirs = new Map<string, string | null>();
  lastZoneScanAt: string | null = null;
  lastFullScanAt: string | null = null;
  private lastFullScanDay = "";
  lastMapAt: string | null = null;
  private lastMapDay = "";

  constructor(private server: ServerConfig, private files: WorldFiles) {}

  /**
   * Befehle laufen nacheinander, auch wenn Zonen-Scan (save-all) und Abfrage gleichzeitig senden.
   * Sonst bauen beide eine Verbindung auf oder räumen dieselbe zweimal ab.
   */
  private rconCommand(cmd: string): Promise<string> {
    const run = this.rconQueue.then(() => this.rconCommandNow(cmd));
    this.rconQueue = run.catch(() => {});
    return run;
  }

  private async rconCommandNow(cmd: string): Promise<string> {
    if (!this.rcon) {
      const { host, port, password } = this.server.rcon;
      const r = new Rcon(host!, port, password!);
      await r.connect();
      this.rcon = r;
    }
    const r = this.rcon;
    try {
      return await withTimeout(r.command(cmd), 10_000, `RCON-Befehl "${cmd}"`);
    } catch (err) {
      r.close();
      if (this.rcon === r) this.rcon = undefined;
      throw err;
    }
  }

  /**
   * `/data get` für ein Ziel (Spielername oder "x, y, z"). Fehlt dessen Antwort, weil der Server
   * fremde Ausgabe geliefert hat, einmal wiederholen.
   */
  private async dataGet(cmd: string, subject: string): Promise<{ data: ReturnType<typeof snbtFromDataGet>; res: string }> {
    let res = await this.rconCommand(cmd);
    if (!res.includes(`${subject} has the following `) && res.includes(" has the following ")) res = await this.rconCommand(cmd);
    return { data: snbtFromDataGet(res, subject), res };
  }

  close() {
    this.rcon?.close();
    this.files.close();
  }

  /**
   * Eine Abfrage: Spieler und Zonen-Kisten live.
   * `wantUnnamed`: welche unbenannten Kisten gebraucht werden; die übrigen fragt RCON gar nicht erst ab.
   */
  async poll(s: Settings, wantUnnamed: (c: ContainerSnapshot) => boolean = () => true): Promise<LiveResult> {
    const players: PlayerSnapshot[] = [];
    const online = parsePlayerList(await this.rconCommand("list uuids"));
    const onlineIds = new Set(online.map((p) => p.uuid));

    const positions: PlayerPos[] = [];
    for (const p of online) {
      this.names.set(p.uuid, p.name);
      if (s.sources.takes) {
        const pos = await this.position(p.uuid, p.name);
        if (pos) positions.push(pos);
      }
      if (!s.sources.inventories && !s.sources.enderChests) {
        players.push({ uuid: p.uuid, name: p.name, online: true, inventory: [], enderChest: [] });
        continue;
      }
      // Nur die nötigen Teile abfragen; die volle Entity (Rezeptbuch) ist 30–40 KB groß
      const data: Record<string, unknown> = {};
      const paths = [...(s.sources.inventories ? ["Inventory", "equipment"] : []), ...(s.sources.enderChests ? ["EnderItems"] : [])];
      for (const path of paths) {
        try {
          const { data: v } = await this.dataGet(`data get entity ${p.name} ${path}`, p.name);
          if (v != null) data[path] = v;
        } catch (err) {
          // Ein kaputter Spieler darf die Runde nicht abbrechen
          console.warn(`[live] ${p.name} ${path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      players.push({
        uuid: p.uuid,
        name: p.name,
        online: true,
        inventory: s.sources.inventories ? playerInventory(data) : [],
        enderChest: s.sources.enderChests ? playerEnderChest(data) : [],
      });
    }

    if (s.sources.offlinePlayers) {
      for (const p of this.offlinePlayers.values()) {
        if (onlineIds.has(p.uuid)) continue;
        players.push({ ...p, name: this.names.get(p.uuid) ?? p.name, enderChest: s.sources.enderChests ? p.enderChest : [] });
      }
    }

    const liveIds = new Set<string>();
    if (s.sources.zoneChests) {
      // Doppelkisten als Ganzes: Name und „Meine“-Markierung gelten für beide Hälften
      for (const group of groupDoubleChests(this.zoneContainers.values())) {
        const whole = mergeGroup(group);
        if (!whole.customName && !wantUnnamed(whole)) continue;
        let ok = true;
        for (const c of group) ok = (await this.readZoneContainer(c)) && ok;
        if (ok) liveIds.add(whole.id);
      }
    }

    const all = mergeDoubleChests([...(s.sources.zoneChests ? this.zoneContainers.values() : []), ...(s.sources.fullScan ? this.outsideContainers.values() : [])]);
    const containers = all.filter((c) => !this.zoneContainers.has(c.id) || c.customName || wantUnnamed(c));
    const mergedHalves = all.flatMap((c) => mergedAwayIds(c).map((drop): [string, string] => [c.id, drop]));
    return { players, containers, positions, liveIds, mergedHalves };
  }

  /** Eine Kiste (oder Kistenhälfte) der Zonen per RCON neu lesen; true, wenn das geklappt hat. */
  private async readZoneContainer(c: ContainerSnapshot): Promise<boolean> {
    let data, res;
    try {
      ({ data, res } = await this.dataGet(`execute in ${c.dimension} run data get block ${c.x} ${c.y} ${c.z}`, `${c.x}, ${c.y}, ${c.z}`));
    } catch (err) {
      console.warn(`[live] Kiste ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    if (!data) {
      // Kiste abgebaut oder Bereich nicht geladen: nur bei eindeutiger Meldung entfernen
      if (!res.includes(" has the following ") && /no block entity|not a block entity/i.test(res)) this.zoneContainers.delete(c.id);
      return false;
    }
    const raw = { id: KIND_IDS[c.kind], ...(data as object) };
    const fresh = containerFromBlockEntity(raw, c.dimension, c);
    if (!fresh) {
      this.zoneContainers.delete(c.id);
      return false;
    }
    // RCON liefert keinen Block-State: Zuordnung der Hälften aus dem letzten Scan behalten
    if (c.partner) Object.assign(fresh, { partner: c.partner, half: c.half });
    this.zoneContainers.set(c.id, fresh);
    return true;
  }

  /** Position und Dimension eines Online-Spielers; null, wenn eine Antwort fehlt. */
  private async position(uuid: string, name: string): Promise<PlayerPos | null> {
    try {
      const { data: pos } = await this.dataGet(`data get entity ${name} Pos`, name);
      const { data: dim } = await this.dataGet(`data get entity ${name} Dimension`, name);
      if (!Array.isArray(pos) || pos.length < 3 || typeof dim !== "string") return null;
      const [x, y, z] = pos.map(Number);
      if (![x, y, z].every(Number.isFinite)) return null;
      return { uuid, name, dimension: dim, x: x!, y: y!, z: z! };
    } catch (err) {
      console.warn(`[live] ${name} Position: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Zonen-Scan; liefert die Zahl neu gefundener Kisten. */
  /**
   * `save` nur bei einem angeforderten Scan („Jetzt scannen“): Speichern lässt den Server kurz ruckeln
   * und meldet „Saved the game“ im Chat. Sonst reicht der Autosave des Servers (alle 5 Minuten).
   */
  async zoneScan(zones: Zone[], s: Settings, save = false): Promise<number> {
    let found = 0;
    try {
      if (save) {
        // Ohne "flush": der Server schreibt die Chunks nach und nach statt alles auf einmal
        try {
          await this.rconCommand("save-all");
        } catch (err) {
          console.warn(`[live] save-all: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      await this.files.open();
      await this.loadNames();
      if (s.sources.offlinePlayers) await this.loadOfflinePlayers();
      if (s.sources.zoneChests) {
        const next = new Map<string, ContainerSnapshot>();
        for (const zone of zones) {
          // Unbenannte immer mitnehmen: ob sie zählen, entscheiden Website-Schalter und „Meine“-Markierungen je Abfrage
          const candidates = await this.containersInRegions(zone.dimension, regionsForZone(zone.center_x, zone.center_z, zone.radius), true);
          const inside = (c: ContainerSnapshot) => (c.x - zone.center_x) ** 2 + (c.z - zone.center_z) ** 2 <= zone.radius ** 2;
          // Doppelkisten am Zonenrand: beide Hälften gehören in die Zone, wenn eine drin liegt
          for (const group of groupDoubleChests(candidates)) {
            if (!group.some(inside)) continue;
            if (!group.some((c) => this.zoneContainers.has(c.id))) found++;
            for (const c of group) {
              const known = this.zoneContainers.get(c.id);
              // Live-Inhalt behalten, falls schon bekannt (Datei kann bis zum nächsten Autosave älter sein),
              // die Zuordnung der Hälften aber immer aus der Datei
              next.set(c.id, known ? { ...known, partner: c.partner, half: c.half } : c);
            }
          }
        }
        this.zoneContainers = next;
        for (const id of next.keys()) this.outsideContainers.delete(id);
      }
    } finally {
      this.files.close();
    }
    this.lastZoneScanAt = new Date().toISOString();
    return found;
  }

  /** Vollscan, wenn er heute zur eingestellten Stunde noch nicht lief. */
  fullScanDue(s: Settings, now = new Date()): boolean {
    const day = now.toISOString().slice(0, 10);
    return s.sources.fullScan && now.getHours() === s.fullScanHour && day !== this.lastFullScanDay;
  }

  async fullScan(zones: Zone[]): Promise<number> {
    const inZone = (c: ContainerSnapshot) =>
      zones.some((z) => z.dimension === c.dimension && (c.x - z.center_x) ** 2 + (c.z - z.center_z) ** 2 <= z.radius ** 2);
    const next = new Map<string, ContainerSnapshot>();
    try {
      await this.files.open();
      for (const dimension of Object.keys(REGION_DIRS)) {
        const dir = await this.regionDir(dimension);
        if (!dir) continue;
        const files = (await this.files.list(dir)).filter((f) => /^r\.-?\d+\.-?\d+\.mca$/.test(f));
        for (const c of await this.containersInRegions(dimension, files)) if (!inZone(c) && !this.zoneContainers.has(c.id)) next.set(c.id, c);
      }
    } finally {
      this.files.close();
    }
    const found = mergeDoubleChests(next.values()).filter((c) => !this.outsideContainers.has(c.id)).length;
    this.outsideContainers = next;
    this.lastFullScanDay = new Date().toISOString().slice(0, 10);
    this.lastFullScanAt = new Date().toISOString();
    return found;
  }

  /** Karte fällig: täglich zur Vollscan-Stunde (beim Start zusätzlich, wenn es noch keine gibt). */
  mapDue(s: Settings, now = new Date()): boolean {
    const day = now.toISOString().slice(0, 10);
    return s.sources.map && now.getHours() === s.fullScanHour && day !== this.lastMapDay;
  }

  /**
   * Zeichnet die Oberwelt Region für Region und lädt geänderte Kacheln hoch.
   * Es liegt immer nur eine Region-Datei (einige MB) und ein Bild (~1,5 MB) im Speicher.
   * Bei vielen Regionen dauert das Stunden: das Verzeichnis wird deshalb zwischendurch
   * gespeichert, und eine abgerissene FTP-Verbindung wird neu aufgebaut, statt den ganzen
   * Lauf zu verwerfen. Regionen, die trotzdem nicht lesbar sind, behalten ihre alte Kachel.
   */
  async renderMap(store: MapStore): Promise<{ regions: number; uploaded: number; failed: number }> {
    const index = await store.loadIndex();
    let regions = 0;
    let uploaded = 0;
    let failed = 0;
    let unsaved = 0;
    const biomes = new BiomeAtlas();
    try {
      await this.files.open();
      const dir = await this.regionDir("minecraft:overworld");
      if (!dir) return { regions, uploaded, failed };
      const files = (await this.files.list(dir)).filter((f) => /^r\.-?\d+\.-?\d+\.mca$/.test(f));
      if (!files.length) throw new Error("keine Region-Dateien gefunden (FTP-Liste leer)");
      const seen = new Set<string>();
      for (const file of files) {
        const region = file.slice(0, -4);
        let buf: Buffer;
        try {
          buf = await this.readWithRetry(`${dir}/${file}`);
        } catch (err) {
          failed++;
          seen.add(region); // alte Kachel behalten
          console.warn(`[karte] ${file} nicht lesbar: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        const { png, biomes: b } = renderRegionMap(buf, (i, err) => console.warn(`[karte] ${file} Chunk ${i}: ${String(err)}`));
        if (!png) continue;
        const [, rx, rz] = region.split(".");
        biomes.add(Number(rx), Number(rz), b);
        seen.add(region);
        regions++;
        if (await store.putTile(index, region, png)) {
          uploaded++;
          // Zwischenstand, damit neue Kacheln nicht erst nach Stunden (oder bei einem Abbruch nie) sichtbar werden
          if (++unsaved >= 20) {
            await store.saveIndex(index);
            unsaved = 0;
          }
        }
        // Kurz durchatmen lassen, damit Live-Abfragen auf dem Pi nicht warten
        await new Promise((r) => setImmediate(r));
      }
      for (const r of Object.keys(index.tiles)) if (!seen.has(r)) delete index.tiles[r];
    } finally {
      this.files.close();
      // Auch bei einem Abbruch: was hochgeladen ist, soll im Verzeichnis stehen
      if (uploaded) await store.saveIndex(index).catch((err) => console.warn(`[karte] Verzeichnis: ${String(err)}`));
    }
    if (!uploaded) await store.saveIndex(index);
    // Biom-Ebene: ein Fehler hier soll die fertige Karte nicht verwerfen
    if (biomes.size) {
      try {
        await store.saveBiomes(biomes.build());
      } catch (err) {
        console.warn(`[karte] Biome: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.lastMapDay = new Date().toISOString().slice(0, 10);
    this.lastMapAt = new Date().toISOString();
    return { regions, uploaded, failed };
  }

  /** Eine Datei lesen; reißt die FTP-Verbindung ab, einmal neu verbinden und noch mal versuchen. */
  private async readWithRetry(path: string): Promise<Buffer> {
    try {
      return await this.files.read(path);
    } catch (err) {
      console.warn(`[karte] ${path}: ${err instanceof Error ? err.message : String(err)}, verbinde neu`);
      this.files.close();
      await new Promise((r) => setTimeout(r, 5_000));
      await this.files.open();
      return await this.files.read(path);
    }
  }

  private async regionDir(dimension: string): Promise<string | null> {
    if (this.regionDirs.has(dimension)) return this.regionDirs.get(dimension)!;
    for (const rel of REGION_DIRS[dimension] ?? []) {
      const dir = `${this.server.level}/${rel}`;
      if ((await this.files.list(dir)).some((f) => f.endsWith(".mca"))) {
        this.regionDirs.set(dimension, dir);
        return dir;
      }
    }
    return null; // nicht merken: Dimension kann später entstehen
  }

  /** `keepUnnamed`: auch unbenannte, nicht generierte Kisten mit Inhalt behalten (nur in Zonen). */
  private async containersInRegions(dimension: string, regionFiles: string[], keepUnnamed = false): Promise<ContainerSnapshot[]> {
    const dir = await this.regionDir(dimension);
    if (!dir) return [];
    const existing = new Set(await this.files.list(dir));
    const all: ContainerSnapshot[] = [];
    for (const file of regionFiles) {
      if (!existing.has(file)) continue;
      const buf = await this.files.read(`${dir}/${file}`);
      all.push(...containersFromRegion(buf, dimension, (i, err) => console.warn(`[scan] ${file} Chunk ${i}: ${String(err)}`)));
    }
    // Unbenannte Kisten zählen laut Namensregeln nicht; weglassen spart Speicher und RCON-Abfragen.
    // Doppelkisten als Ganzes prüfen: die leere oder unbenannte Hälfte einer benannten Kiste bleibt.
    return groupDoubleChests(all)
      .filter((group) => {
        const c = mergeGroup(group);
        return c.customName || (keepUnnamed && !c.generated && c.items.length);
      })
      .flat();
  }

  /**
   * Statistiken aller Spieler, die je auf dem Server waren. Minecraft schreibt die Dateien beim Autosave
   * und beim Ausloggen, deshalb reicht es, sie mit dem Zonen-Scan zu lesen.
   */
  async readStats(): Promise<PlayerStatsRow[]> {
    const out: PlayerStatsRow[] = [];
    try {
      await this.files.open();
      await this.loadNames();
      // 26.3: <welt>/players/stats/<uuid>.json, ältere Versionen: <welt>/stats/<uuid>.json
      let dir = `${this.server.level}/players/stats`;
      let files = await this.files.list(dir);
      if (!files.some((f) => f.endsWith(".json"))) {
        dir = `${this.server.level}/stats`;
        files = await this.files.list(dir);
      }
      for (const file of files) {
        const m = /^([0-9a-f-]{36})\.json$/i.exec(file);
        if (!m) continue;
        const uuid = m[1]!.toLowerCase();
        try {
          const stats = summarizeStats(JSON.parse((await this.files.read(`${dir}/${file}`)).toString("utf8")));
          if (stats) out.push({ uuid, name: this.names.get(uuid) ?? uuid.slice(0, 8), stats });
        } catch (err) {
          console.warn(`[stats] ${file}: ${String(err)}`);
        }
      }
    } finally {
      this.files.close();
    }
    return out;
  }

  /** Namen zu UUIDs aus usercache.json im Server-Ordner. */
  private async loadNames() {
    try {
      const list = JSON.parse((await this.files.read("usercache.json")).toString("utf8")) as { name: string; uuid: string }[];
      for (const e of list) if (!this.names.has(e.uuid.toLowerCase())) this.names.set(e.uuid.toLowerCase(), e.name);
    } catch {
      // usercache.json fehlt: Namen kommen dann nur von Online-Spielern
    }
  }

  private async loadOfflinePlayers() {
    // 26.3: <welt>/players/data/<uuid>.dat, ältere Versionen: <welt>/playerdata/<uuid>.dat
    let dir = `${this.server.level}/players/data`;
    let files = await this.files.list(dir);
    if (!files.some((f) => f.endsWith(".dat"))) {
      dir = `${this.server.level}/playerdata`;
      files = await this.files.list(dir);
    }
    const next = new Map<string, PlayerSnapshot>();
    for (const file of files) {
      const m = /^([0-9a-f-]{36})\.dat$/i.exec(file);
      if (!m) continue;
      const uuid = m[1]!.toLowerCase();
      try {
        const data = readNbt(await this.files.read(`${dir}/${file}`), ["Inventory", "EnderItems", "equipment", "Dimension"]);
        next.set(uuid, { uuid, name: this.names.get(uuid) ?? uuid.slice(0, 8), online: false, inventory: playerInventory(data), enderChest: playerEnderChest(data) });
        void playerDimension(data);
      } catch (err) {
        console.warn(`[scan] ${file}: ${String(err)}`);
      }
    }
    this.offlinePlayers = next;
  }
}

/** Region einer Kiste, z. B. für Logs. */
export const regionFileOf = (c: ContainerSnapshot) => regionOf(c.x, c.z).file;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: keine Antwort nach ${ms / 1000} s`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
