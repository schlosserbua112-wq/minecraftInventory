import { deflateSync } from "node:zlib";
import type { NbtValue } from "./nbt.js";
import { eachRegionChunk } from "./regionfile.js";

/**
 * Draufsicht einer Region (512 × 512 Blöcke, 1 Pixel je Block) als PNG.
 * Je Spalte der oberste Block laut Heightmap MOTION_BLOCKING, eingefärbt nach Blocktyp,
 * mit Schattierung nach Höhenunterschied zum nördlichen Nachbarn (wie Karten im Spiel)
 * und dunklerem Wasser, je tiefer es ist. Nicht generierte Chunks bleiben durchsichtig.
 */

type Rgb = readonly [number, number, number];

/** Feste Farben für häufige Blöcke (ohne "minecraft:"). */
const EXACT: Record<string, Rgb> = {
  grass_block: [109, 153, 48], dirt: [134, 96, 67], coarse_dirt: [119, 85, 59], rooted_dirt: [144, 103, 76], podzol: [91, 63, 24],
  mycelium: [111, 99, 105], dirt_path: [148, 121, 65], farmland: [110, 75, 45], mud: [60, 57, 60], moss_block: [89, 109, 45],
  sand: [219, 207, 163], red_sand: [190, 102, 33], sandstone: [216, 203, 155], red_sandstone: [181, 98, 31], gravel: [131, 127, 126],
  clay: [160, 166, 179], stone: [125, 125, 125], cobblestone: [127, 127, 127], mossy_cobblestone: [110, 118, 94], deepslate: [80, 80, 82],
  granite: [149, 103, 85], diorite: [188, 188, 188], andesite: [136, 136, 136], tuff: [108, 109, 102], calcite: [223, 224, 220],
  dripstone_block: [134, 107, 92], bedrock: [85, 85, 85], obsidian: [20, 18, 30],
  water: [63, 118, 228], bubble_column: [63, 118, 228], lava: [207, 92, 20], ice: [145, 183, 253], packed_ice: [141, 180, 250],
  blue_ice: [116, 167, 253], snow: [249, 254, 254], snow_block: [249, 254, 254], powder_snow: [248, 253, 253],
  netherrack: [97, 38, 38], nether_wart_block: [114, 2, 2], warped_wart_block: [22, 119, 121], crimson_nylium: [130, 31, 31],
  warped_nylium: [43, 114, 101], soul_sand: [81, 62, 50], soul_soil: [75, 57, 46], basalt: [80, 81, 86], blackstone: [42, 36, 41],
  glowstone: [171, 131, 84], magma_block: [142, 63, 31], end_stone: [219, 222, 158], purpur_block: [169, 125, 169],
  terracotta: [152, 94, 67], white_terracotta: [209, 178, 161], orange_terracotta: [161, 83, 37], yellow_terracotta: [186, 133, 35],
  red_terracotta: [143, 61, 46], brown_terracotta: [77, 51, 35], light_gray_terracotta: [135, 107, 98],
  pumpkin: [198, 118, 24], melon: [111, 145, 30], hay_block: [166, 136, 38], cactus: [85, 127, 43], sugar_cane: [148, 192, 101],
  bamboo: [93, 144, 19], lily_pad: [32, 128, 48], kelp: [44, 107, 32], kelp_plant: [44, 107, 32], seagrass: [44, 107, 32],
  tall_seagrass: [44, 107, 32], sea_pickle: [90, 97, 39], bricks: [150, 97, 83], stone_bricks: [122, 121, 122],
  glass: [175, 213, 219], torch: [255, 200, 90], lantern: [255, 200, 90], chest: [162, 115, 45], barrel: [140, 104, 58],
  crafting_table: [120, 79, 47], furnace: [110, 110, 110], bookshelf: [117, 94, 59], white_wool: [234, 236, 237],
};

