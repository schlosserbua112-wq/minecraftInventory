import { describe, expect, it } from "vitest";
import { summarizeStats, totalDistance } from "../src/index.js";

const file = {
  stats: {
    "minecraft:custom": {
      "minecraft:play_time": 72000,
      "minecraft:deaths": 3,
      "minecraft:walk_one_cm": 150000,
      "minecraft:sprint_one_cm": 50000,
      "minecraft:aviate_one_cm": 100000,
      "minecraft:fall_one_cm": 999,
      "minecraft:jump": 0,
    },
    "minecraft:mined": { "minecraft:stone": 500, "minecraft:diamond_ore": 12, "minecraft:dirt": 80 },
    "minecraft:killed": { "minecraft:zombie": 20, "minecraft:creeper": 5 },
    "minecraft:killed_by": { "minecraft:creeper": 2, "minecraft:skeleton": 1 },
  },
  DataVersion: 4440,
};

describe("summarizeStats", () => {
  it("fasst Zähler, Strecken und Ranglisten zusammen", () => {
    const s = summarizeStats(file)!;
    expect(s.custom).toEqual({ play_time: 72000, deaths: 3 });
    expect(s.distance).toMatchObject({ walk: 150000, sprint: 50000, fly: 100000, fall: 999 });
    expect(totalDistance(s)).toBe(300000);
    expect(s.totals).toMatchObject({ mined: 592, killed: 25, crafted: 0 });
    expect(s.top.mined).toEqual([["minecraft:stone", 500], ["minecraft:dirt", 80], ["minecraft:diamond_ore", 12]]);
    expect(s.top.killed_by[0]).toEqual(["minecraft:creeper", 2]);
  });

  it("lehnt Dateien ohne stats ab", () => {
    expect(summarizeStats({})).toBeNull();
    expect(summarizeStats(null)).toBeNull();
  });
});
