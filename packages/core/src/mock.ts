import { containerId } from "./region.js";
import type { ContainerKind, ContainerSnapshot, ItemStack, PlayerSnapshot } from "./types.js";

/** Kleiner deterministischer Zufallsgenerator (mulberry32), damit Mock-Daten reproduzierbar sind. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MOCK_PLAYERS = ["Vale", "Max", "Lena", "Jonas", "Mia", "Paul", "Emma", "Leon", "Sophie", "Finn"];

const ITEMS: [id: string, maxStack: number][] = [
  ["minecraft:diamond", 64],
  ["minecraft:iron_ingot", 64],
  ["minecraft:gold_ingot", 64],
  ["minecraft:copper_ingot", 64],
  ["minecraft:netherite_ingot", 64],
  ["minecraft:emerald", 64],
  ["minecraft:redstone", 64],
  ["minecraft:lapis_lazuli", 64],
  ["minecraft:coal", 64],
  ["minecraft:stone_bricks", 64],
  ["minecraft:cobblestone", 64],
  ["minecraft:deepslate", 64],
  ["minecraft:oak_log", 64],
  ["minecraft:spruce_planks", 64],
  ["minecraft:glass", 64],
  ["minecraft:sand", 64],
  ["minecraft:quartz_block", 64],
  ["minecraft:obsidian", 64],
  ["minecraft:bread", 64],
  ["minecraft:cooked_beef", 64],
  ["minecraft:torch", 64],
  ["minecraft:arrow", 64],
  ["minecraft:ender_pearl", 16],
  ["minecraft:experience_bottle", 64],
  ["minecraft:diamond_pickaxe", 1],
  ["minecraft:elytra", 1],
];

const SHULKER = "minecraft:shulker_box";

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function randomStack(r: () => number): ItemStack {
  const [id, max] = pick(r, ITEMS);
  return { id, count: max === 1 ? 1 : 1 + Math.floor(r() * max) };
}

function randomItems(r: () => number, slots: number, fill: number): ItemStack[] {
  const items: ItemStack[] = [];
  for (let i = 0; i < slots; i++) if (r() < fill) items.push(randomStack(r));
  return items;
}

function shulkerWith(r: () => number): ItemStack {
  const content = randomItems(r, 27, 0.6).map((item, slot) => ({ slot, item }));
  return { id: SHULKER, count: 1, components: { "minecraft:container": content } };
}

interface ContainerSpec {
  name: string | null;
  kind: ContainerKind;
  x: number;
  y: number;
  z: number;
}

/** Kisten rund um eine Basis bei (0, 0) inklusive Tippfehlern und unbenannten Kisten. */
function containerSpecs(r: () => number): ContainerSpec[] {
  const names: (string | null)[] = [
    ...MOCK_PLAYERS.flatMap((p) => [p, p.toLowerCase()]),
    "Allgemein", "Allgemein", "allgemein", "ALLGEMEIN", "Allgemein",
    "Projekt Burg", "Projekt Burg", "projekt burg", "Projekt Hafen", "Projekt Hafen",
    "Projekt Bahnhof",
    "Allgmein", "Maxx", "Projektburg", "Lager",
    null, null, null, null,
  ];
  const kinds: ContainerKind[] = ["chest", "chest", "chest", "barrel", "shulker_box", "trapped_chest"];
  return names.map((name) => ({
    name,
    kind: pick(r, kinds),
    x: Math.floor(r() * 900) - 450,
    y: 60 + Math.floor(r() * 20),
    z: Math.floor(r() * 900) - 450,
  }));
}

export interface MockWorld {
  players: PlayerSnapshot[];
  containers: ContainerSnapshot[];
  tick(): void;
}

/** Erzeugt eine Fake-Welt mit 10 Spielern; `tick()` simuliert Spielaktivität. */
export function createMockWorld(seed = 26_3): MockWorld {
  const r = rng(seed);

  const players: PlayerSnapshot[] = MOCK_PLAYERS.map((name, i) => ({
    uuid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    online: r() < 0.4,
    inventory: [...randomItems(r, 36, 0.5), ...(r() < 0.3 ? [shulkerWith(r)] : [])],
    enderChest: [...randomItems(r, 27, 0.4), ...(r() < 0.5 ? [shulkerWith(r)] : [])],
  }));

  const containers: ContainerSnapshot[] = containerSpecs(r).map((s) => ({
    id: containerId("minecraft:overworld", s.x, s.y, s.z),
    dimension: "minecraft:overworld",
    x: s.x,
    y: s.y,
    z: s.z,
    kind: s.kind,
    customName: s.name,
    items: [...randomItems(r, 27, 0.7), ...(s.kind !== "shulker_box" && r() < 0.2 ? [shulkerWith(r)] : [])],
  }));

  function tick() {
    for (const p of players) {
      if (r() < 0.05) p.online = !p.online;
      if (!p.online) continue; // offline ändert sich nichts
      if (r() < 0.5) p.inventory.push(randomStack(r));
      if (r() < 0.3 && p.inventory.length) p.inventory.splice(Math.floor(r() * p.inventory.length), 1);
    }
    for (const c of containers) {
      if (r() > 0.1) continue;
      if (r() < 0.6 && c.items.length < 27) c.items.push(randomStack(r));
      else if (c.items.length) c.items.splice(Math.floor(r() * c.items.length), 1);
    }
  }

  return { players, containers, tick };
}
