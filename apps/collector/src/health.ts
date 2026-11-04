import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { LIMITS, type SettingsStore } from "./settings.js";

export interface HealthState {
  mode: string;
  startedAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  rows: number;
  unassigned: number;
}

/** Statusseite und Einstellungen für die Pi-Dashboard-Kachel, dazu der Healthcheck. */
export function startHealthServer(port: number, state: HealthState, settings: SettingsStore, onChange: () => void, siteUrl?: string) {
  const server = createServer(async (req, res) => {
    try {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/api/health") {
        // Pausiert gilt als gesund, sonst meldet Docker den Container als kaputt
        const stale = !settings.get().paused && (!state.lastRunAt || Date.now() - Date.parse(state.lastRunAt) > 120_000);
        return json(res, stale ? 503 : 200, { ok: !stale, paused: settings.get().paused, ...state });
      }
      if (path === "/api/settings" && req.method === "GET") {
        return json(res, 200, { settings: settings.get(), limits: LIMITS, state, siteUrl: siteUrl ?? null });
      }
      if (path === "/api/settings" && (req.method === "PUT" || req.method === "POST")) {
        if (!sameOrigin(req)) return json(res, 403, { error: "Nur von dieser Seite aus änderbar" });
        const body = JSON.parse((await readBody(req)) || "{}");
        const next = body.reset ? settings.reset() : settings.update(body.settings);
        console.log("[einstellungen] geändert:", JSON.stringify(next));
        onChange();
        return json(res, 200, { settings: next });
      }
      if (path === "/" || path === "/einstellungen") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(PAGE);
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Nicht gefunden");
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : String(err) });
    }
  });
  server.listen(port);
  return server;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Schutz gegen fremde Webseiten, die im Heimnetz Einstellungen ändern wollen:
 * nur JSON (erzwingt beim Browser eine Vorabprüfung, die wir nie erlauben) und gleiche Herkunft.
 */
