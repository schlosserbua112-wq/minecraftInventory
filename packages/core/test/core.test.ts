import { describe, expect, it } from "vitest";
import { aggregate, classifyName, countItems, createMockWorld, itemLabel, plainText, regionOf, regionsForZone } from "../src/index.js";
import type { ContainerSnapshot, ItemStack } from "../src/index.js";

const players = ["Max", "Lena"];

describe("classifyName", () => {
  it("ignoriert unbenannte Kisten", () => {
    expect(classifyName(null, players)).toBeNull();
    expect(classifyName("   ", players)).toBeNull();
  });

  it("erkennt Spieler unabhängig von Groß-/Kleinschreibung", () => {
    expect(classifyName("max", players)).toEqual({ type: "player", key: "max", label: "Max" });
    expect(classifyName("LENA", players)?.type).toBe("player");
  });

  it("erkennt Allgemein", () => {
    expect(classifyName("ALLGEMEIN", players)).toEqual({ type: "common", key: "allgemein", label: "Allgemein" });
  });

  it("erkennt Projekte", () => {
    expect(classifyName("Projekt Burg", players)).toEqual({ type: "project", key: "burg", label: "Burg" });
    expect(classifyName("projekt   Großer Turm", players)).toEqual({ type: "project", key: "großer turm", label: "Großer Turm" });
  });

  it("zählt alles mit Präfix Projekt als Projekt", () => {
    expect(classifyName("Projektburg", players)).toEqual({ type: "project", key: "burg", label: "burg" });
    expect(classifyName("Projekt", players)).toEqual({ type: "project", key: "projekt", label: "Projekt" });
  });

  it("ordnet Aliase dem Konto zu", () => {
    const owners = new Map([["voisuffvale0810", "Valentin"], ["vale", "Valentin"]]);
    expect(classifyName("Vale", owners)).toEqual({ type: "player", key: "valentin", label: "Valentin" });
    const r = aggregate([{ uuid: "u", name: "VoisuffVale0810", online: true, inventory: [{ id: "minecraft:stone", count: 1 }], enderChest: [] }], [], "ignore", owners);
    expect(r.rows[0]).toMatchObject({ owner_key: "valentin", owner_label: "Valentin" });
  });

  it("markiert Tippfehler als nicht zugeordnet", () => {
    expect(classifyName("Allgmein", players)?.type).toBe("unassigned");
    expect(classifyName("Maxx", players)?.type).toBe("unassigned");
  });

  it("liest Text-Komponenten", () => {
    expect(classifyName('{"text":"Projekt Burg"}', players)?.key).toBe("burg");
    expect(classifyName('"Allgemein"', players)?.type).toBe("common");
    expect(classifyName({ text: "", extra: [{ text: "Ma" }, "x"] }, players)?.type).toBe("player");
  });
});

describe("plainText", () => {
  it("lässt normale Strings unverändert", () => {
    expect(plainText("Max")).toBe("Max");
  });
});

describe("countItems", () => {
  const shulker: ItemStack = {
    id: "minecraft:shulker_box",
    count: 1,
    components: {
      "minecraft:container": [
        { slot: 0, item: { id: "minecraft:diamond", count: 64 } },
        { slot: 1, item: { id: "minecraft:diamond", count: 10 } },
      ],
    },
  };

  it("zählt Shulker-Inhalte mit", () => {
    const counts = countItems([shulker, { id: "minecraft:diamond", count: 1 }]);
    expect(counts.get("minecraft:diamond")).toBe(75);
    expect(counts.get("minecraft:shulker_box")).toBe(1);
  });

  it("versteht das alte BlockEntityTag-Format", () => {
    const legacy: ItemStack = {
      id: "minecraft:shulker_box",
      count: 1,
      tag: { BlockEntityTag: { Items: [{ id: "minecraft:iron_ingot", Count: 32 }] } },
    };
    expect(countItems([legacy]).get("minecraft:iron_ingot")).toBe(32);
  });

  it("zählt Bündel", () => {
    const bundle: ItemStack = {
      id: "minecraft:bundle",
      count: 1,
      components: { "minecraft:bundle_contents": [{ id: "minecraft:arrow", count: 12 }] },
    };
    expect(countItems([bundle]).get("minecraft:arrow")).toBe(12);
  });
});

describe("regionOf", () => {
  it("rechnet mit floor, auch negativ", () => {
    expect(regionOf(0, 0).file).toBe("r.0.0.mca");
    expect(regionOf(511, 512).file).toBe("r.0.1.mca");
    expect(regionOf(-1, -513).file).toBe("r.-1.-2.mca");
  });

  it("findet Regionen einer Zone", () => {
    expect(regionsForZone(256, 256, 100)).toEqual(["r.0.0.mca"]);
    expect(regionsForZone(0, 0, 100).sort()).toEqual(["r.-1.-1.mca", "r.-1.0.mca", "r.0.-1.mca", "r.0.0.mca"]);
  });
});

describe("aggregate", () => {
  const chest = (name: string | null, items: ItemStack[]): ContainerSnapshot => ({
    id: `minecraft:overworld:${name}`,
    dimension: "minecraft:overworld",
    x: 0,
    y: 64,
    z: 0,
    kind: "chest",
    customName: name,
    items,
  });

  it("ordnet Kisten und Inventare zu", () => {
    const result = aggregate(
      [{ uuid: "u1", name: "Max", online: true, inventory: [{ id: "minecraft:coal", count: 5 }], enderChest: [] }],
      [
        chest("max", [{ id: "minecraft:coal", count: 3 }]),
        chest("Projekt Burg", [{ id: "minecraft:stone_bricks", count: 64 }]),
        chest(null, [{ id: "minecraft:diamond", count: 64 }]),
        chest("Lager", [{ id: "minecraft:sand", count: 1 }]),
      ],
    );
    const coal = result.rows.filter((r) => r.owner_key === "max" && r.item_id === "minecraft:coal");
    expect(coal.map((r) => r.count).sort()).toEqual([3, 5]);
    expect(result.rows.some((r) => r.item_id === "minecraft:diamond")).toBe(false);
    expect(result.unassigned.map((c) => c.customName)).toEqual(["Lager"]);
    expect(result.rows.find((r) => r.owner_type === "project")?.owner_label).toBe("Burg");
  });
});

describe("mock", () => {
  it("ist deterministisch und tickt", () => {
    const a = createMockWorld(1);
    const b = createMockWorld(1);
    expect(a.containers).toEqual(b.containers);
    a.tick();
    expect(aggregate(a.players, a.containers).rows.length).toBeGreaterThan(50);
  });
});

it("itemLabel", () => {
  expect(itemLabel("minecraft:iron_ingot")).toBe("Iron Ingot");
});
