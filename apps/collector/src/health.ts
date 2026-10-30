import { createServer } from "node:http";

export interface HealthState {
  mode: string;
  startedAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  rows: number;
  unassigned: number;
}

/** Kleine Statusseite für Healthcheck und Pi-Dashboard-Kachel. */
export function startHealthServer(port: number, state: HealthState, siteUrl?: string) {
  const server = createServer((req, res) => {
    if (req.url === "/api/health") {
      const stale = !state.lastRunAt || Date.now() - Date.parse(state.lastRunAt) > 120_000;
      res.writeHead(stale ? 503 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: !stale, ...state }));
      return;
    }
    if (req.url === "/" && siteUrl) {
      res.writeHead(302, { location: siteUrl });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Minecraft-Sammler</title>
<body style="font-family:system-ui;background:#20251f;color:#eef0ea;padding:24px">
<h1 style="font-size:20px">Minecraft-Sammler</h1>
<p>Modus: ${state.mode} · letzter Lauf: ${state.lastRunAt ?? "noch keiner"}</p>
<p>${state.rows} Bestandszeilen · ${state.unassigned} Kisten nicht zugeordnet</p>
${state.lastError ? `<p style="color:#ff9c8a">Letzter Fehler: ${escape(state.lastError)}</p>` : ""}
</body>`);
  });
  server.listen(port);
  return server;
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