/** Regeln nach Namensteilen, in dieser Reihenfolge. */
const RULES: [RegExp, Rgb][] = [
  [/poplar_leaves\|red|red_poplar_leaves/, [170, 48, 36]], [/poplar_leaves\|yellow|yellow_poplar_leaves/, [214, 172, 42]],
  [/poplar_leaves/, [204, 102, 32]], [/leaf_litter/, [150, 98, 46]], [/^poplar_(log|wood)$/, [190, 180, 160]], [/^poplar_/, [214, 196, 160]],
  [/cherry_leaves/, [229, 173, 194]], [/azalea_leaves|flowering_azalea/, [92, 120, 45]],
  [/spruce_leaves/, [61, 99, 61]], [/birch_leaves/, [128, 167, 85]], [/_leaves$/, [60, 120, 30]],
  [/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry|pale_oak)_(log|wood)$/, [102, 81, 51]],
  [/^stripped_/, [160, 130, 80]], [/^(crimson|warped)_(stem|hyphae)$/, [92, 25, 29]],
  [/^spruce_/, [114, 84, 48]], [/^birch_/, [192, 175, 121]], [/^dark_oak_/, [66, 43, 20]], [/^jungle_/, [160, 115, 80]],
  [/^acacia_/, [168, 90, 50]], [/^mangrove_/, [117, 54, 48]], [/^cherry_/, [226, 178, 172]], [/^bamboo_/, [193, 173, 80]],
  [/^pale_oak_/, [230, 214, 210]], [/^oak_|_planks$|_door$|_trapdoor$|_fence/, [162, 130, 78]],
  [/^(white)_/, [234, 236, 237]], [/^orange_/, [240, 118, 19]], [/^magenta_/, [189, 68, 179]], [/^light_blue_/, [58, 175, 217]],
  [/^yellow_/, [248, 197, 39]], [/^lime_/, [112, 185, 25]], [/^pink_/, [237, 141, 172]], [/^gray_/, [62, 68, 71]],
  [/^light_gray_/, [142, 142, 134]], [/^cyan_/, [21, 137, 145]], [/^purple_/, [121, 42, 172]], [/^blue_/, [53, 57, 157]],
  [/^brown_/, [114, 71, 40]], [/^green_/, [84, 109, 27]], [/^red_/, [160, 39, 34]], [/^black_/, [20, 21, 25]],
  [/deepslate/, [80, 80, 82]], [/copper/, [192, 107, 79]], [/prismarine/, [99, 156, 151]], [/quartz/, [235, 229, 222]],
  [/nether_brick/, [44, 21, 26]], [/blackstone/, [42, 36, 41]], [/sandstone/, [216, 203, 155]], [/_ore$/, [125, 125, 125]],
  [/stone|brick|andesite|diorite|granite|tuff|slab|stairs|wall/, [125, 125, 125]], [/coral/, [200, 90, 120]],
  [/mushroom/, [150, 110, 90]], [/snow/, [249, 254, 254]], [/ice/, [145, 183, 253]], [/vine|fern|bush|grass|moss|sapling|propagule/, [89, 125, 39]],
  [/glass/, [175, 213, 219]], [/iron/, [200, 200, 200]], [/gold/, [246, 208, 61]], [/rail/, [140, 120, 100]],
];

const FALLBACK: Rgb = [128, 128, 128];
const colorCache = new Map<string, Rgb>();

export function blockColor(name: string): Rgb {
  const id = name.startsWith("minecraft:") ? name.slice(10) : name;
  let c = colorCache.get(id);
  if (!c) {
    c = EXACT[id] ?? RULES.find(([re]) => re.test(id))?.[1] ?? FALLBACK;
    colorCache.set(id, c);
  }
  return c;
}

/** Biom-Zelle ohne Daten (Chunk nicht generiert). */
export const NO_BIOME = 255;

/** Block an (x, y, z) innerhalb eines entpackten Abschnitts */
function blockAt(s: { palette: string[]; idx: Uint16Array | null }, x: number, y: number, z: number): string {
  return s.palette.length ? s.palette[s.idx ? s.idx[((y & 15) * 16 + z) * 16 + x]! : 0] ?? "minecraft:air" : "minecraft:air";
}

/**
 * Gras, Laub und Wasser färbt Minecraft je Biom ein (Farbtabellen im Spiel). Werte wie im Spiel,
 * ohne "minecraft:"; fehlt ein Biom, gilt die Ebene.
 */
