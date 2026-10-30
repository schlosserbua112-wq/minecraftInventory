import { deflateSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { containersFromChunk, parseSnbt, snbtFromDataGet, uuidFromInts } from "../src/index.js";
import { readNbt, readRegionChunks } from "../src/node.js";

// Kleiner NBT-Schreiber nur für Tests
function str(s: string) { const b = Buffer.from(s, "utf8"); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); }
function tag(type: number, name: string, payload: Buffer) { return Buffer.concat([Buffer.from([type]), str(name), payload]); }
const int = (v: number) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
const compound = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.from([0])]);
function list(type: number, items: Buffer[]) { return Buffer.concat([Buffer.from([type]), int(items.length), ...items]); }

describe("SNBT", () => {
  it("liest Compounds, Listen, Suffixe und typisierte Arrays", () => {
    const v = parseSnbt(`{x: 12, y: -3, Items: [{Slot: 0b, id: "minecraft:diamond", count: 64}], UUID: [I; 1, -2, 3, 4], f: 1.5f, ok: 1b, CustomName: 'Allgemein', "q k": "a\\"b"}`);
    expect(v).toEqual({ x: 12, y: -3, Items: [{ Slot: 0, id: "minecraft:diamond", count: 64 }], UUID: [1, -2, 3, 4], f: 1.5, ok: 1, CustomName: "Allgemein", "q k": 'a"b' });
  });
  it("schneidet die Daten aus einer /data-get-Antwort", () => {
    expect(snbtFromDataGet(`1, 64, 2 has the following block data: {id: "minecraft:chest"}`)).toEqual({ id: "minecraft:chest" });
    expect(snbtFromDataGet("No block entity at 1, 2, 3")).toBeNull();
  });
});

describe("NBT und Region", () => {
  const chest = compound(
    tag(8, "id", str("minecraft:chest")), tag(3, "x", int(10)), tag(3, "y", int(64)), tag(3, "z", int(-5)),
    tag(8, "CustomName", str("Projekt Burg")),
    tag(9, "Items", list(10, [compound(tag(8, "id", str("minecraft:glass")), tag(3, "count", int(32)))])),
  );
  const root = tag(10, "", compound(tag(9, "block_entities", list(10, [chest]))));

  it("liest gzip-NBT", () => {
    expect(readNbt(gzipSync(root))).toMatchObject({ block_entities: [{ id: "minecraft:chest", x: 10 }] });
  });

  it("liest Chunks aus einer Region-Datei und findet Kisten", () => {
    const data = deflateSync(root);
    const body = Buffer.concat([int(data.length + 1), Buffer.from([2]), data]);
    const sectors = Math.ceil(body.length / 4096);
    const file = Buffer.alloc(8192 + sectors * 4096);
    file.writeUInt32BE((2 << 8) | sectors, 0);
    body.copy(file, 8192);
    const chunks = readRegionChunks(file);
    expect(chunks).toHaveLength(1);
    const [c] = containersFromChunk(chunks[0], "minecraft:overworld");
    expect(c).toMatchObject({ kind: "chest", customName: "Projekt Burg", x: 10, items: [{ id: "minecraft:glass", count: 32 }] });
  });

  it("wandelt UUID-Int-Arrays um", () => {
    expect(uuidFromInts([0, 1, 2, -1])).toBe("00000000-0000-0001-0000-0002ffffffff");
  });
});

describe("echte Dateien von Minecraft 26.3", () => {
  const dir = new URL("./fixtures/mc-26.3/world/", import.meta.url);
  it("findet Vales benannte Kisten in r.0.0.mca", async () => {
    const { readFileSync } = await import("node:fs");
    const chunks = readRegionChunks(readFileSync(new URL("dimensions/minecraft/overworld/region/r.0.0.mca", dir)));
    const chests = chunks.flatMap((c) => containersFromChunk(c, "minecraft:overworld")).filter((c) => c.customName === "Vale");
    expect(chests.map((c) => `${c.x} ${c.y} ${c.z}`).sort()).toEqual(["0 120 16", "0 120 17", "0 121 16", "0 121 17"]);
    const items = chests.flatMap((c) => c.items.map((i) => i.id)).sort();
    expect(items).toEqual(["minecraft:anvil", "minecraft:chest"]);
  });
  it("liest die Spielerdatei aus players/data", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const pd = new URL("players/data/", dir);
    const file = readdirSync(pd).find((f) => f.endsWith(".dat"))!;
    const data = readNbt(readFileSync(new URL(file, pd)));
    expect(data.Dimension).toBe("minecraft:overworld");
    expect(Array.isArray(data.Inventory) || data.Inventory === undefined).toBe(true);
  });
});

describe("echte RCON-Antworten von G-Portal (26.3, Fabric)", () => {
  it("liest volle Spieler-Entities und deren Inventar", async () => {
    const { readFileSync } = await import("node:fs");
    const { playerInventory } = await import("../src/index.js");
    for (const name of ["Tomsen04", "HiaxxxX"]) {
      const text = readFileSync(new URL(`./fixtures/gportal/rcon/data-get-entity-${name}.txt`, import.meta.url), "utf8").split("\n").slice(1).join("\n");
      const data = snbtFromDataGet(text);
      expect(playerInventory(data).length).toBeGreaterThan(0);
    }
  });
  it("liest list uuids", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("./fixtures/gportal/rcon/list-uuids.txt", import.meta.url), "utf8");
    expect(text).toContain("VoisuffVale0810 (be6a62d9-5a99-4429-9e1b-0933842be448)");
  });
});
