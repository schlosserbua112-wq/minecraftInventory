export interface ServerConfig {
  /** Anzeigename, z. B. "Testserver ValePC" oder "G-Portal". */
  name: string;
  rcon: { host?: string; port: number; password?: string };
  /** Name des Weltordners im Server-Ordner (level-name aus server.properties). */
  level: string;
  /** Woher die Server-Dateien kommen: lokaler Ordner (Testserver) oder FTP (G-Portal). `dir` ist der Server-Ordner. */
  world:
    | { source: "local"; dir: string }
    | { source: "ftp"; dir: string; host: string; port: number; user: string; password: string; secure: boolean | "implicit" };
}

export interface Config {
  mode: "mock" | "live";
  pollSeconds: number;
  httpPort: number;
  /** Einstellungen der Pi-Kachel (Docker-Volume). */
  settingsFile: string;
  siteUrl?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  server: ServerConfig;
}

/**
 * Alles, was den Minecraft-Server beschreibt, kommt aus Umgebungsvariablen.
 * Umschalten zwischen Testserver und echtem Server = andere .env verwenden.
 */
export function loadConfig(env = process.env): Config {
  const mode = env.MODE === "live" ? "live" : "mock";
  const pollSeconds = Math.min(Math.max(Number(env.POLL_SECONDS ?? 15), 10), 30);
  const secure = env.FTP_SECURE === "implicit" ? "implicit" : env.FTP_SECURE === "true";
  const world: ServerConfig["world"] =
    env.WORLD_SOURCE === "ftp"
      ? { source: "ftp", dir: env.SERVER_DIR || "/", host: env.FTP_HOST ?? "", port: Number(env.FTP_PORT ?? 21), user: env.FTP_USER ?? "", password: env.FTP_PASSWORD ?? "", secure }
      : { source: "local", dir: env.SERVER_DIR || "." };
  return {
    mode,
    pollSeconds,
    httpPort: Number(env.HTTP_PORT ?? 8080),
    settingsFile: env.SETTINGS_FILE || "/data/settings.json",
    siteUrl: env.SITE_URL || undefined,
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    server: {
      name: env.SERVER_NAME || "Minecraft-Server",
      level: env.LEVEL_NAME || "world",
      rcon: { host: env.RCON_HOST || undefined, port: Number(env.RCON_PORT ?? 25575), password: env.RCON_PASSWORD || undefined },
      world,
    },
  };
}

/** Fehlende Angaben für den Live-Modus, als lesbare Liste. */
export function missingLiveConfig(c: Config): string[] {
  const m: string[] = [];
  if (!c.server.rcon.host) m.push("RCON_HOST");
  if (!c.server.rcon.password) m.push("RCON_PASSWORD");
  if (c.server.world.source === "ftp") {
    if (!c.server.world.host) m.push("FTP_HOST");
    if (!c.server.world.user) m.push("FTP_USER");
    if (!c.server.world.password) m.push("FTP_PASSWORD");
  }
  return m;
}