function sameOrigin(req: IncomingMessage) {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 10_000) reject(new Error("Zu groß"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const PAGE = /* html */ `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minecraft-Sammler</title>
<style>
:root{--ground:#20251f;--panel:#272d26;--line:#39412f;--field:#1a1e19;--text:#eef0ea;--muted:#a3ab9c;--accent:#e9c46a;--ok:#9ee08a;--bad:#ff9c8a}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;padding:14px 24px;background:var(--panel);border-bottom:1px solid var(--line)}
h1{margin:0;font-size:19px;font-weight:700;letter-spacing:.01em}
header a{margin-left:auto}
a{color:var(--accent)}
main,form{display:flex;flex-direction:column;gap:20px}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
section{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px 20px}
h2{margin:0 0 4px;font-size:16px}
.hint{margin:0 0 14px;color:var(--muted);font-size:13px}
.status{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.status div{display:flex;flex-direction:column}
.status b{font-size:18px;font-variant-numeric:tabular-nums}
.status span{color:var(--muted);font-size:12px}
.row{display:flex;align-items:center;gap:14px;padding:10px 0;border-top:1px solid var(--line)}
.row:first-of-type{border-top:0}
.row .txt{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.row .txt small{color:var(--muted);font-size:12.5px}
.tag{display:inline-block;margin-left:6px;padding:0 6px;border-radius:3px;background:#39412f;color:var(--muted);font-size:11px;vertical-align:1px}
input[type=checkbox]{appearance:none;width:42px;height:24px;flex:0 0 42px;border-radius:12px;background:#46503b;position:relative;cursor:pointer;transition:background .15s}
input[type=checkbox]::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#eef0ea;transition:transform .15s}
input[type=checkbox]:checked{background:var(--accent)}
input[type=checkbox]:checked::after{transform:translateX(18px);background:#20251f}
.num{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.num input{width:84px;height:38px;padding:0 10px;background:var(--field);color:var(--text);border:1px solid #46503b;border-radius:4px;font:inherit;text-align:right;font-variant-numeric:tabular-nums}
.num span{color:var(--muted);font-size:13px;width:62px}
select{height:38px;padding:0 10px;background:var(--field);color:var(--text);border:1px solid #46503b;border-radius:4px;font:inherit}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
button{min-height:42px;padding:0 18px;border-radius:4px;font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#20251f}
button.ghost{background:transparent;color:var(--text);border-color:#46503b}
button:disabled{opacity:.5;cursor:default}
#msg{font-size:13px;color:var(--muted)}
#msg.ok{color:var(--ok)}#msg.bad{color:var(--bad)}
.err{color:var(--bad)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
</head>
<body>
<header><h1>Minecraft-Sammler</h1><span id="mode" class="hint" style="margin:0"></span><a id="site" target="_blank" rel="noopener" hidden>Zur Website</a></header>
<main>
<section>
  <h2>Status</h2>
  <div class="status" id="status"></div>
  <p id="error" class="err" hidden></p>
</section>

<form id="form">
<section>
  <h2>Datenquellen</h2>
  <p class="hint">Was der Sammler abholt. Ausgeschaltete Quellen verschwinden beim nächsten Durchlauf auch von der Website.</p>
  <label class="row"><span class="txt">Inventare (online)<small>Was Spieler gerade bei sich tragen, per RCON</small></span><input type="checkbox" name="inventories"></label>
  <label class="row"><span class="txt">Enderkisten<small>Online per RCON, offline aus den Spielerdaten</small></span><input type="checkbox" name="enderChests"></label>
  <label class="row"><span class="txt">Offline-Spieler<small>Inventare und Enderkisten aus den Spielerdaten per FTP</small></span><input type="checkbox" name="offlinePlayers"></label>
  <label class="row"><span class="txt">Kisten in den Zonen<small>Bekannte Kisten, Fässer und Shulkerkisten, per RCON</small></span><input type="checkbox" name="zoneChests"></label>
  <label class="row"><span class="txt">Vollscan der Welt<small>Alle Region-Dateien nach neuen Kisten durchsuchen, per FTP</small></span><input type="checkbox" name="fullScan"></label>
  <label class="row"><span class="txt">Weltkarte<small>Draufsicht der Oberwelt für die Website zeichnen, täglich zur Vollscan-Uhrzeit</small></span><input type="checkbox" name="map"></label>
  <label class="row"><span class="txt">Entnahmen aus fremden Kisten<small>Positionen der Online-Spieler lesen und melden, wer etwas aus einer Spielerkiste in einer Zone genommen hat, per RCON</small></span><input type="checkbox" name="takes"></label>
  <label class="row"><span class="txt">Spielerstatistiken<small>Spielzeit, Tode, Kills, Strecken und Abgebautes aus den Stats-Dateien, bei jedem Zonen-Scan per FTP</small></span><input type="checkbox" name="stats"></label>
  <label class="row"><span class="txt">Unbenannte Kisten in Zonen<small>Kisten ohne Namen, aber mit Inhalt. Ungeöffnete Loot-Kisten zählen nie. Als „Meine“ markierte Kisten zählen immer für den Spieler.</small></span><select name="unnamedChests"><option value="ignore">Schalter auf der Website</option><option value="common">als Allgemein zählen</option><option value="unassigned">als „Unbenannt“ zeigen</option></select></label>
</section>

<section>
  <h2>Häufigkeit</h2>
  <p class="hint">Kürzere Abstände sind aktueller, belasten aber Server und Pi stärker.</p>
  <div class="row"><span class="txt">Spieler und bekannte Kisten abfragen<small>Live-Abfrage per RCON</small></span><span class="num"><input type="number" name="pollSeconds" required><span>Sekunden</span></span></div>
  <div class="row"><span class="txt">Zonen nach neuen Kisten durchsuchen<small>Lädt nur die Region-Dateien der Zonen</small></span><span class="num"><input type="number" name="zoneScanMinutes" required><span>Minuten</span></span></div>
  <div class="row"><span class="txt">Täglicher Vollscan um<small>Am besten nachts, wenn niemand spielt</small></span><span class="num"><input type="number" name="fullScanHour" required><span>Uhr</span></span></div>
</section>

<section>
  <h2>Betrieb</h2>
  <label class="row"><span class="txt">Sammler pausieren<small>Holt keine Daten mehr, bis du die Pause wieder ausschaltest. Die Website zeigt den letzten Stand.</small></span><input type="checkbox" name="paused"></label>
</section>

<div class="actions">
  <button type="submit" id="save">Speichern</button>
  <button type="button" class="ghost" id="reset">Standardwerte</button>
  <span id="msg" role="status"></span>
</div>
<p class="hint">Zugangsdaten für RCON, FTP und Supabase stehen nicht hier, sondern nur in /etc/minecraft-tracker.env auf dem Pi.</p>
</form>
</main>
<script>
const SOURCES = ["inventories","enderChests","offlinePlayers","zoneChests","fullScan","map","takes","stats"];
const NUMBERS = ["pollSeconds","zoneScanMinutes","fullScanHour"];
const form = document.getElementById("form");
const msg = document.getElementById("msg");
let dirty = false;

function say(text, kind) { msg.textContent = text; msg.className = kind || ""; }
function ago(iso) {
  if (!iso) return "noch keiner";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "vor " + s + " s" : s < 3600 ? "vor " + Math.round(s / 60) + " min" : new Date(iso).toLocaleString("de-DE");
}

function fill(data) {
  const s = data.settings;
  for (const k of SOURCES) form.elements[k].checked = s.sources[k];
  for (const k of NUMBERS) {
    const el = form.elements[k];
    el.min = data.limits[k][0]; el.max = data.limits[k][1]; el.value = s[k];
  }
  form.elements.paused.checked = s.paused;
  form.elements.unnamedChests.value = s.unnamedChests;
  dirty = false;
}

function showState(data) {
  const st = data.state, s = data.settings;
  document.getElementById("mode").textContent = st.mode === "mock" ? "Testmodus mit Beispieldaten" : "Live-Modus";
  if (data.siteUrl) { const a = document.getElementById("site"); a.href = data.siteUrl; a.hidden = false; }
  const items = [
    [s.paused ? "Pausiert" : "Läuft", "Zustand"],
    [ago(st.lastRunAt), "Letzter Durchlauf"],
    [st.rows.toLocaleString("de-DE"), "Bestandszeilen"],
    [st.unassigned.toLocaleString("de-DE"), "Kisten nicht zugeordnet"],
  ];
  document.getElementById("status").innerHTML = items.map(([v, l]) => "<div><b></b><span></span></div>").join("");
  document.querySelectorAll("#status div").forEach((d, i) => { d.querySelector("b").textContent = items[i][0]; d.querySelector("span").textContent = items[i][1]; });
  const e = document.getElementById("error");
  e.hidden = !st.lastError; e.textContent = st.lastError ? "Letzter Fehler: " + st.lastError : "";
}

async function load(withForm) {
  const res = await fetch("/api/settings");
  const data = await res.json();
  showState(data);
  if (withForm) fill(data);
}

function collect() {
  const sources = {};
  for (const k of SOURCES) sources[k] = form.elements[k].checked;
  const s = { sources, paused: form.elements.paused.checked, unnamedChests: form.elements.unnamedChests.value };
  for (const k of NUMBERS) s[k] = Number(form.elements[k].value);
  return s;
}

async function send(body) {
  document.getElementById("save").disabled = true;
  say("Speichere …");
  try {
    const res = await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    await load(true);
    say("Gespeichert, gilt ab sofort.", "ok");
  } catch (err) {
    say("Nicht gespeichert: " + err.message, "bad");
  } finally {
    document.getElementById("save").disabled = false;
  }
}

form.addEventListener("input", () => { dirty = true; say("Noch nicht gespeichert"); });
form.addEventListener("submit", (e) => { e.preventDefault(); if (form.reportValidity()) send({ settings: collect() }); });
document.getElementById("reset").addEventListener("click", () => { if (confirm("Alle Einstellungen auf Standard zurücksetzen?")) send({ reset: true }); });

load(true).catch(() => say("Sammler nicht erreichbar", "bad"));
setInterval(() => load(!dirty).catch(() => {}), 10000);
</script>
</body>
</html>`;
