import { aggregate, createMockWorld, type ContainerSnapshot, type PlayerSnapshot } from "@mc/core";
import { loadConfig } from "./config.js";
import { startHealthServer, type HealthState } from "./health.js";
import { defaultSettings, SettingsStore, type Settings } from "./settings.js";
import { ConsoleSink, SupabaseSink, type Sink } from "./sink.js";

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

  if (config.mode === "live") {
    // Folgt, sobald der Server erreichbar ist: RCON-Abfrage der Online-Spieler,
    // /data get block für bekannte Kisten, FTP für playerdata und Region-Dateien.
    throw new Error("MODE=live ist noch nicht umgesetzt. Bitte MODE=mock verwenden.");
  }

  const health: HealthState = { mode: config.mode, startedAt: new Date().toISOString(), lastRunAt: null, lastError: null, rows: 0, unassigned: 0 };
  // Neue Einstellungen sofort übernehmen, nicht erst nach der laufenden Wartezeit
  let wake = () => {};
  const server = startHealthServer(config.httpPort, health, settings, () => wake(), config.siteUrl);

  const world = createMockWorld();
  let stopping = false;
  const stop = () => {
    stopping = true;
    wake();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  console.log(`Mock-Sammler läuft, alle ${settings.get().pollSeconds} s.`);
  while (!stopping) {
    const started = Date.now();
    const s = settings.get();
    try {
      if (s.paused) {
        await sink.heartbeat("mock", "pausiert");
      } else {
        world.tick();
        const { players, containers } = applySources(world.players, world.containers, s.sources);
        const result = aggregate(players, containers);
        await sink.write(players, containers, result, s.historyMinutes);
        const scans = await sink.takeScanRequests();
        await sink.finishScanRequests(scans, "Mock: keine neuen Kisten gefunden");
        await sink.heartbeat("mock");
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
  server.close();
  console.log("Beendet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
