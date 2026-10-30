export interface Config {
  mode: "mock" | "live";
  pollSeconds: number;
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
    supabaseUrl: env.SUPABASE_URL || undefined,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    rcon: { host: env.RCON_HOST || undefined, port: Number(env.RCON_PORT ?? 25575), password: env.RCON_PASSWORD || undefined },
  };
}
