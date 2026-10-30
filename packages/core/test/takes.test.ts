import { describe, expect, it } from "vitest";
import { detectTakes, type PlayerPos, type StockRow, type TakeFrame } from "../src/index.js";

const chest = { id: "minecraft:overworld:10:64:10", dimension: "minecraft:overworld", x: 10, y: 64, z: 10 };
const box = (count: number, owner = "max"): StockRow => ({
  source_kind: "container", source_id: chest.id, owner_type: "player", owner_key: owner, owner_label: owner, item_id: "minecraft:diamond", count,
});
const inv = (uuid: string, count: number): StockRow[] =>
  count ? [{ source_kind: "inventory", source_id: uuid, owner_type: "player", owner_key: uuid, owner_label: uuid, item_id: "minecraft:diamond", count }] : [];
const at = (uuid: string, name: string, x: number, z = 10): PlayerPos => ({ uuid, name, dimension: "minecraft:overworld", x, y: 64, z });
const frame = (rows: StockRow[], positions: PlayerPos[]): TakeFrame => ({ rows, containers: [chest], positions });

describe("detectTakes", () => {
  it("meldet einen fremden Spieler an der Kiste, der das Item bekommen hat, als sicher", () => {
    const prev = frame([box(10), ...inv("l", 0)], [at("l", "Lena", 12)]);
    const next = frame([box(4), ...inv("l", 6)], [at("l", "Lena", 11)]);
    expect(detectTakes(prev, next)).toEqual([
      expect.objectContaining({ count: 6, suspects: ["Lena"], confidence: "sicher", owner_key: "max" }),
    ]);
  });

  it("erkennt den Weg zwischen zwei Abfragen: vorbeigelaufen und weiter", () => {
    const prev = frame([box(10)], [at("l", "Lena", -20)]);
    const next = frame([box(0), ...inv("l", 10)], [at("l", "Lena", 40)]);
    expect(detectTakes(prev, next)[0]).toMatchObject({ confidence: "sicher", suspects: ["Lena"], distance: 1 });
  });

  it("meldet nichts, wenn der Besitzer selbst nimmt", () => {
    const prev = frame([box(10)], [at("m", "Max", 11)]);
    const next = frame([box(4), ...inv("m", 6)], [at("m", "Max", 11)]);
    expect(detectTakes(prev, next)).toEqual([]);
  });

  it("erkennt den Besitzer auch unter seinem Alias", () => {
    const prev = frame([box(10, "valentin")], [at("v", "Vale0810", 11)]);
    const next = frame([box(4, "valentin"), ...inv("v", 6)], [at("v", "Vale0810", 11)]);
    expect(detectTakes(prev, next, { owners: new Map([["vale0810", "Valentin"]]) })).toEqual([]);
  });

  it("meldet nichts ohne fremden Spieler in der Nähe (Trichter)", () => {
    const prev = frame([box(10)], [at("l", "Lena", 500)]);
    const next = frame([box(9)], [at("l", "Lena", 500)]);
    expect(detectTakes(prev, next)).toEqual([]);
  });

  it("stuft auf möglich, wenn niemand das Item bekommen hat", () => {
    const prev = frame([box(10)], [at("l", "Lena", 12)]);
    const next = frame([box(9)], [at("l", "Lena", 12)]);
    expect(detectTakes(prev, next)[0]).toMatchObject({ confidence: "möglich", suspects: ["Lena"] });
  });

  it("stuft auf wahrscheinlich, wenn der Besitzer auch etwas bekommen hat", () => {
    const prev = frame([box(10)], [at("l", "Lena", 12), at("m", "Max", 9)]);
    const next = frame([box(0), ...inv("l", 5), ...inv("m", 5)], [at("l", "Lena", 12), at("m", "Max", 9)]);
    expect(detectTakes(prev, next)[0]).toMatchObject({ confidence: "wahrscheinlich", suspects: ["Lena"] });
  });

  it("ignoriert Kisten, die nicht live gelesen wurden, und Besitzerwechsel", () => {
    const prev = frame([box(10)], [at("l", "Lena", 11)]);
    expect(detectTakes(prev, { ...frame([...inv("l", 10)], [at("l", "Lena", 11)]), containers: [] })).toEqual([]);
    expect(detectTakes(prev, frame([box(4, "lena"), ...inv("l", 6)], [at("l", "Lena", 11)]))).toEqual([]);
  });

  it("ignoriert Allgemein- und Projektkisten", () => {
    const common = { ...box(10), owner_type: "common" as const, owner_key: "allgemein" };
    const prev = frame([common], [at("l", "Lena", 11)]);
    const next = frame([{ ...common, count: 4 }, ...inv("l", 6)], [at("l", "Lena", 11)]);
    expect(detectTakes(prev, next)).toEqual([]);
  });
});
