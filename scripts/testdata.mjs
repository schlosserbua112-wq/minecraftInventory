// Erzeugt supabase/testdata/load.sql aus der Mock-Welt (packages/core) plus Projekten, Aufgaben, Zonen und Verlauf.
// Aufruf: npm run build -w @mc/core && node scripts/testdata.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { aggregate, containerId, createMockWorld, parseMaterialList, regionOf } from "../packages/core/dist/index.js";

const portalText = readFileSync(new URL("../packages/core/test/fixtures/medieval-nether-portal.txt", import.meta.url), "utf8");
const world = createMockWorld();

// Zusätzliche Kisten für das Nether-Portal-Projekt, damit der Materialabgleich etwas zeigt
const stack = (id, count) => ({ id, count });
const shulker = (items) => ({ id: "minecraft:shulker_box", count: 1, components: { "minecraft:container": items.map((item, slot) => ({ slot, item })) } });
const extra = [
  { x: 112, y: 64, z: -38, kind: "chest", name: "Projekt Netherportal",
    items: [stack("minecraft:stone_bricks", 64), stack("minecraft:stone_bricks", 64), stack("minecraft:stone_bricks", 64), stack("minecraft:stone_bricks", 50),
            stack("minecraft:obsidian", 16), stack("minecraft:cobblestone", 64), stack("minecraft:flint_and_steel", 1)] },
  { x: 113, y: 64, z: -38, kind: "barrel", name: "Projekt Netherportal",
    items: [stack("minecraft:spruce_stairs", 40), stack("minecraft:stone_brick_slab", 56), stack("minecraft:bookshelf", 10),
            shulker([stack("minecraft:stone_brick_stairs", 64), stack("minecraft:spruce_slab", 36), stack("minecraft:iron_bars", 10)])] },
  { x: 20, y: 70, z: 15, kind: "chest", name: "Allgemein",
    items: [stack("minecraft:stone_bricks", 64), stack("minecraft:stone_bricks", 64), stack("minecraft:stripped_spruce_log", 32),
            shulker([stack("minecraft:spruce_trapdoor", 18), stack("minecraft:spruce_fence", 4), stack("minecraft:spruce_door", 1)])] },
  // Nether-Außenlager
  { x: -40, y: 88, z: 12, kind: "chest", name: "Allgemein", dimension: "minecraft:the_nether",
    items: [stack("minecraft:quartz_block", 64), stack("minecraft:obsidian", 30), stack("minecraft:gold_ingot", 48)] },
];
for (const e of extra) {
  const dimension = e.dimension ?? "minecraft:overworld";
  world.containers.push({ id: containerId(dimension, e.x, e.y, e.z), dimension, x: e.x, y: e.y, z: e.z, kind: e.kind, customName: e.name, items: e.items });
}

