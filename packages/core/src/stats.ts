/**
 * Spielerstatistiken aus `<welt>/stats/<uuid>.json` (bzw. `players/stats` ab 26.3).
 * Die Datei ist groß (jedes je abgebaute, benutzte, aufgehobene Item); gespeichert wird nur eine Zusammenfassung.
 */

/** Wege, die Minecraft getrennt zählt, in Zentimetern. */
export const DISTANCE_KEYS = {
  walk: ["walk_one_cm", "crouch_one_cm", "walk_on_water_one_cm", "walk_under_water_one_cm", "climb_one_cm"],
  sprint: ["sprint_one_cm"],
  swim: ["swim_one_cm"],
  fly: ["fly_one_cm", "aviate_one_cm"],
  ride: ["boat_one_cm", "horse_one_cm", "minecart_one_cm", "pig_one_cm", "strider_one_cm", "happy_ghast_one_cm", "nautilus_one_cm"],
  fall: ["fall_one_cm"],
} as const;
export type DistanceKind = keyof typeof DISTANCE_KEYS;

/** Zähler aus `minecraft:custom`, die direkt übernommen werden (Schlüssel ohne "minecraft:"). */
export const CUSTOM_KEYS = [
  "play_time",
  "deaths",
  "mob_kills",
  "player_kills",
  "jump",
  "damage_dealt",
  "damage_taken",
  "fish_caught",
  "animals_bred",
  "traded_with_villager",
  "enchant_item",
  "sleep_in_bed",
  "leave_game",
  "time_since_death",
  "open_chest",
  "eat_cake_slice",
  "raid_win",
] as const;
export type CustomKey = (typeof CUSTOM_KEYS)[number];

/** Wie viele Einträge je Rangliste (abgebaut, getötet …) gespeichert werden. */
const TOP = 10;

export type Ranked = [id: string, count: number][];

export interface PlayerStats {
  custom: Partial<Record<CustomKey, number>>;
  /** Strecke je Art in Zentimetern. */
  distance: Record<DistanceKind, number>;
  totals: { mined: number; crafted: number; used: number; broken: number; picked_up: number; dropped: number; killed: number };
  top: { mined: Ranked; crafted: Ranked; used: Ranked; killed: Ranked; killed_by: Ranked };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function group(stats: Record<string, unknown>, key: string): Record<string, number> {
  const g = stats[`minecraft:${key}`] ?? stats[key];
  if (!g || typeof g !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(g as Record<string, unknown>)) {
    const n = num(v);
    if (n > 0) out[k.includes(":") ? k : `minecraft:${k}`] = n;
  }
  return out;
}

const sum = (g: Record<string, number>) => Object.values(g).reduce((a, b) => a + b, 0);
const top = (g: Record<string, number>, n = TOP): Ranked =>
  Object.entries(g)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);

/** Fasst den Inhalt einer Stats-Datei zusammen. `null`, wenn es keine gültige Stats-Datei ist. */
export function summarizeStats(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== "object") return null;
  const stats = (raw as { stats?: unknown }).stats;
  if (!stats || typeof stats !== "object") return null;
  const s = stats as Record<string, unknown>;

  const customRaw = group(s, "custom");
  const c = (k: string) => customRaw[`minecraft:${k}`] ?? 0;
  const custom: PlayerStats["custom"] = {};
  for (const k of CUSTOM_KEYS) if (c(k)) custom[k] = c(k);

  const distance = Object.fromEntries(
    Object.entries(DISTANCE_KEYS).map(([kind, keys]) => [kind, keys.reduce((n, k) => n + c(k), 0)]),
  ) as Record<DistanceKind, number>;

  const mined = group(s, "mined");
  const crafted = group(s, "crafted");
  const used = group(s, "used");
  const killed = group(s, "killed");
  const killedBy = group(s, "killed_by");
  return {
    custom,
    distance,
    totals: {
      mined: sum(mined),
      crafted: sum(crafted),
      used: sum(used),
      broken: sum(group(s, "broken")),
      picked_up: sum(group(s, "picked_up")),
      dropped: sum(group(s, "dropped")),
      killed: sum(killed),
    },
    top: { mined: top(mined), crafted: top(crafted), used: top(used), killed: top(killed), killed_by: top(killedBy, 5) },
  };
}

/** Gesamte Strecke ohne Fallen, in Zentimetern. */
export function totalDistance(s: PlayerStats): number {
  return s.distance.walk + s.distance.sprint + s.distance.swim + s.distance.fly + s.distance.ride;
}
