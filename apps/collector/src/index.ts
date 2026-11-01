import { aggregate, createMockWorld, detectTakes, type ContainerSnapshot, type PlayerPos, type PlayerSnapshot, type TakeFrame, type UnnamedRule } from "@mc/core";
import { loadConfig, missingLiveConfig } from "./config.js";
import { startHealthServer, type HealthState } from "./health.js";
import { LiveCollector } from "./live.js";
import { LocalMapStore, SupabaseMapStore, type MapStore } from "./mapstore.js";
import { defaultSettings, SettingsStore, type Settings } from "./settings.js";
import { ConsoleSink, SupabaseSink, type HeartbeatExtra, type ScanRequest, type Sink, type UnnamedState } from "./sink.js";
import { worldFiles } from "./worldfiles.js";

const config = loadConfig();
const settings = new SettingsStore(config.settingsFile, defaultSettings(config.pollSeconds));

/** Nur die Datenquellen behalten, die auf der Kachel eingeschaltet sind. */
function applySources(players: PlayerSnapshot[], containers: ContainerSnapshot[], s: Settings["sources"]) {
  const keptPlayers = players.map((p) => {
    const visible = p.online || s.offlinePlayers;
    return {
      ...p,
      inventory: visible && (p.online ? s.inventories : true) ? p.inventory : [],
      enderChest: visible && s.enderChests ? p.enderChest : [],
    };
  });
  return { players: keptPlayers, containers: s.zoneChests || s.fullScan ? containers : [] };
}

/**
 * Was mit unbenannten Kisten ohne „Meine“-Markierung passiert: Die Pi-Kachel kann sie fest als Allgemein
 * oder „Unbenannt“ zählen; steht sie auf „ignorieren“, entscheidet app_settings.show_unnamed
 * (seit die Zuordnung in der Suche liegt, fest an).
 */
function unnamedRule(s: Settings, unnamed: UnnamedState): UnnamedRule {
  if (s.unnamedChests !== "ignore") return s.unnamedChests;
  return unnamed.show ? "unassigned" : "ignore";
}

/** Ein Durchlauf liefert Spieler und Kisten, egal ob Testdaten oder echter Server. */
interface Source {
  run(s: Settings, sink: Sink, wantUnnamed: (c: ContainerSnapshot) => boolean): Promise<{
    players: PlayerSnapshot[];
    containers: ContainerSnapshot[];
    message?: string;
    extra?: HeartbeatExtra;
    /** Nur live: Spielerpositionen und live gelesene Kisten, für die Entnahmen. */
    positions?: PlayerPos[];
    liveIds?: Set<string>;
    /** Nur live: Doppelkisten als [ID der Kiste, ID der zweiten Hälfte]. */
    mergedHalves?: [string, string][];
  }>;
  close(): void;
}

function mockSource(): Source {
  const world = createMockWorld();
  return {
    async run(s, sink) {
      world.tick();
      const scans = await sink.takeScanRequests();
      await sink.finishScanRequests(scans.map((r) => r.id), "Mock: keine neuen Kisten gefunden");
      return applySources(world.players, world.containers, s.sources);
    },
    close() {},
  };
}

