import { aggregate, createMockWorld, type ContainerSnapshot, type PlayerSnapshot } from "@mc/core";
import { loadConfig, missingLiveConfig } from "./config.js";
import { startHealthServer, type HealthState } from "./health.js";
import { LiveCollector } from "./live.js";
import { defaultSettings, SettingsStore, type Settings } from "./settings.js";
import { ConsoleSink, SupabaseSink, type HeartbeatExtra, type Sink } from "./sink.js";
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

/** Ein Durchlauf liefert Spieler und Kisten, egal ob Testdaten oder echter Server. */
interface Source {
  run(s: Settings, sink: Sink): Promise<{ players: PlayerSnapshot[]; containers: ContainerSnapshot[]; message?: string; extra?: HeartbeatExtra }>;
  close(): void;
}

function mockSource(): Source {
  const world = createMockWorld();
  return {
    async run(s, sink) {
      world.tick();
      const scans = await sink.takeScanRequests();
      await sink.finishScanRequests(scans, "Mock: keine neuen Kisten gefunden");
      return applySources(world.players, world.containers, s.sources);
    },
    close() {},
  };
}

function liveSource(): Source {
  const missing = missingLiveConfig(config);
  if (missing.length) throw new Error(`MODE=live, aber in der .env fehlt: ${missing.join(", ")}`);
  const live = new LiveCollector(config.server, worldFiles(config.server.world));
  let lastZoneScan = 0;
  let firstRun = true;
  /** Scans laufen im Hintergrund, die Live-Abfrage wartet nie auf sie. */
  let scanning: Promise<void> | null = null;
  let scanMessage: string | undefined;

  async function scan(sink: Sink, s: Settings, scans: number[], full: boolean) {
    const zones = await sink.loadZones();
    const parts: string[] = [];
    const t = Date.now();
    const found = await live.zoneScan(zones, s);
    lastZoneScan = Date.now();
    parts.push(`Zonen-Scan: ${found} neue Kisten (${Math.round((Date.now() - t) / 1000)} s)`);
    await sink.finishScanRequests(scans, `${found} neue Kisten gefunden`);
    if (full) {
      const t2 = Date.now();
      const outside = await live.fullScan(zones);
      parts.push(`Vollscan: ${outside} Kisten außerhalb der Zonen (${Math.round((Date.now() - t2) / 1000)} s)`);
    }
    scanMessage = parts.join(" · ");
    console.log(`[live] ${scanMessage}`);
  }

  return {
    async run(s, sink) {
      if (!scanning) {
        const zoneDue = firstRun || Date.now() - lastZoneScan >= s.zoneScanMinutes * 60_000;
        const scans = await sink.takeScanRequests();
        const full = firstRun ? s.sources.fullScan : live.fullScanDue(s);
        if (zoneDue || scans.length || full) {
          firstRun = false;
          scanning = scan(sink, s, scans, full)
            .catch((err) => {
              scanMessage = `Scan fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
              console.error(`[live] ${scanMessage}`);
              lastZoneScan = Date.now(); // nicht in jeder Runde neu versuchen
            })
            .finally(() => {
              scanning = null;
            });
        }
      }
      const result = await live.poll(s);
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

  console.log(`Sammler läuft (${config.mode}), alle ${settings.get().pollSeconds} s.`);
  while (!stopping) {
    const started = Date.now();
    const s = settings.get();
    try {
      if (s.paused) {
        await sink.heartbeat(config.mode, "pausiert");
      } else {
        const { players, containers, message, extra } = await source.run(s, sink);
        const result = aggregate(players, containers);
        await sink.write(players, containers, result, s.historyMinutes);
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