const GRASS: Record<string, number> = {
  plains: 0x91bd59, sunflower_plains: 0x91bd59, meadow: 0x83bb6d, cherry_grove: 0xb6db61, forest: 0x79c05a, flower_forest: 0x79c05a,
  birch_forest: 0x88bb67, old_growth_birch_forest: 0x88bb67, dark_forest: 0x507a32, pale_garden: 0x778272, taiga: 0x86b783,
  old_growth_pine_taiga: 0x86b87f, old_growth_spruce_taiga: 0x86b783, snowy_taiga: 0x80b497, snowy_plains: 0x80b497,
  ice_spikes: 0x80b497, grove: 0x80b497, snowy_slopes: 0x80b497, frozen_peaks: 0x80b497, jagged_peaks: 0x80b497,
  snowy_beach: 0x80b497, frozen_river: 0x80b497, frozen_ocean: 0x80b497, deep_frozen_ocean: 0x80b497, stony_peaks: 0x9abe4b,
  windswept_hills: 0x8ab689, windswept_gravelly_hills: 0x8ab689, windswept_forest: 0x8ab689, stony_shore: 0x8ab689,
  swamp: 0x6a7039, mangrove_swamp: 0x6a7039, jungle: 0x59c93c, bamboo_jungle: 0x59c93c, sparse_jungle: 0x64c73f,
  desert: 0xbfb755, savanna: 0xbfb755, savanna_plateau: 0xbfb755, windswept_savanna: 0xbfb755, badlands: 0x90814d,
  eroded_badlands: 0x90814d, wooded_badlands: 0x90814d, mushroom_fields: 0x55c93f, beach: 0x91bd59, river: 0x8eb971,
  ocean: 0x8eb971, deep_ocean: 0x8eb971, lukewarm_ocean: 0x8eb971, deep_lukewarm_ocean: 0x8eb971, warm_ocean: 0x8eb971,
  cold_ocean: 0x8eb971, deep_cold_ocean: 0x8eb971,
};
const FOLIAGE: Record<string, number> = {
  plains: 0x77ab2f, sunflower_plains: 0x77ab2f, meadow: 0x63a948, cherry_grove: 0xb6db61, forest: 0x59ae30, flower_forest: 0x59ae30,
  birch_forest: 0x6ba941, old_growth_birch_forest: 0x6ba941, dark_forest: 0x59ae30, pale_garden: 0x878d76, taiga: 0x68a464,
  old_growth_pine_taiga: 0x68a55f, old_growth_spruce_taiga: 0x68a464, snowy_taiga: 0x60a17b, snowy_plains: 0x60a17b,
  ice_spikes: 0x60a17b, grove: 0x60a17b, snowy_slopes: 0x60a17b, frozen_peaks: 0x60a17b, jagged_peaks: 0x60a17b,
  snowy_beach: 0x60a17b, frozen_river: 0x60a17b, frozen_ocean: 0x60a17b, stony_peaks: 0x82ac1e, windswept_hills: 0x6da36b,
  windswept_gravelly_hills: 0x6da36b, windswept_forest: 0x6da36b, stony_shore: 0x6da36b, swamp: 0x6a7039, mangrove_swamp: 0x8db127,
  jungle: 0x30bb0b, bamboo_jungle: 0x30bb0b, sparse_jungle: 0x3eb80f, desert: 0xaea42a, savanna: 0xaea42a, savanna_plateau: 0xaea42a,
  windswept_savanna: 0xaea42a, badlands: 0x9e814d, eroded_badlands: 0x9e814d, wooded_badlands: 0x9e814d, mushroom_fields: 0x2bbb0f,
  beach: 0x77ab2f, river: 0x71a74d, ocean: 0x71a74d,
  // Laub in Dappled Forest ist im Spiel rot
  dappled_forest: 0xc0482c,
};
const WATER: Record<string, number> = {
  swamp: 0x617b64, mangrove_swamp: 0x3a7a6a, warm_ocean: 0x43d5ee, lukewarm_ocean: 0x45adf2, deep_lukewarm_ocean: 0x45adf2,
  dappled_forest: 0x1f2b2e, cold_ocean: 0x3d57d6, deep_cold_ocean: 0x3d57d6, frozen_ocean: 0x3938c9, deep_frozen_ocean: 0x3938c9, frozen_river: 0x3938c9,
};
/** Laub mit eigener, nicht eingefärbter Farbe (Fichte und Birke haben im Spiel feste Farben) */
const FIXED_LEAVES = /^(spruce|birch|cherry|azalea|flowering_azalea|pale_oak)_leaves$|poplar_leaves/;
const tintCache = new Map<string, Rgb>();
const rgbOf = (v: number, f: number): Rgb => [Math.round(((v >> 16) & 255) * f), Math.round(((v >> 8) & 255) * f), Math.round((v & 255) * f)];

/** Blockfarbe mit Biom-Färbung für Gras, Laub, Ranken und Wasser */
export function tintedColor(name: string, biome: string | undefined): Rgb {
  const id = name.startsWith("minecraft:") ? name.slice(10) : name;
  const b = biome?.startsWith("minecraft:") ? biome.slice(10) : biome ?? "plains";
  let kind: "grass" | "foliage" | "water" | null = null;
  if (id === "grass_block" || id === "short_grass" || id === "tall_grass" || id === "fern" || id === "large_fern") kind = "grass";
  else if ((id.endsWith("_leaves") && !FIXED_LEAVES.test(id)) || id === "vine") kind = "foliage";
  else if (id === "water" || id === "bubble_column") kind = "water";
  if (!kind) return blockColor(name);
  const key = `${kind}|${b}`;
  let c = tintCache.get(key);
  if (!c) {
    // Gras und Laub etwas abdunkeln, damit sie zu den übrigen Kartenfarben passen
    c = kind === "grass" ? rgbOf(GRASS[b] ?? GRASS.plains!, 0.78) : kind === "foliage" ? rgbOf(FOLIAGE[b] ?? FOLIAGE.plains!, 0.8) : WATER[b] ? rgbOf(WATER[b]!, 1) : blockColor(name);
    tintCache.set(key, c);
  }
  return c;
}

