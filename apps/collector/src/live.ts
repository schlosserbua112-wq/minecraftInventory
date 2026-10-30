import {
  containerFromBlockEntity,
  containersFromChunk,
  playerDimension,
  playerEnderChest,
  playerInventory,
  regionOf,
  regionsForZone,
  snbtFromDataGet,
  type ContainerSnapshot,
  type PlayerSnapshot,
} from "@mc/core";
import { eachRegionChunk, readNbt } from "@mc/core/node";
import type { ServerConfig } from "./config.js";
import { Rcon } from "./rcon.js";
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

/** Antwort von `list uuids`: "… online: Name (uuid), Name2 (uuid2)". */
export function parsePlayerList(response: string): { name: string; uuid: string }[] {
  const out: { name: string; uuid: string }[] = [];
  for (const m of response.matchAll(/([A-Za-z0-9_]{1,16}) \(([0-9a-fA-F-]{36})\)/g)) out.push({ name: m[1]!, uuid: m[2]!.toLowerCase() });
  return out;
}

export interface LiveResult {
  players: PlayerSnapshot[];
  containers: ContainerSnapshot[];
}

/**
 * Holt die Daten vom echten Server:
 * - jede Abfrage: Online-Spieler und bekannte Kisten in den Zonen per RCON
 * - Zonen-Scan: Region-Dateien der Zonen nach Kisten durchsuchen, Offline-Spieler aus playerdata
 * - Vollscan: alle Region-Dateien; Kisten außerhalb der Zonen zählen mit dem Stand aus der Datei
 */
export class LiveCollector {
  private rcon?: Rcon;
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

  constructor(private server: ServerConfig, private files: WorldFiles) {}

  private async rconCommand(cmd: string): Promise<string> {
    if (!this.rcon) {
      const { host, port, password } = this.server.rcon;
      const r = new Rcon(host!, port, password!);
      await r.connect();
      this.rcon = r;
    }
    try {
      return await withTimeout(this.rcon.command(cmd), 10_000, `RCON-Befehl "${cmd}"`);
    } catch (err) {
      this.rcon.close();
      this.rcon = undefined;
      throw err;
    }
  }

  close() {
    this.rcon?.close();
    this.files.close();
  }

  /** Eine Abfrage: Spieler und Zonen-Kisten live. */
  async poll(s: Settings): Promise<LiveResult> {
    const players: PlayerSnapshot[] = [];
    const online = parsePlayerList(await this.rconCommand("list uuids"));
    const onlineIds = new Set(online.map((p) => p.uuid));

    for (const p of online) {
      this.names.set(p.uuid, p.name);
      if (!s.sources.inventories && !s.sources.enderChests) {
        players.push({ uuid: p.uuid, name: p.name, online: true, inventory: [], enderChest: [] });
        continue;
      }
      const data = snbtFromDataGet(await this.rconCommand(`data get entity ${p.name}`));
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

    if (s.sources.zoneChests) {
      for (const c of [...this.zoneContainers.values()]) {
        const res = await this.rconCommand(`execute in ${c.dimension} run data get block ${c.x} ${c.y} ${c.z}`);
        const data = snbtFromDataGet(res);
        if (!data) {
          // Kiste abgebaut oder Bereich nicht geladen: nur bei eindeutiger Meldung entfernen
          if (/no block entity|not a block entity/i.test(res)) this.zoneContainers.delete(c.id);
          continue;
        }
        const raw = { id: KIND_IDS[c.kind], ...(data as object) };
        const fresh = containerFromBlockEntity(raw, c.dimension, c);
        if (fresh) this.zoneContainers.set(c.id, fresh);
        else this.zoneContainers.delete(c.id);
      }
    }

    const containers = [
      ...(s.sources.zoneChests ? this.zoneContainers.values() : []),
      ...(s.sources.fullScan ? this.outsideContainers.values() : []),
    ];
    return { players, containers };
  }

  /** Zonen-Scan; liefert die Zahl neu gefundener Kisten. */
  async zoneScan(zones: Zone[], s: Settings): Promise<number> {
    let found = 0;
    try {
      await this.files.open();
      await this.loadNames();
      if (s.sources.offlinePlayers) await this.loadOfflinePlayers();
      if (s.sources.zoneChests) {
        const next = new Map<string, ContainerSnapshot>();
        for (const zone of zones) {
          for (const c of await this.containersInRegions(zone.dimension, regionsForZone(zone.center_x, zone.center_z, zone.radius))) {
            if ((c.x - zone.center_x) ** 2 + (c.z - zone.center_z) ** 2 > zone.radius ** 2) continue;
            if (!this.zoneContainers.has(c.id)) found++;
            // Live-Stand behalten, falls schon bekannt (Datei kann bis zum nächsten Autosave älter sein)
            next.set(c.id, this.zoneContainers.get(c.id) ?? c);
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
        for (const c of await this.containersInRegions(dimension, files)) if (!inZone(c)) next.set(c.id, c);
      }
    } finally {
      this.files.close();
    }
    const found = [...next.keys()].filter((id) => !this.outsideContainers.has(id)).length;
    this.outsideContainers = next;
    this.lastFullScanDay = new Date().toISOString().slice(0, 10);
    this.lastFullScanAt = new Date().toISOString();
    return found;
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

  private async containersInRegions(dimension: string, regionFiles: string[]): Promise<ContainerSnapshot[]> {
    const dir = await this.regionDir(dimension);
    if (!dir) return [];
    const existing = new Set(await this.files.list(dir));
    const out: ContainerSnapshot[] = [];
    for (const file of regionFiles) {
      if (!existing.has(file)) continue;
      const buf = await this.files.read(`${dir}/${file}`);
      for (const chunk of eachRegionChunk(buf, (i, err) => console.warn(`[scan] ${file} Chunk ${i}: ${String(err)}`))) {
        out.push(...containersFromChunk(chunk, dimension));
      }
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
