export interface Config {
  mode: "mock" | "live";
  pollSeconds: number;
  httpPort: number;
  /** Einstellungen der Pi-Kachel (Docker-Volume). */
  settingsFile: string;
  siteUrl?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  rcon: { host?: string; port: number; password?: string };
}

export function loadConfig(env = process.env): Config {
  const mode = env.MODE === "live" ? "live" : "mock";
  const pollSeconds = Math.min(Math.max(Number(env.POLL_SECONDS ?? 15), 10), 30);
  return {
    mode,
    pollSeconds,
    httpPort: Number(env.HTTP_PORT ?? 8080),
    settingsFile: env.SETTINGS_FILE || "/data/settings.json",
    siteUrl: env.SITE_URL || undefined,
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    rcon: { host: env.RCON_HOST || undefined, port: Number(env.RCON_PORT ?? 25575), password: env.RCON_PASSWORD || undefined },
  };
}
