// Liest die Item-Texturen aus dem eigenen Minecraft-Client und lädt sie als icons.json in den
// privaten Supabase-Bucket "items". Die Texturen gehören Mojang und kommen deshalb nie ins Repo.
//
//   node scripts/item-icons.mjs                     neueste Version aus %APPDATA%\.minecraft
//   node scripts/item-icons.mjs <pfad\zur\26.3.jar>  bestimmte Client-Jar
//   node scripts/item-icons.mjs --nur-datei          nur item-icons.json schreiben, nicht hochladen
//
// Zum Hochladen fragt das Skript nach Name und Passwort eines Admin-Kontos der Website
// (oder MC_USER / MC_PASS als Umgebungsvariablen).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const onlyFile = args.includes("--nur-datei");
const jarArg = args.find((a) => !a.startsWith("--"));

/** Neueste Client-Jar unter .minecraft/versions: höchste Versionsnummer, Vollversionen vor Snapshots. */
function findJar() {
  const base = process.env.APPDATA ? join(process.env.APPDATA, ".minecraft") : join(homedir(), ".minecraft");
  const versions = join(base, "versions");
  if (!existsSync(versions)) throw new Error(`Kein Minecraft-Ordner unter ${base}. Pfad zur Client-Jar als Argument angeben.`);
  const jars = readdirSync(versions)
    .map((v) => join(versions, v, `${v}.jar`))
    .filter((p) => existsSync(p))
    .sort((a, b) => {
      const va = a.split(/[\\/]/).at(-2), vb = b.split(/[\\/]/).at(-2);
      const pre = (v) => Number(!/^\d+(\.\d+)*$/.test(v));
      return pre(va) - pre(vb) || vb.localeCompare(va, "en", { numeric: true });
    });
  if (!jars.length) throw new Error(`Keine Client-Jar in ${versions}. Einmal die Version im Launcher starten.`);
  return jars[0];
}

/** Minimaler Zip-Leser: nur die Einträge, die `want` zulässt. */
function readZip(buf, want) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Keine gültige Jar-Datei");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
  }
  return out;
}

const ASSETS = "assets/minecraft/";
const strip = (ref) => ref.replace(/^minecraft:/, "");

const jar = jarArg ?? findJar();
console.log(`Lese ${jar}`);
const files = readZip(readFileSync(jar), (n) => n.startsWith(ASSETS + "models/") || n.startsWith(ASSETS + "textures/item/") || n.startsWith(ASSETS + "textures/block/"));

const models = new Map();
for (const [name, data] of files) {
  if (name.startsWith(ASSETS + "models/") && name.endsWith(".json")) models.set(name.slice(ASSETS.length + 7, -5), JSON.parse(data.toString("utf8")));
}

/** Modell mit allen Eltern auflösen: Texturen zusammenführen, Kette der Eltern merken. */
function resolve(id) {
  const textures = {};
  const chain = [];
  let cur = id;
  for (let depth = 0; cur && depth < 20; depth++) {
    cur = strip(cur);
    chain.push(cur);
    const m = models.get(cur);
    if (!m) break;
    for (const [k, v] of Object.entries(m.textures ?? {})) if (!(k in textures)) textures[k] = v;
    cur = m.parent;
  }
  const tex = (k) => {
    let v = textures[k];
    for (let i = 0; typeof v === "string" && v.startsWith("#") && i < 10; i++) v = textures[v.slice(1)];
    return typeof v === "string" ? strip(v) : undefined;
  };
  return { chain, tex };
}

const textures = {};
const texIndex = new Map();
/** Textur (z. B. "block/stone") einmal ablegen, Rückgabe ist ihr Index. */
function addTexture(ref) {
  if (!ref) return undefined;
  if (texIndex.has(ref)) return texIndex.get(ref);
  const png = files.get(`${ASSETS}textures/${ref}.png`);
  if (!png) return undefined;
  const i = texIndex.size;
  texIndex.set(ref, i);
  textures[i] = png.toString("base64");
  return i;
}

const items = {};
for (const key of models.keys()) {
  if (!key.startsWith("item/")) continue;
  const id = key.slice(5);
  const { chain, tex } = resolve(key);
  const flat = tex("layer0");
  if (flat && chain.some((c) => c === "item/generated" || c === "item/handheld" || c.startsWith("item/handheld"))) {
    const t = addTexture(flat);
    if (t !== undefined) items[id] = [t];
    continue;
  }
  if (!chain.some((c) => c.startsWith("block/"))) continue; // z. B. Kisten und Köpfe (Entity-Modelle): bleiben beim Ersatzsymbol
  const any = tex("all") ?? tex("texture") ?? tex("side") ?? tex("particle");
  const top = addTexture(tex("top") ?? tex("end") ?? tex("up") ?? any);
  const side = addTexture(tex("side") ?? tex("front") ?? tex("north") ?? any);
  const front = addTexture(tex("front") ?? tex("side") ?? tex("south") ?? any);
  if (top === undefined || side === undefined) continue;
  items[id] = ["cube", top, side, front ?? side];
}

const version = jar.split(/[\\/]/).pop().replace(/\.jar$/, "");
const out = { version, created_at: new Date().toISOString(), textures, items };
const json = JSON.stringify(out);
console.log(`${Object.keys(items).length} Items, ${texIndex.size} Texturen, ${(json.length / 1024).toFixed(0)} KB (Version ${version})`);

if (onlyFile) {
  const file = join(process.cwd(), "item-icons.json");
  writeFileSync(file, json);
  console.log(`Geschrieben: ${file}`);
  process.exit(0);
}

// Hochladen mit einem Admin-Konto der Website
const env = Object.fromEntries(
  readFileSync(join(root, "apps", "web", ".env.production"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const rl = createInterface({ input: process.stdin, output: process.stdout });
const user = process.env.MC_USER || (await rl.question("Admin-Name: "));
const pass = process.env.MC_PASS || (await rl.question("Passwort: "));
rl.close();

const { data: name } = await db.rpc("login_name", { p_name: user });
const login = `${(typeof name === "string" && name ? name : user).trim().toLowerCase()}@users.mc-tracker.local`;
const { error: authError } = await db.auth.signInWithPassword({ email: login, password: pass });
if (authError) throw new Error(`Anmeldung fehlgeschlagen: ${authError.message}`);

const { error } = await db.storage.from("items").upload("icons.json", Buffer.from(json), { contentType: "application/json", cacheControl: "3600", upsert: true });
if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}. Ist die SQL-Datei für den Bucket "items" ausgeführt und das Konto Admin?`);
console.log("Hochgeladen. Die Website zeigt die Icons nach dem nächsten Neuladen.");
