/**
 * Englischer Biom-Name wie im Spiel (Sprache Englisch), aus der ID abgeleitet:
 * "minecraft:old_growth_pine_taiga" → "Old Growth Pine Taiga". Für alle Biome der Oberwelt
 * entspricht das genau dem Namen im Spiel.
 */
export function biomeName(id: string): string {
  const key = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return key
    .split("_")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}
