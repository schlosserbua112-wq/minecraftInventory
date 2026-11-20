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

/** Deutsche Biom-Namen wie im Spiel (Sprachdatei de_de, „biome.minecraft.*“). */
const DE: Record<string, string> = {
  badlands: "Tafelberge",
  bamboo_jungle: "Bambusdschungel",
  basalt_deltas: "Basaltdeltas",
  beach: "Strand",
  birch_forest: "Birkenwald",
  cherry_grove: "Kirschberghain",
  cold_ocean: "Kalter Ozean",
  crimson_forest: "Karmesinwald",
  dappled_forest: "Rotlaubwald",
  dark_forest: "Dunkler Wald",
  deep_cold_ocean: "Kalte Tiefsee",
  deep_dark: "Tiefes Dunkel",
  deep_frozen_ocean: "Vereiste Tiefsee",
  deep_lukewarm_ocean: "Lauwarme Tiefsee",
  deep_ocean: "Tiefsee",
  desert: "Wüste",
  dripstone_caves: "Tropfsteinhöhlen",
  end_barrens: "End-Kargland",
  end_highlands: "End-Hochland",
  end_midlands: "End-Mittelland",
  eroded_badlands: "Abgetragene Tafelberge",
  flower_forest: "Blumenwald",
  forest: "Wald",
  frozen_ocean: "Vereister Ozean",
  frozen_peaks: "Vereiste Gipfel",
  frozen_river: "Vereister Fluss",
  grove: "Berghain",
  ice_spikes: "Eiszapfentundra",
  jagged_peaks: "Zerklüftete Gipfel",
  jungle: "Dschungel",
  lukewarm_ocean: "Lauwarmer Ozean",
  lush_caves: "Üppige Höhlen",
  mangrove_swamp: "Mangrovensumpf",
  meadow: "Alm",
  mushroom_fields: "Pilzland",
  nether_wastes: "Nether-Ödland",
  ocean: "Ozean",
  old_growth_birch_forest: "Birken-Urwald",
  old_growth_pine_taiga: "Kiefern-Urtaiga",
  old_growth_spruce_taiga: "Fichten-Urtaiga",
  pale_garden: "Blasser Garten",
  plains: "Ebene",
  river: "Fluss",
  savanna: "Savanne",
  savanna_plateau: "Savannenhochebene",
  small_end_islands: "Kleine Endinseln",
  snowy_beach: "Verschneiter Strand",
  snowy_plains: "Verschneite Ebene",
  snowy_slopes: "Verschneite Hänge",
  snowy_taiga: "Verschneite Taiga",
  soul_sand_valley: "Seelensandtal",
  sparse_jungle: "Lichter Dschungel",
  stony_peaks: "Steinige Gipfel",
  stony_shore: "Steinige Küste",
  sulfur_caves: "Schwefelhöhlen",
  sunflower_plains: "Sonnenblumenebene",
  swamp: "Sumpf",
  taiga: "Taiga",
  the_end: "Das Ende",
  the_void: "Die Leere",
  warm_ocean: "Warmer Ozean",
  warped_forest: "Wirrwald",
  windswept_forest: "Zerzauster Wald",
  windswept_gravelly_hills: "Zerzauste Geröllhügel",
  windswept_hills: "Zerzauste Hügel",
  windswept_savanna: "Zerzauste Savanne",
  wooded_badlands: "Bewaldete Tafelberge",
};

const key = (id: string) => (id.includes(":") ? id.slice(id.indexOf(":") + 1) : id);

/** Deutscher Biom-Name wie im Spiel; unbekannte Biome fallen auf den englischen Namen zurück. */
export function biomeNameDe(id: string): string {
  return DE[key(id)] ?? biomeName(id);
}

/** Zum Vergleichen: klein, Umlaute und ß ausgeschrieben, nur Buchstaben und Ziffern. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Passt die Suche zum Biom? Vergleicht mit dem deutschen und dem englischen Namen und der ID,
 * ohne Rücksicht auf Groß- und Kleinschreibung, Leerzeichen, Bindestriche und Umlaute
 * („wuste“, „Wüste“, „desert“, „old growth“ und „Urwald“ finden jeweils ihr Biom).
 */
export function matchesBiome(id: string, query: string): boolean {
  const words = query.trim().split(/\s+/).map(fold).filter(Boolean);
  if (!words.length) return false;
  const hay = [biomeNameDe(id), biomeName(id), key(id)].map(fold);
  // Jedes Wort muss in einem der Namen vorkommen; „wuste“ (ohne e) findet „Wüste“ über die Umlaut-Variante
  return words.every((w) => hay.some((h) => h.includes(w) || h.replace(/ae|oe|ue/g, (m) => m[0]!).includes(w)));
}