const isWater = (name: string) => /water|bubble_column|kelp|seagrass|sea_pickle/.test(name);

/** Gepackte Werte aus einem Long-Array (Einträge überspannen keine Long-Grenzen, ab 1.16). */
function unpack(data: BigInt64Array, bits: number, count: number): Uint16Array {
  const out = new Uint16Array(count);
  const perLong = Math.floor(64 / bits);
  const mask = (1n << BigInt(bits)) - 1n;
  const b = BigInt(bits);
  for (let i = 0, li = 0; li < data.length && i < count; li++) {
    let v = BigInt.asUintN(64, data[li]!);
    for (let j = 0; j < perLong && i < count; j++, i++) {
      out[i] = Number(v & mask);
      v >>= b;
    }
  }
  return out;
}

/**
 * Palette-Eintrag: bis 1.21 `{Name, Properties}`; in 26.x eine Liste von Strings oder,
 * gemischt, `{"": "minecraft:stone"}` bzw. `{id, properties}`.
 */
function paletteName(e: NbtValue): string {
  if (typeof e === "string") return e;
  const o = e as Record<string, NbtValue>;
  const name = String(o.Name ?? o.id ?? o[""] ?? "minecraft:air");
  // Pappellaub (Dappled Forest, 26.3) gibt es rot, orange und gelb; die Farbe steht in den Eigenschaften
  if (name.includes("poplar_leaves")) {
    const props = (o.Properties ?? o.properties) as Record<string, NbtValue> | undefined;
    const color = props && Object.values(props).find((v) => typeof v === "string" && /^(red|orange|yellow)$/.test(v));
    if (color) return `${name}|${color}`;
  }
  return name;
}

/** Heightmap: 256 Werte, Bitbreite ergibt sich aus der Länge (z. B. 37 Longs → 9 Bit). */
function heightmap(v: NbtValue | undefined): Uint16Array | null {
  if (!(v instanceof BigInt64Array) || !v.length) return null;
  const perLong = Math.ceil(256 / v.length);
  return unpack(v, Math.floor(64 / perLong), 256);
}

export interface RegionMap {
  /** PNG 512 × 512, oder null, wenn die Region keine fertigen Chunks hat. */
  png: Buffer | null;
  chunks: number;
  /**
   * Biom an der Oberfläche je 4 × 4 Blöcke (so speichert Minecraft Biome): 128 × 128 Zellen,
   * Wert = Index in `palette`, 255 = nicht generiert.
   */
  biomes: { palette: string[]; cells: Uint8Array };
}

