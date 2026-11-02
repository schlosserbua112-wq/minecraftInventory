import { biomeName } from "./biomenames.js";
import { NO_BIOME } from "./map.js";

/**
 * Biom-Ebene der Weltkarte. Der Sammler sammelt beim Zeichnen je Region die Oberflächen-Biome
 * (4 × 4 Blöcke je Zelle), `BiomeAtlas.build()` glättet sie über alle Regionen hinweg und liefert
 * Grenzlinien und ein Namensschild je zusammenhängender Biomfläche.
 */

/** Schmale Biome, die keine eigene Fläche bilden, sondern den Nachbarn zugeschlagen werden. */
const FOLD = new Set(["minecraft:river", "minecraft:frozen_river", "minecraft:beach", "minecraft:snowy_beach"]);

export interface BiomeLabel {
  /** Biom-ID, z. B. "minecraft:plains" */
  id: string;
  name: string;
  /** Blockkoordinaten des Schilds (möglichst weit innen in der Fläche) */
  x: number;
  z: number;
  /** Fläche in Blöcken² */
  area: number;
}

export interface BiomeLayer {
  updated_at: string | null;
  /** Grenzlinien als flache Liste [x0, z0, x1, z1, …] in Blockkoordinaten */
  lines: number[][];
  labels: BiomeLabel[];
}

const S = 128; // Zellen je Region und Achse
const CELL = 4; // Blöcke je Zelle

export class BiomeAtlas {
  private names: string[] = [];
  private ids = new Map<string, number>();
  private regions = new Map<string, { rx: number; rz: number; cells: Uint8Array }>();

  /** Biome einer Region aus `renderRegionMap(...).biomes` übernehmen. */
  add(rx: number, rz: number, biomes: { palette: string[]; cells: Uint8Array }) {
    const map = biomes.palette.map((name) => {
      let id = this.ids.get(name);
      if (id === undefined && this.names.length < NO_BIOME) {
        id = this.names.push(name) - 1;
        this.ids.set(name, id);
      }
      return id ?? NO_BIOME;
    });
    const cells = new Uint8Array(S * S);
    for (let i = 0; i < cells.length; i++) cells[i] = biomes.cells[i] === NO_BIOME ? NO_BIOME : map[biomes.cells[i]!]!;
    this.regions.set(`${rx},${rz}`, { rx, rz, cells });
  }

  get size() {
    return this.regions.size;
  }

