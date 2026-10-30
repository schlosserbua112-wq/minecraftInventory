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
import { basename, dirname, join } from "node:path";
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
const files = readZip(
  readFileSync(jar),
  (n) => n.startsWith(ASSETS + "models/") || n.startsWith(ASSETS + "items/") || n.startsWith(ASSETS + "textures/item/") || n.startsWith(ASSETS + "textures/block/"),
);

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

/** Farbe (0xRRGGBB) einer Einfärbung aus items/*.json; Gras und Laub wie im Biom "Ebene". */
function tintColor(t) {
  if (!t || typeof t !== "object") return undefined;
  if (typeof t.value === "number") return t.value & 0xffffff;
  if (typeof t.default === "number") return t.default & 0xffffff;
  const type = strip(String(t.type ?? ""));
  if (type === "grass") return 0x91bd59;
  if (type.includes("foliage")) return 0x77ab2f;
  return undefined;
}

/** Erstes Modell in einer Item-Definition (ab 1.21.4: assets/minecraft/items/<id>.json). */
function findModel(node) {
  if (!node || typeof node !== "object") return undefined;
  const type = strip(String(node.type ?? ""));
  if (type === "special") return undefined; // Kisten, Köpfe, Banner: im Spiel als 3D-Modell gezeichnet
  if (type === "model" && typeof node.model === "string") return { ref: node.model, tint: tintColor(node.tints?.[0]) };
  for (const key of ["fallback", "on_false", "on_true", "model"]) {
    const m = findModel(node[key]);
    if (m) return m;
  }
  for (const list of [node.cases, node.entries, node.models]) {
    for (const c of Array.isArray(list) ? list : []) {
      const m = findModel(c.model ?? c);
      if (m) return m;
    }
  }
  return undefined;
}

/** Ein Item als flaches Bild oder Würfel eintragen. */
function addItem(id, modelRef, tint) {
  const { chain, tex } = resolve(modelRef);
  const flat = tex("layer0");
  const t = tint === undefined ? [] : [tint];
  if (flat && chain.some((c) => c === "item/generated" || c.startsWith("item/handheld") || c === "builtin/generated")) {
    const i = addTexture(flat);
    if (i !== undefined) items[id] = [i, ...t];
    return;
  }
  if (!chain.some((c) => c.startsWith("block/"))) return;
  const any = tex("all") ?? tex("texture") ?? tex("side") ?? tex("particle");
  const top = addTexture(tex("top") ?? tex("end") ?? tex("up") ?? any);
  const side = addTexture(tex("side") ?? tex("front") ?? tex("north") ?? any);
  const front = addTexture(tex("front") ?? tex("side") ?? tex("south") ?? any);
  if (top === undefined || side === undefined) {
    // Pflanzen, Fackeln usw. haben ein Blockmodell aus gekreuzten Flächen: dann die Textur flach zeigen
    const plain = addTexture(tex("cross") ?? tex("torch") ?? tex("plant") ?? any);
    if (plain !== undefined) items[id] = [plain, ...t];
    return;
  }
  // Grasblock: nur die Oberseite ist gefärbt, die Seite hat Erde
  items[id] = ["cube", top, side, front ?? side, ...t, ...(tint !== undefined && top !== side ? [1] : [])];
}

const items = {};
const definitions = [...files.keys()].filter((n) => n.startsWith(ASSETS + "items/") && n.endsWith(".json"));
if (definitions.length) {
  for (const name of definitions) {
    const id = name.slice(ASSETS.length + 6, -5);
    const m = findModel(JSON.parse(files.get(name).toString("utf8")).model);
    if (m) addItem(id, m.ref, m.tint);
  }
} else {
  // Ältere Versionen: Modell liegt direkt unter models/item/<id>.json
  for (const key of models.keys()) if (key.startsWith("item/")) addItem(key.slice(5), key);
}

/** Deutsche Namen aus dem Sprachpaket des Launchers (liegt nicht in der Jar, sondern unter assets/objects). */
function germanNames() {
  const versionDir = dirname(jar);
  const assetsDir = [join(versionDir, "..", "..", "assets"), join(versionDir, "..", "..", "..", "assets")].find((d) => existsSync(join(d, "indexes")));
  if (!assetsDir) return {};
  const meta = join(versionDir, `${basename(jar, ".jar")}.json`);
  let indexId = existsSync(meta) ? JSON.parse(readFileSync(meta, "utf8")).assetIndex?.id : undefined;
  const indexes = readdirSync(join(assetsDir, "indexes")).filter((f) => f.endsWith(".json"));
  const indexFile = indexId && indexes.includes(`${indexId}.json`) ? `${indexId}.json` : indexes.sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
  if (!indexFile) return {};
  const hash = JSON.parse(readFileSync(join(assetsDir, "indexes", indexFile), "utf8")).objects?.["minecraft/lang/de_de.json"]?.hash;
  const file = hash && join(assetsDir, "objects", hash.slice(0, 2), hash);
  if (!file || !existsSync(file)) return {};
  const lang = JSON.parse(readFileSync(file, "utf8"));
  const names = {};
  for (const id of Object.keys(items)) {
    const n = lang[`item.minecraft.${id}`] ?? lang[`block.minecraft.${id}`];
    if (n) names[id] = n;
  }
  return names;
}
const names = germanNames();

const version = jar.split(/[\\/]/).pop().replace(/\.jar$/, "");
const out = { version, created_at: new Date().toISOString(), textures, items, names };
const json = JSON.stringify(out);
console.log(`${Object.keys(items).length} Items, ${texIndex.size} Texturen, ${Object.keys(names).length} deutsche Namen, ${(json.length / 1024).toFixed(0)} KB (Version ${version})`);

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

const { error } = await db.storage.from("items").upload("icons.json", Buffer.from(json), { contentType: "application/json", cacheControl: "60", upsert: true });
if (error) throw new Error(`Hochladen fehlgeschlagen: ${error.message}. Ist die SQL-Datei für den Bucket "items" ausgeführt und das Konto Admin?`);
console.log("Hochgeladen. Die Website zeigt die Icons nach dem nächsten Neuladen.");