/** Rendert eine Region-Datei. Hält nur Höhen und Farben der Region im Speicher (~1,5 MB). */
export function renderRegionMap(buf: Buffer, onError?: (index: number, err: unknown) => void): RegionMap {
  const N = 512;
  const height = new Int16Array(N * N).fill(-32768);
  const depth = new Uint8Array(N * N);
  const rgb = new Uint8Array(N * N * 3);
  const biomePalette: string[] = [];
  const biomeIds = new Map<string, number>();
  const biomeCells = new Uint8Array(128 * 128).fill(NO_BIOME);
  let chunks = 0;

  for (const chunk of eachRegionChunk(buf, onError, ["xPos", "zPos", "yPos", "Status", "Heightmaps", "sections"], true)) {
    const status = String(chunk.Status ?? "");
    if (status && !/full|minecraft:full/.test(status)) continue;
    const hm = chunk.Heightmaps as Record<string, NbtValue> | undefined;
    const top = heightmap(hm?.MOTION_BLOCKING) ?? heightmap(hm?.WORLD_SURFACE);
    if (!top) continue;
    const floor = heightmap(hm?.OCEAN_FLOOR);
    const surface = heightmap(hm?.WORLD_SURFACE);
    const minY = Number(chunk.yPos ?? -4) * 16;
    const cx = ((Number(chunk.xPos) % 32) + 32) % 32;
    const cz = ((Number(chunk.zPos) % 32) + 32) % 32;

    // Abschnitte nur bei Bedarf entpacken
    const sections = new Map<number, { palette: string[]; idx: Uint16Array | null }>();
    const raw = new Map<number, Record<string, NbtValue>>();
    for (const s of (chunk.sections as Record<string, NbtValue>[] | undefined) ?? []) raw.set(Number(s.Y), s);
    const biomeSections = new Map<number, { palette: string[]; idx: Uint16Array | null }>();
    const biomeSection = (sy: number) => {
      let s = biomeSections.get(sy);
      if (s) return s;
      const b = raw.get(sy)?.biomes as Record<string, NbtValue> | undefined;
      const palette = ((b?.palette as NbtValue[] | undefined) ?? []).map(paletteName);
      let idx: Uint16Array | null = null;
      if (palette.length > 1 && b?.data instanceof BigInt64Array) idx = unpack(b.data, Math.ceil(Math.log2(palette.length)), 64);
      s = { palette, idx };
      biomeSections.set(sy, s);
      return s;
    };
    const section = (sy: number) => {
      let s = sections.get(sy);
      if (s) return s;
      const bs = raw.get(sy)?.block_states as Record<string, NbtValue> | undefined;
      const palette = ((bs?.palette as NbtValue[] | undefined) ?? []).map(paletteName);
      let idx: Uint16Array | null = null;
      if (palette.length > 1 && bs?.data instanceof BigInt64Array) idx = unpack(bs.data, Math.max(4, Math.ceil(Math.log2(palette.length))), 4096);
      s = { palette, idx };
      sections.set(sy, s);
      return s;
    };

    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const i = z * 16 + x;
        const h = top[i]!;
        if (h === 0) continue;
        const y = minY + h - 1;
        const s = section(Math.floor(y / 16));
        const name = blockAt(s, x, y, z);
        const p = (cz * 16 + z) * N + cx * 16 + x;
        height[p] = y;
        const b = biomeSection(Math.floor(y / 16));
        const biome = b.palette.length ? b.palette[b.idx ? b.idx[((y & 15) >> 2) * 16 + (z >> 2) * 4 + (x >> 2)]! : 0] : undefined;
        // Schneedecke liegt nicht in MOTION_BLOCKING (keine Kollision), steht aber in WORLD_SURFACE
        let shown = name;
        const w = surface?.[i] ?? 0;
        if (w > h) {
          const wy = minY + w - 1;
          if (/^(minecraft:)?snow$/.test(blockAt(section(Math.floor(wy / 16)), x, wy, z))) shown = "minecraft:snow";
        }
        const c = tintedColor(shown, biome);
        rgb[p * 3] = c[0]; rgb[p * 3 + 1] = c[1]; rgb[p * 3 + 2] = c[2];
        if (floor && isWater(name)) depth[p] = Math.min(255, Math.max(1, h - floor[i]!));
        // Biom der 4 × 4-Zelle an der Oberfläche, gemessen an einer Spalte nahe der Zellmitte
        if (biome && (x & 3) === 1 && (z & 3) === 1) {
          let id = biomeIds.get(biome);
          if (id === undefined && biomePalette.length < NO_BIOME) {
            id = biomePalette.push(biome) - 1;
            biomeIds.set(biome, id);
          }
          if (id !== undefined) biomeCells[(cz * 4 + (z >> 2)) * 128 + cx * 4 + (x >> 2)] = id;
        }
      }
    }
    chunks++;
  }
  const biomes = { palette: biomePalette, cells: biomeCells };
  if (!chunks) return { png: null, chunks, biomes };

  const rgba = Buffer.alloc(N * N * 4);
  for (let p = 0; p < N * N; p++) {
    if (height[p] === -32768) continue; // durchsichtig
    let f: number;
    if (depth[p]) {
      // Wasser: je tiefer, desto dunkler, leichtes Muster wie auf Karten im Spiel
      const d = depth[p]!;
      f = d < 3 ? 1.08 : d < 6 ? 1 : d < 12 ? 0.9 : 0.8;
    } else {
      const north = p >= N && height[p - N] !== -32768 ? height[p - N]! : height[p]!;
      const diff = height[p]! - north;
      f = diff > 0 ? 1.12 : diff < 0 ? 0.82 : 1;
    }
    rgba[p * 4] = Math.min(255, rgb[p * 3]! * f);
    rgba[p * 4 + 1] = Math.min(255, rgb[p * 3 + 1]! * f);
    rgba[p * 4 + 2] = Math.min(255, rgb[p * 3 + 2]! * f);
    rgba[p * 4 + 3] = 255;
  }
  return { png: encodePng(rgba, N, N), chunks, biomes };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Minimaler PNG-Encoder (RGBA, 8 Bit, ohne Filter). */
export function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