  build(opts: { minLabelArea?: number; minArea?: number } = {}): BiomeLayer {
    const minLabelCells = Math.ceil((opts.minLabelArea ?? 32 * 32) / (CELL * CELL));
    const minCells = Math.ceil((opts.minArea ?? 16 * 16) / (CELL * CELL));
    const list = [...this.regions.values()];
    const R = list.length;
    const out: BiomeLayer = { updated_at: new Date().toISOString(), lines: [], labels: [] };
    if (!R) return out;

    // Zellen aller Regionen in einem Feld, Region r belegt [r*S*S, (r+1)*S*S)
    let grid = new Uint8Array(R * S * S);
    list.forEach((reg, r) => grid.set(reg.cells, r * S * S));
    const indexOf = new Map(list.map((reg, r) => [`${reg.rx},${reg.rz}`, r]));
    // Nachbarregion je Richtung: 0 Osten, 1 Westen, 2 Süden, 3 Norden
    const nb = new Int32Array(R * 4).fill(-1);
    list.forEach((reg, r) => {
      nb[r * 4] = indexOf.get(`${reg.rx + 1},${reg.rz}`) ?? -1;
      nb[r * 4 + 1] = indexOf.get(`${reg.rx - 1},${reg.rz}`) ?? -1;
      nb[r * 4 + 2] = indexOf.get(`${reg.rx},${reg.rz + 1}`) ?? -1;
      nb[r * 4 + 3] = indexOf.get(`${reg.rx},${reg.rz - 1}`) ?? -1;
    });
    /** Nachbarzelle in Richtung d (wie oben), -1 außerhalb der bekannten Welt */
    const step = (c: number, d: number): number => {
      const r = (c / (S * S)) | 0;
      const l = c - r * S * S;
      const x = l % S;
      const z = (l / S) | 0;
      if (d === 0) return x < S - 1 ? c + 1 : nb[r * 4] < 0 ? -1 : nb[r * 4]! * S * S + z * S;
      if (d === 1) return x > 0 ? c - 1 : nb[r * 4 + 1] < 0 ? -1 : nb[r * 4 + 1]! * S * S + z * S + S - 1;
      if (d === 2) return z < S - 1 ? c + S : nb[r * 4 + 2] < 0 ? -1 : nb[r * 4 + 2]! * S * S + x;
      return z > 0 ? c - S : nb[r * 4 + 3] < 0 ? -1 : nb[r * 4 + 3]! * S * S + (S - 1) * S + x;
    };
    const at = (g: Uint8Array, c: number) => (c < 0 ? NO_BIOME : g[c]!);
    /** Die 8 Nachbarn (auch diagonal) */
    const around = (c: number, f: (n: number) => void) => {
      const e = step(c, 0), w = step(c, 1);
      f(e), f(w), f(step(c, 2)), f(step(c, 3));
      if (e >= 0) f(step(e, 2)), f(step(e, 3));
      if (w >= 0) f(step(w, 2)), f(step(w, 3));
    };

    const fold = new Uint8Array(256);
    this.names.forEach((n, i) => (fold[i] = FOLD.has(n) ? 1 : 0));
    const counts = new Uint16Array(256);
    const touched: number[] = [];
    const count = (v: number) => {
      if (v === NO_BIOME || fold[v]) return;
      if (!counts[v]) touched.push(v);
      counts[v]++;
    };
    const countAt = (n: number) => count(at(grid, n));
    /** Ein Durchgang Mehrheitsfilter (3 × 3). Schmale Biome zählen nicht mit und werden ersetzt. */
    const pass = (onlyFold: boolean) => {
      const next = grid.slice();
      let changed = 0;
      for (let c = 0; c < grid.length; c++) {
        const own = grid[c]!;
        if (own === NO_BIOME || (onlyFold && !fold[own])) continue;
        touched.length = 0;
        count(own);
        around(c, countAt);
        let best = own, bestN = fold[own] ? 0 : counts[own]!;
        for (const v of touched) if (counts[v]! > bestN) (best = v), (bestN = counts[v]!);
        for (const v of touched) counts[v] = 0;
        if (best !== own) (next[c] = best), changed++;
      }
      grid = next;
      return changed;
    };
    for (let i = 0; i < 6 && pass(true); i++);
    pass(false);
    pass(false);

    // Zusammenhängende Flächen (4er-Nachbarschaft)
    const comp = new Int32Array(grid.length);
    const queue = new Int32Array(grid.length);
    const components = () => {
      comp.fill(-1);
      const sizes: number[] = [];
      for (let c = 0; c < grid.length; c++) {
        if (comp[c] !== -1 || grid[c] === NO_BIOME) continue;
        const id = sizes.length, v = grid[c]!;
        let head = 0, tail = 0;
        queue[tail++] = c;
        comp[c] = id;
        while (head < tail) {
          const cur = queue[head++]!;
          for (let d = 0; d < 4; d++) {
            const n = step(cur, d);
            if (n >= 0 && comp[n] === -1 && grid[n] === v) (comp[n] = id), (queue[tail++] = n);
          }
        }
        sizes.push(tail);
      }
      return sizes;
    };
    // Kleine Inseln dem häufigsten Nachbarbiom zuschlagen
    let sizes = components();
    for (let round = 0; round < 3; round++) {
      let changed = 0;
      for (let c = 0; c < grid.length; c++) {
        if (comp[c] === -1 || sizes[comp[c]!]! >= minCells) continue;
        touched.length = 0;
        for (let d = 0; d < 4; d++) {
          const n = step(c, d);
          if (n < 0 || comp[n] === comp[c] || grid[n] === NO_BIOME) continue;
          const v = grid[n]!;
          if (!counts[v]) touched.push(v);
          counts[v]++;
        }
        let best = -1, bestN = 0;
        for (const v of touched) if (counts[v]! > bestN) (best = v), (bestN = counts[v]!);
        for (const v of touched) counts[v] = 0;
        if (best >= 0) (grid[c] = best), changed++;
      }
      sizes = components();
      if (!changed) break;
    }

    // Abstand zum Rand der Fläche (für die Lage der Schilder)
    const dist = new Uint16Array(grid.length);
    let head = 0, tail = 0;
    for (let c = 0; c < grid.length; c++) {
      if (grid[c] === NO_BIOME) continue;
      for (let d = 0; d < 4; d++) {
        const n = step(c, d);
        if (n < 0 || grid[n] !== grid[c]) {
          dist[c] = 1;
          queue[tail++] = c;
          break;
        }
      }
    }
    while (head < tail) {
      const cur = queue[head++]!;
      for (let d = 0; d < 4; d++) {
        const n = step(cur, d);
        if (n >= 0 && !dist[n] && grid[n] === grid[cur]) (dist[n] = dist[cur]! + 1), (queue[tail++] = n);
      }
    }
    const best = new Int32Array(sizes.length).fill(-1);
    for (let c = 0; c < grid.length; c++) {
      const id = comp[c]!;
      if (id >= 0 && (best[id] === -1 || dist[c]! > dist[best[id]!]!)) best[id] = c;
    }
    const worldOf = (c: number) => {
      const r = (c / (S * S)) | 0;
      const l = c - r * S * S;
      return { gx: list[r]!.rx * S + (l % S), gz: list[r]!.rz * S + ((l / S) | 0) };
    };
    sizes.forEach((size, id) => {
      if (size < minLabelCells || best[id]! < 0) return;
      const c = best[id]!;
      const { gx, gz } = worldOf(c);
      const biome = this.names[grid[c]!]!;
      out.labels.push({ id: biome, name: biomeName(biome), x: gx * CELL + CELL / 2, z: gz * CELL + CELL / 2, area: size * CELL * CELL });
    });
    out.labels.sort((a, b) => b.area - a.area);

    // Grenzkanten zwischen Zellen, als Graph über die Gitterpunkte
    const OFF = 2 ** 23;
    const key = (x: number, z: number) => (x + OFF) * 2 ** 24 + (z + OFF);
    const adj = new Map<number, number[]>();
    const link = (a: number, b: number) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    };
    for (let c = 0; c < grid.length; c++) {
      if (grid[c] === NO_BIOME) continue;
      const { gx, gz } = worldOf(c);
      const e = step(c, 0);
      if (e >= 0 && grid[e] !== NO_BIOME && grid[e] !== grid[c]) link(key(gx + 1, gz), key(gx + 1, gz + 1));
      const s = step(c, 2);
      if (s >= 0 && grid[s] !== NO_BIOME && grid[s] !== grid[c]) link(key(gx, gz + 1), key(gx + 1, gz + 1));
    }
    const degree = new Map<number, number>();
    for (const [v, ns] of adj) degree.set(v, ns.length);
    const take = (v: number) => {
      const ns = adj.get(v)!;
      const n = ns.pop()!;
      const back = adj.get(n)!;
      back.splice(back.indexOf(v), 1);
      return n;
    };
    const walk = (start: number) => {
      const pts = [start];
      let cur = start;
      do {
        cur = take(cur);
        pts.push(cur);
      } while (degree.get(cur) === 2 && adj.get(cur)!.length && cur !== start);
      const flat: number[] = [];
      for (const p of simplify(pts.map((k) => [Math.floor(k / 2 ** 24) - OFF, (k % 2 ** 24) - OFF] as const), 1.2)) flat.push(p[0] * CELL, p[1] * CELL);
      out.lines.push(flat);
    };
    // Erst Linien zwischen Kreuzungen und Enden, dann geschlossene Ringe
    for (const [v, d] of degree) if (d !== 2) while (adj.get(v)!.length) walk(v);
    for (const [v, ns] of adj) while (ns.length) walk(v);
    return out;
  }
}

/** Douglas-Peucker: Treppenstufen des Gitters zu glatten Linien, Endpunkte bleiben. */
function simplify(pts: (readonly [number, number])[], tol: number): (readonly [number, number])[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, az] = pts[a]!, [bx, bz] = pts[b]!;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    let far = -1, farD = tol;
    for (let i = a + 1; i < b; i++) {
      const [px, pz] = pts[i]!;
      const d = len ? Math.abs(dx * (az - pz) - dz * (ax - px)) / len : Math.hypot(px - ax, pz - az);
      if (d > farD) (far = i), (farD = d);
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
