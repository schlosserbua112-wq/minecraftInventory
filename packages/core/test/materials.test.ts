import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balanceMaterials, nameToItemId, parseMaterialList } from "../src/index.js";

const fixture = readFileSync(new URL("./fixtures/medieval-nether-portal.txt", import.meta.url), "utf8");

describe("parseMaterialList", () => {
  const list = parseMaterialList(fixture);

  it("liest Titel und Info", () => {
    expect(list.title).toBe("Medieval Nether Portal");
    expect(list.info).toBe("897 blocks · 252 steps");
  });

  it("liest alle 16 Materialien ohne Stack-Klammern", () => {
    expect(list.items).toHaveLength(16);
    expect(list.items[0]).toEqual({ name: "Stone Bricks", itemId: "minecraft:stone_bricks", count: 428 });
    expect(list.items.find((i) => i.name === "Flint & Steel")?.itemId).toBe("minecraft:flint_and_steel");
    expect(list.skipped).toEqual([]);
  });

  it("akzeptiert x statt ×, fasst doppelte zusammen und merkt sich Unbekanntes", () => {
    const l = parseMaterialList("3x Glass\n2 x glass\nirgendwas\n5× Glas", new Set(["minecraft:glass"]));
    expect(l.items).toEqual([
      { name: "Glass", itemId: "minecraft:glass", count: 5 },
      { name: "Glas", itemId: "minecraft:glas", count: 5 },
    ]);
    expect(l.skipped).toEqual(["irgendwas"]);
    expect(l.unknown.map((u) => u.name)).toEqual(["Glas"]);
  });

  it("versteht Tausenderpunkte", () => {
    expect(parseMaterialList("1.200× Stone Bricks").items[0].count).toBe(1200);
  });
});

it("nameToItemId", () => {
  expect(nameToItemId("Jack o'Lantern")).toBe("minecraft:jack_o_lantern");
  expect(nameToItemId(" Stripped Spruce Log ")).toBe("minecraft:stripped_spruce_log");
});

it("balanceMaterials rechnet Projekt vor Allgemein", () => {
  const b = balanceMaterials(
    [{ itemId: "minecraft:stone_bricks", count: 428 }],
    new Map([["minecraft:stone_bricks", 300]]),
    new Map([["minecraft:stone_bricks", 100]]),
  );
  expect(b[0]).toEqual({ itemId: "minecraft:stone_bricks", needed: 428, inProject: 300, inCommon: 100, missing: 28 });
});

describe("parseMaterialList mit Litematica-Liste", () => {
  const text = `Materials for Riesen_Burg: \n\n* Stone Bricks: 113,786\n* Coarse Dirt: 27,528\n* Stone Brick Stairs: 4,442\n* Oak Sign: 10\n* Tripwire Hook: 1\n`;
  const l = parseMaterialList(text);

  it("schlägt den Namen ohne Unterstrich und Doppelpunkt vor", () => {
    expect(l.title).toBe("Riesen Burg");
  });

  it("liest Namen, IDs und Tausenderkommas", () => {
    expect(l.items).toEqual([
      { name: "Stone Bricks", itemId: "minecraft:stone_bricks", count: 113786 },
      { name: "Coarse Dirt", itemId: "minecraft:coarse_dirt", count: 27528 },
      { name: "Stone Brick Stairs", itemId: "minecraft:stone_brick_stairs", count: 4442 },
      { name: "Oak Sign", itemId: "minecraft:oak_sign", count: 10 },
      { name: "Tripwire Hook", itemId: "minecraft:tripwire_hook", count: 1 },
    ]);
    expect(l.skipped).toEqual([]);
  });

  it("versteht auch Punkte, Bindestriche und =", () => {
    const x = parseMaterialList("- Glass: 1.200\nDirt = 5\n• Torch: 3");
    expect(x.items.map((i) => [i.itemId, i.count])).toEqual([
      ["minecraft:glass", 1200],
      ["minecraft:dirt", 5],
      ["minecraft:torch", 3],
    ]);
  });
});

it("liest den Litematica-Tabellenexport", () => {
  const l = parseMaterialList("+-------+-------+\n| Item | Total | Missing |\n+---+\n| Stone Bricks | 113786 | 5 |\n| Oak Log | 1,024 | 0 |\n+---+");
  expect(l.items.map((i) => [i.itemId, i.count])).toEqual([["minecraft:stone_bricks", 113786], ["minecraft:oak_log", 1024]]);
  expect(l.skipped).toEqual([]);
});
