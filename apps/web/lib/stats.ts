import { itemLabel, totalDistance, type PlayerStats } from "@mc/core";
import { fmt } from "./items";
import { germanName } from "./itemicons";

/** Deutsche Namen für Kreaturen; der Rest kommt aus dem Namen des Spawn-Eis oder bleibt englisch. */
const MOBS: Record<string, string> = {
  zombie: "Zombie", skeleton: "Skelett", creeper: "Creeper", spider: "Spinne", cave_spider: "Höhlenspinne", enderman: "Enderman",
  witch: "Hexe", slime: "Schleim", drowned: "Ertrunkener", husk: "Wüstenzombie", stray: "Eiswanderer", phantom: "Phantom",
  pillager: "Plünderer", vindicator: "Diener", evoker: "Magier", ravager: "Verwüster", blaze: "Lohe", ghast: "Ghast",
  magma_cube: "Magmawürfel", piglin: "Piglin", zombified_piglin: "Zombifizierter Piglin", piglin_brute: "Piglin-Barbar",
  hoglin: "Hoglin", wither_skeleton: "Witherskelett", wither: "Wither", ender_dragon: "Enderdrache", warden: "Wärter",
  guardian: "Wächter", elder_guardian: "Großer Wächter", shulker: "Shulker", silverfish: "Silberfischchen", breeze: "Böe",
  bogged: "Sumpfskelett", cow: "Kuh", pig: "Schwein", sheep: "Schaf", chicken: "Huhn", rabbit: "Kaninchen", horse: "Pferd",
  villager: "Dorfbewohner", iron_golem: "Eisengolem", bee: "Biene", wolf: "Wolf", fox: "Fuchs", player: "Spieler",
  llama: "Lama", goat: "Ziege", polar_bear: "Eisbär", dolphin: "Delfin", cod: "Kabeljau", salmon: "Lachs", squid: "Tintenfisch",
};

export function mobName(id: string): string {
  const short = id.replace(/^minecraft:/, "");
  return MOBS[short] ?? germanName(`minecraft:${short}_spawn_egg`)?.replace(/-?Spawn-Ei$/i, "").trim() ?? itemLabel(id);
}

/** Spielzeit aus Ticks (20 je Sekunde). */
export function playTime(ticks: number): string {
  const h = ticks / 72_000;
  if (h >= 1) return `${fmt.format(Math.floor(h))} h ${Math.floor((h % 1) * 60)} min`;
  return `${Math.round(ticks / 1200)} min`;
}

/** Strecke aus Zentimetern, ab 10 km ohne Nachkomma. */
export function km(cm: number): string {
  const k = cm / 100_000;
  return `${k >= 10 ? fmt.format(Math.round(k)) : k.toLocaleString("de-DE", { maximumFractionDigits: 1 })} km`;
}

/** Schaden wird in Zehntel halber Herzen gezählt. */
export const hearts = (v: number) => `${fmt.format(Math.round(v / 20))} Herzen`;

/** Spalten der Vergleichstabelle und Kacheln der Rekorde. */
export interface Metric {
  id: string;
  label: string;
  value: (s: PlayerStats) => number;
  format: (n: number) => string;
}

export const METRICS: Metric[] = [
  { id: "play", label: "Spielzeit", value: (s) => s.custom.play_time ?? 0, format: playTime },
  { id: "deaths", label: "Tode", value: (s) => s.custom.deaths ?? 0, format: (n) => fmt.format(n) },
  { id: "mobs", label: "Mob-Kills", value: (s) => s.custom.mob_kills ?? 0, format: (n) => fmt.format(n) },
  { id: "pvp", label: "Spieler-Kills", value: (s) => s.custom.player_kills ?? 0, format: (n) => fmt.format(n) },
  { id: "mined", label: "Abgebaut", value: (s) => s.totals.mined, format: (n) => fmt.format(n) },
  { id: "distance", label: "Strecke", value: totalDistance, format: km },
  { id: "jumps", label: "Sprünge", value: (s) => s.custom.jump ?? 0, format: (n) => fmt.format(n) },
];