const result = aggregate(world.players, world.containers);
const q = (v) => (v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const values = (rows) => rows.map((r) => `(${r.map(q).join(", ")})`).join(",\n  ");
const out = [];
const mark = (tbl, keys) => keys.length && out.push(`insert into private.testdata (tbl, key) values\n  ${values(keys.map((k) => [tbl, k]))};`);

out.push(`-- Testdaten für die Website. Erzeugt von scripts/testdata.mjs, nicht von Hand ändern.
-- Alles, was hier angelegt wird, steht in private.testdata und lässt sich mit delete.sql wieder entfernen.
-- Benutzer (profiles/auth.users) werden nicht angefasst.
begin;

create table if not exists private.testdata (
  tbl text not null,
  key text not null,
  loaded_at timestamptz not null default now(),
  primary key (tbl, key)
);
revoke all on private.testdata from public, anon, authenticated;
`);

// Spieler: Offline-Spieler zuletzt vor einigen Stunden gesehen
out.push(`insert into public.players (uuid, name, online, last_seen) values\n  ${values(world.players.map((p) => [p.uuid, p.name, p.online, null]))};`);
out.push(`update public.players set last_seen = case when online then now() else now() - (substr(uuid::text, 25)::int * interval '3 hours 40 minutes') end
  where uuid::text like '00000000-0000-4000-8000-%';`);
mark("players", world.players.map((p) => p.uuid));

const named = world.containers.filter((c) => result.owners.has(c.id));
out.push(`insert into public.containers (id, dimension, x, y, z, kind, custom_name, owner_type, owner_key, owner_label, region) values\n  ${values(
  named.map((c) => { const o = result.owners.get(c.id); return [c.id, c.dimension, c.x, c.y, c.z, c.kind, c.customName, o.type, o.key, o.label, regionOf(c.x, c.z).file]; }),
)};`);
mark("containers", named.map((c) => c.id));

// Bestände kompakt: "<i|e|c>,<Index>,<Item ohne minecraft:>,<Anzahl>"; Besitzer kommen aus players/containers
const kindCode = { inventory: "i", enderchest: "e", container: "c" };
const pIdx = new Map(world.players.map((p, i) => [p.uuid, i + 1]));
const cIdx = new Map(named.map((c, i) => [c.id, i + 1]));
const compact = result.rows
  .map((r) => [kindCode[r.source_kind], (r.source_kind === "container" ? cIdx : pIdx).get(r.source_id), r.item_id.replace(/^minecraft:/, ""), r.count].join(","))
  .join(" ");
out.push(`with d as (select string_to_array(t, ',') f from unnest(string_to_array(${q(compact)}, ' ')) t),
pl as (select id, n from unnest(array[${world.players.map((p) => q(p.uuid)).join(", ")}]) with ordinality a(id, n)),
cl as (select id, n from unnest(array[${named.map((c) => q(c.id)).join(", ")}]) with ordinality a(id, n))
insert into public.stock_items (source_kind, source_id, owner_type, owner_key, owner_label, item_id, count)
select case d.f[1] when 'i' then 'inventory' when 'e' then 'enderchest' else 'container' end::public.source_kind,
       coalesce(c.id, p.uuid::text), coalesce(c.owner_type, 'player'), coalesce(c.owner_key, lower(p.name)), coalesce(c.owner_label, p.name),
       'minecraft:' || d.f[3], d.f[4]::int
from d
left join pl on d.f[1] <> 'c' and pl.n = d.f[2]::int left join public.players p on p.uuid::text = pl.id
left join cl on d.f[1] = 'c' and cl.n = d.f[2]::int left join public.containers c on c.id = cl.id;`);
// stock_items hängen an source_id (Spieler-UUID oder Kisten-ID), dafür reichen die Marker oben

// Projekte und Ziele
const portal = parseMaterialList(portalText);
const projects = [
  ["burg", "Burg"], ["hafen", "Hafen"], ["bahnhof", "Bahnhof"], ["netherportal", "Netherportal"],
];
out.push(`insert into public.projects (key, label) values\n  ${values(projects)};`);
mark("projects", projects.map(([k]) => k));
const goals = [
  ["burg", "minecraft:stone_bricks", 3000], ["burg", "minecraft:glass", 800], ["burg", "minecraft:oak_log", 400], ["burg", "minecraft:torch", 200],
  ["hafen", "minecraft:oak_log", 1000], ["hafen", "minecraft:spruce_planks", 600], ["hafen", "minecraft:sand", 300],
  ["bahnhof", "minecraft:iron_ingot", 500], ["bahnhof", "minecraft:redstone", 300], ["bahnhof", "minecraft:gold_ingot", 120],
  ...portal.items.map((it) => ["netherportal", it.itemId, it.count]),
];
out.push(`insert into public.project_goals (project_key, item_id, target) values\n  ${values(goals)};`);
out.push(`insert into public.material_lists (project_key, title, raw_text, uploaded_by) values\n  ${values([["netherportal", "Medieval Nether Portal", portalText, "testdaten"]])};`);

const tasks = [
  ["burg", "Fundament abstecken", "Grundriss 40×40 mit Wolle markieren", "Vale", "done", 0],
  ["burg", "Steinziegel brennen", "Ca. 3000 Stück, Öfen am Lager nutzen", "Max", "in_progress", 0],
  ["burg", "Glas schmelzen", null, null, "todo", 0],
  ["burg", "Bergfried hochziehen", "Erst wenn Steinziegel komplett", "Lena", "todo", 1],
  ["burg", "Burggraben mit Lava", "Verworfen, zu gefährlich", "Jonas", "cancelled", 0],
  ["hafen", "Fichten fällen", null, "Lena", "todo", 0],
  ["hafen", "Steg Variante 1", null, "Jonas", "cancelled", 0],
  ["hafen", "Leuchtturm planen", "Schematic suchen", "Mia", "in_progress", 0],
  ["bahnhof", "Schienen craften", "Eisen aus der Farm holen", "Paul", "todo", 0],
  ["bahnhof", "Bahnsteig bauen", null, "Emma", "done", 0],
  ["netherportal", "Materialliste hochladen", null, "Vale", "done", 0],
  ["netherportal", "Fichtenholz besorgen", "Treppen, Stufen, Falltüren", "Leon", "in_progress", 0],
  ["netherportal", "Bücherregale craften", "24 Stück, Bücher fehlen noch", "Sophie", "todo", 0],
  ["netherportal", "Portal entzünden", null, "Finn", "todo", 1],
];
out.push(`insert into public.project_tasks (project_key, title, description, assignee, status, position, created_by) values\n  ${values(tasks.map((t) => [...t, "testdaten"]))};`);
// Aufgaben und Materiallisten hängen per on delete cascade an den Projekten

out.push(`with z as (
  insert into public.zones (name, dimension, center_x, center_z, radius, is_main) values
  ${values([
    ["Hauptbasis", "minecraft:overworld", 0, 0, 400, true],
    ["Außenposten Mesa", "minecraft:overworld", 900, -650, 120, false],
    ["Nether-Hub", "minecraft:the_nether", 0, 0, 80, false],
  ])}
  returning id
) insert into private.testdata (tbl, key) select 'zones', id::text from z;`);

out.push(`insert into public.collector_status (id, heartbeat_at, mode, message, version) values (1, now(), 'mock', 'Testdaten, kein Sammler aktiv', 'testdaten')
  on conflict (id) do nothing;
insert into private.testdata (tbl, key) values ('collector_status', '1') on conflict do nothing;`);

out.push(`with s as (
  insert into public.scan_requests (requested_at, requested_by, started_at, finished_at, result) values
  (now() - interval '2 days', 'testdaten', now() - interval '2 days', now() - interval '2 days' + interval '40 seconds', 'Testdaten: 3 neue Kisten gefunden'),
  (now() - interval '5 hours', 'testdaten', now() - interval '5 hours', now() - interval '5 hours' + interval '25 seconds', 'Testdaten: keine neuen Kisten')
  returning id
) insert into private.testdata (tbl, key) select 'scan_requests', id::text from s;`);

// Verlauf: 14 Tage alle 6 Stunden, rückwärts aus dem heutigen Stand mit leichtem Aufwärtstrend und Rauschen
out.push(`insert into public.stock_history (taken_at, owner_type, owner_key, item_id, count)
select date_trunc('hour', now()) - (n * interval '6 hours'), t.owner_type, t.owner_key, t.item_id,
       greatest(0, round(t.count * (1 - n * 0.006 + 0.08 * sin(n * 0.9 + length(t.item_id) + length(t.owner_key)))))::int
from public.owner_totals t cross join generate_series(0, 55) n;
insert into private.testdata (tbl, key) values ('stock_history', 'bis ' || now()::text);`);

out.push("commit;\n");
mkdirSync(new URL("../supabase/testdata/", import.meta.url), { recursive: true });
writeFileSync(new URL("../supabase/testdata/load.sql", import.meta.url), out.join("\n\n"));
console.log(`${world.players.length} Spieler, ${named.length} Kisten, ${result.rows.length} Bestandszeilen, ${goals.length} Ziele, ${tasks.length} Aufgaben`);
