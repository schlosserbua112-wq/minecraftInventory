import { describe, expect, it } from "vitest";
import { planProject } from "../src/recipes.js";

const m = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [`minecraft:${k}`, v]));
const need = (o: Record<string, number>) => Object.entries(o).map(([k, quantity]) => ({ item_id: `minecraft:${k}`, quantity }));

describe("planProject", () => {
  it("craftet über Zwischenstufen: Stamm → Bretter → Treppen", () => {
    const [p] = planProject(need({ oak_stairs: 8 }), m({ oak_log: 3 }));
    // 8 Treppen = 2 Crafts à 6 Bretter = 12 Bretter = 3 Stämme
    expect(p).toMatchObject({ have: 0, craftable: 8, missing: 0 });
    expect(p.uses).toEqual([{ item_id: "minecraft:oak_log", count: 3 }]);
  });

  it("nimmt erst den eigenen Bestand und craftet nur die Lücke", () => {
    const [p] = planProject(need({ stone_bricks: 10 }), m({ stone_bricks: 6, stone: 20 }));
    expect(p).toMatchObject({ have: 6, craftable: 4, missing: 0 });
    expect(p.uses).toEqual([{ item_id: "minecraft:stone", count: 4 }]);
  });

  it("zählt Material nicht doppelt", () => {
    const [bricks, stone] = planProject(need({ stone_bricks: 8, stone: 20 }), m({ stone: 24 }));
    // Stein ist zuerst für sich selbst reserviert, nur 4 bleiben für 4 Steinziegel
    expect(stone).toMatchObject({ have: 20, missing: 0 });
    expect(bricks).toMatchObject({ have: 0, craftable: 4, missing: 4 });
  });

  it("teilt Material zwischen zwei craftbaren Items", () => {
    const [a, b] = planProject(need({ oak_stairs: 4, oak_slab: 6 }), m({ oak_planks: 7 }));
    expect(a).toMatchObject({ craftable: 4, missing: 0 });
    expect(b).toMatchObject({ craftable: 0, missing: 6 }); // nur noch 1 Brett übrig
  });

  it("bevorzugt die Steinsäge, wenn sie sparsamer ist", () => {
    const [p] = planProject(need({ stone_brick_stairs: 4 }), m({ stone_bricks: 4 }));
    expect(p).toMatchObject({ craftable: 4, missing: 0 });
  });

  it("nutzt beliebige Bretter für Kisten und mehrere Zutaten für Fackeln", () => {
    // 2 Kisten = 16 Bretter (8 Birke + 2 Fichtenstämme), der dritte Stamm reicht für die Stöcke
    const [chest, torch] = planProject(need({ chest: 2, torch: 8 }), m({ birch_planks: 8, spruce_log: 3, coal: 2 }));
    expect(chest).toMatchObject({ craftable: 2, missing: 0 });
    expect(torch).toMatchObject({ craftable: 8, missing: 0 });
  });

  it("lässt Items ohne Rezept fehlen", () => {
    const [p] = planProject(need({ diamond: 3 }), m({ stone: 64 }));
    expect(p).toMatchObject({ craftable: 0, missing: 3, uses: [] });
  });

  it("bleibt bei großen Mengen schnell", () => {
    const t = Date.now();
    const plans = planProject(
      need({ stone_brick_stairs: 1200, oak_stairs: 600, spruce_fence: 300, lantern: 64, chest: 100, torch: 500, iron_block: 30, glass_pane: 400 }),
      m({ stone: 900, cobblestone: 2000, oak_log: 100, spruce_log: 80, iron_ingot: 200, iron_nugget: 500, coal: 60, glass: 100, birch_log: 30 }),
    );
    expect(Date.now() - t).toBeLessThan(500);
    expect(plans.find((p) => p.item_id === "minecraft:stone_brick_stairs")!.craftable).toBe(900);
  });
});
