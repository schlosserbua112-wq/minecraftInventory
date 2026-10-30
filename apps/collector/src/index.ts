import { aggregate, createMockWorld } from "@mc/core";
import { loadConfig } from "./config.js";
import { startHealthServer, type HealthState } from "./health.js";
import { ConsoleSink, SupabaseSink, type Sink } from "./sink.js";

const config = loadConfig();

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
  const server = startHealthServer(config.httpPort, health, config.siteUrl);

  const world = createMockWorld();
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  console.log(`Mock-Sammler läuft, alle ${config.pollSeconds} s.`);
  while (!stopping) {
    const started = Date.now();
    try {
      world.tick();
      const result = aggregate(world.players, world.containers);
      await sink.write(world.players, world.containers, result);
      const scans = await sink.takeScanRequests();
      await sink.finishScanRequests(scans, "Mock: keine neuen Kisten gefunden");
      await sink.heartbeat("mock");
      Object.assign(health, { lastRunAt: new Date().toISOString(), lastError: null, rows: result.rows.length, unassigned: result.unassigned.length });
    } catch (err) {
      console.error("Fehler im Durchlauf:", err);
      health.lastError = err instanceof Error ? err.message : String(err);
    }
    const wait = Math.max(config.pollSeconds * 1000 - (Date.now() - started), 1000);
    await new Promise((r) => setTimeout(r, wait));
  }
  server.close();
  console.log("Beendet.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