function liveSource(): Source {
  const missing = missingLiveConfig(config);
  if (missing.length) throw new Error(`MODE=live, aber in der .env fehlt: ${missing.join(", ")}`);
  const live = new LiveCollector(config.server, worldFiles(config.server.world));
  const mapStore: MapStore =
    config.supabaseUrl && config.supabaseKey ? new SupabaseMapStore(config.supabaseUrl, config.supabaseKey) : new LocalMapStore(process.env.MAP_DIR || "map-out");
  let lastZoneScan = 0;
  let firstRun = true;
  /** Scans laufen im Hintergrund, die Live-Abfrage wartet nie auf sie. */
  let scanning: Promise<void> | null = null;
  let scanMessage: string | undefined;
  /** Erste Runde wartet, bis Offline-Spieler und Zonen-Kisten geladen sind, sonst würden sie kurz gelöscht. */
  let firstZoneScan: Promise<void> | null = null;
  let zoneScanDone = () => {};

  async function scan(sink: Sink, s: Settings, scans: ScanRequest[], full: boolean, map: boolean | "if-missing") {
    // Kartenanfragen gelten erst nach dem Zeichnen als erledigt
    const mapIds = scans.filter((r) => r.kind === "map").map((r) => r.id);
    const scanIds = scans.filter((r) => r.kind !== "map").map((r) => r.id);
    const zones = await sink.loadZones();
    const parts: string[] = [];
    const t = Date.now();
    const found = await live.zoneScan(zones, s, scans.length > 0);
    lastZoneScan = Date.now();
    parts.push(`Zonen-Scan: ${found} neue Kisten (${Math.round((Date.now() - t) / 1000)} s)`);
    await sink.finishScanRequests(scanIds, `${found} neue Kisten gefunden`);
    zoneScanDone();
    if (s.sources.stats) {
      try {
        const stats = await live.readStats();
        await sink.writeStats(stats);
        parts.push(`Statistiken: ${stats.length} Spieler`);
      } catch (err) {
        parts.push(`Statistiken fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (full) {
      const t2 = Date.now();
      const outside = await live.fullScan(zones);
      parts.push(`Vollscan: ${outside} Kisten außerhalb der Zonen (${Math.round((Date.now() - t2) / 1000)} s)`);
    }
    if (map === true || (map === "if-missing" && !(await mapStore.loadIndex()).updated_at)) {
      const t3 = Date.now();
      try {
        const { regions, uploaded } = await live.renderMap(mapStore);
        parts.push(`Karte: ${regions} Regionen, ${uploaded} neu (${Math.round((Date.now() - t3) / 1000)} s)`);
        await sink.finishScanRequests(mapIds, `Karte neu gezeichnet: ${regions} Regionen, ${uploaded} geändert`);
      } catch (err) {
        // Eine kaputte Karte darf den Kisten-Scan nicht als fehlgeschlagen melden
        const msg = `Karte fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
        parts.push(msg);
        await sink.finishScanRequests(mapIds, msg);
      }
    } else {
      await sink.finishScanRequests(mapIds, "Karte ist in den Einstellungen des Pi ausgeschaltet");
    }
    scanMessage = parts.join(" · ");
    console.log(`[live] ${scanMessage}`);
  }

  return {
    async run(s, sink, wantUnnamed) {
      if (!scanning) {
        const zoneDue = firstRun || Date.now() - lastZoneScan >= s.zoneScanMinutes * 60_000;
        const scans = await sink.takeScanRequests();
        const full = firstRun ? s.sources.fullScan : live.fullScanDue(s);
        const mapRequested = s.sources.map && scans.some((r) => r.kind === "map");
        const map = mapRequested || (firstRun ? (s.sources.map ? "if-missing" : false) : live.mapDue(s));
        if (zoneDue || scans.length || full || map) {
          if (firstRun) firstZoneScan = new Promise((resolve) => { zoneScanDone = resolve; });
          firstRun = false;
          scanning = scan(sink, s, scans, full, map)
            .catch((err) => {
              scanMessage = `Scan fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
              console.error(`[live] ${scanMessage}`);
              lastZoneScan = Date.now(); // nicht in jeder Runde neu versuchen
              // Sonst bleiben die Anfragen auf der Website ewig "läuft"
              return sink.finishScanRequests(scans.map((r) => r.id), scanMessage).catch(() => {});
            })
            .finally(() => {
              zoneScanDone();
              scanning = null;
            });
        }
      }
      if (firstZoneScan) {
        await firstZoneScan;
        firstZoneScan = null;
        zoneScanDone = () => {};
      }
      const result = await live.poll(s, wantUnnamed);
      const message = scanning ? "Scan läuft …" : scanMessage;
      return {
        ...result,
        message,
        extra: { ...(live.lastZoneScanAt && { last_zone_scan_at: live.lastZoneScanAt }), ...(live.lastFullScanAt && { last_full_scan_at: live.lastFullScanAt }) },
      };
    },
    close: () => live.close(),
  };
}

async function main() {
  let sink: Sink;
  if (config.supabaseUrl && config.supabaseKey) {
    const s = new SupabaseSink(config.supabaseUrl, config.supabaseKey);
    await s.init();
    sink = s;
  } else {
    console.log("Keine Supabase-Zugangsdaten gesetzt, schreibe nur auf die Konsole.");
    sink = new ConsoleSink();
  }

  const source = config.mode === "live" ? liveSource() : mockSource();
  if (config.mode === "live") console.log(`Live-Modus: ${config.server.name}, RCON ${config.server.rcon.host}:${config.server.rcon.port}, Dateien per ${config.server.world.source}`);

  const health: HealthState = { mode: config.mode, startedAt: new Date().toISOString(), lastRunAt: null, lastError: null, rows: 0, unassigned: 0 };
  // Neue Einstellungen sofort übernehmen, nicht erst nach der laufenden Wartezeit
  let wake = () => {};
  const server = startHealthServer(config.httpPort, health, settings, () => wake(), config.siteUrl);

  let stopping = false;
  const stop = () => {
    stopping = true;
    wake();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  /** Stand der letzten Abfrage, mit dem die nächste auf Entnahmen verglichen wird. */
  let lastFrame: TakeFrame | null = null;

  console.log(`Sammler läuft (${config.mode}), alle ${settings.get().pollSeconds} s.`);
  while (!stopping) {
    const started = Date.now();
    const s = settings.get();
    try {
      if (s.paused) {
        lastFrame = null;
        await sink.heartbeat(config.mode, "pausiert");
      } else {
        const owners = await sink.loadOwners();
        let unnamed = await sink.loadUnnamed();
        let rule = unnamedRule(s, unnamed);
        const wantUnnamed = (c: ContainerSnapshot) => unnamed.claims.has(c.id) || (rule !== "ignore" && !unnamed.hidden.has(c.id));
        const run = await source.run(s, sink, wantUnnamed);
        // Neu erkannte Doppelkisten: Markierungen der zweiten Hälfte sofort übernehmen und neu laden
        if (run.mergedHalves?.length && (await sink.mergeHalves(run.mergedHalves))) {
          unnamed = await sink.loadUnnamed();
          rule = unnamedRule(s, unnamed);
        }
        const { players, message, extra } = run;
        const containers = run.containers.filter((c) => c.customName || wantUnnamed(c));
        const result = aggregate(players, containers, rule, owners, unnamed.claims);
        await sink.write(players, containers, result, s.historyMinutes);
        if (s.sources.takes && run.positions && run.liveIds) {
          const live = run.liveIds;
          const frame: TakeFrame = { rows: result.rows, containers: containers.filter((c) => live.has(c.id)), positions: run.positions };
          // Reichweite: an der Kiste plus der Weg, den man zwischen zwei Abfragen sprinten kann
          const events = lastFrame ? detectTakes(lastFrame, frame, { owners, reachBlocks: 8 + 6 * s.pollSeconds }) : [];
          if (events.length) await sink.writeTakes(events);
          lastFrame = frame;
        } else lastFrame = null;
        await sink.heartbeat(config.mode, message, extra);
        Object.assign(health, { lastRunAt: new Date().toISOString(), lastError: null, rows: result.rows.length, unassigned: result.unassigned.length });
      }
    } catch (err) {
      console.error("Fehler im Durchlauf:", err);
      health.lastError = err instanceof Error ? err.message : String(err);
    }
    const wait = Math.max(s.pollSeconds * 1000 - (Date.now() - started), 1000);
    await new Promise<void>((r) => {
      const t = setTimeout(r, wait);
      wake = () => {
        clearTimeout(t);
        r();
      };
    });
  }
  source.close();
  server.close();
  console.log("Beendet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
