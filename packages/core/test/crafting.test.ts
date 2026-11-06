import { describe, expect, it } from "vitest";
import { craftFlow, craftableItems, woodTypes } from "../src/crafting.js";

const node = (f: ReturnType<typeof craftFlow>, id: string) => f.nodes.find((n) => n.item_id === `minecraft:${id}`);

describe("craftFlow", () => {
  it("Treppen: Bretter derselben Holzsorte, davor Stämme, mit Rundung", () => {
    const f = craftFlow("minecraft:oak_stairs", 20);
    expect(node(f, "oak_stairs")).toMatchObject({ crafts: 5, perCraft: 4, leftover: 0, station: "werkbank" });
    expect(node(f, "oak_planks")).toMatchObject({ need: 30, crafts: 8, leftover: 2 });
    expect(node(f, "oak_log")).toMatchObject({ need: 8, base: true, missing: 8, stage: 0 });
    expect(node(f, "oak_stairs")!.stage).toBe(2);
  });

  it("zählt gemeinsame Zwischenprodukte zusammen, bevor gerundet wird", () => {
    const f = craftFlow("minecraft:activator_rail", 12);
    // 4 Stöcke für die Schienen + 2 für die Redstone-Fackeln = 6 → 2 Crafts, 2 übrig
    expect(node(f, "stick")).toMatchObject({ need: 6, crafts: 2, leftover: 2 });
    expect(node(f, "oak_planks")).toMatchObject({ need: 4, crafts: 1 });
    expect(node(f, "oak_log")).toMatchObject({ need: 1, base: true });
    expect(node(f, "iron_ingot")).toMatchObject({ need: 12, base: true });
    expect(node(f, "redstone")).toMatchObject({ need: 2, base: true });
    expect(f.edges.filter((e) => e.from === "minecraft:stick").map((e) => e.count).sort()).toEqual([2, 4]);
  });

  it("nimmt die gewählte Holzsorte, wo jedes Holz geht", () => {
    const f = craftFlow("minecraft:piston", 8, { wood: "spruce" });
    expect(node(f, "spruce_planks")).toMatchObject({ need: 24, crafts: 6 });
    expect(node(f, "spruce_log")).toMatchObject({ need: 6, base: true });
    expect(node(f, "spruce_planks")!.choice?.options).toContain("minecraft:oak_planks");
    expect(node(f, "oak_planks")).toBeUndefined();
  });

  it("Eisenbarren, Redstone und Kohle sind Grundstoffe, Nuggets kommen aus Barren", () => {
    expect(node(craftFlow("minecraft:iron_block", 1), "iron_ingot")).toMatchObject({ need: 9, base: true });
    expect(node(craftFlow("minecraft:redstone_block", 1), "redstone")).toMatchObject({ base: true });
    const lantern = craftFlow("minecraft:lantern", 1);
    expect(node(lantern, "iron_nugget")).toMatchObject({ need: 8, base: false });
    expect(node(lantern, "iron_ingot")).toMatchObject({ need: 1, base: true });
  });

  it("Steinsäge nur, wenn erlaubt", () => {
    expect(node(craftFlow("minecraft:stone_brick_stairs", 4), "stone_brick_stairs")).toMatchObject({ station: "werkbank", crafts: 1 });
    expect(node(craftFlow("minecraft:stone_brick_stairs", 4, { stonecutter: true }), "stone_brick_stairs")).toMatchObject({ station: "steinsaege", crafts: 4 });
  });

  it("Auswahl je Zutat überschreibt die Voreinstellung (Holzkohle statt Kohle)", () => {
    const f = craftFlow("minecraft:torch", 4);
    const key = node(f, "coal")!.choice!.key;
    const g = craftFlow("minecraft:torch", 4, { choices: { [key]: "minecraft:charcoal" } });
    expect(node(g, "charcoal")).toMatchObject({ need: 1, base: true });
    expect(node(g, "coal")).toBeUndefined();
  });

  it("nimmt erst den Bestand und craftet nur den Rest", () => {
    const f = craftFlow("minecraft:oak_stairs", 20, { stock: new Map([["minecraft:oak_planks", 26]]) });
    expect(node(f, "oak_planks")).toMatchObject({ need: 30, have: 26, crafts: 1, leftover: 0 });
    expect(node(f, "oak_log")).toMatchObject({ need: 1, missing: 1 });
  });

  it("weitere Auflösung lässt sich abschalten", () => {
    const f = craftFlow("minecraft:oak_stairs", 4, { raw: ["minecraft:oak_planks"] });
    expect(node(f, "oak_planks")).toMatchObject({ base: true, stopped: true, need: 6 });
    expect(node(f, "oak_log")).toBeUndefined();
  });

  it("weiße Wolle standardmäßig aus Faden, nicht aus anderer Wolle", () => {
    expect(node(craftFlow("minecraft:white_wool", 1), "string")).toMatchObject({ need: 4 });
  });

  it("Leder ist ein Grundstoff", () => {
    expect(node(craftFlow("minecraft:bookshelf", 1), "leather")).toMatchObject({ need: 3, base: true });
  });

  it("Listen für die Auswahl", () => {
    expect(woodTypes()).toEqual(expect.arrayContaining(["oak", "spruce", "cherry"]));
    expect(craftableItems()).toContain("minecraft:oak_stairs");
    expect(craftableItems().length).toBeGreaterThan(500);
  });
});
