"use client";

import { PLAYER_COLORS } from "@/lib/search";

/** Feste Spielerfarbe wählen. Farben anderer Konten sind gesperrt und nennen ihren Besitzer. */
export function PlayerColorPicker({ value, taken, onPick, label = "Farbe" }: { value: string | null | undefined; taken: Map<string, string>; onPick: (c: string) => void; label?: string }) {
  const custom = value && !PLAYER_COLORS.includes(value);
  return (
    <fieldset className="swatches">
      <legend>{label}</legend>
      {PLAYER_COLORS.map((c) => {
        const owner = taken.get(c);
        return (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c, opacity: owner ? 0.25 : 1, cursor: owner ? "not-allowed" : "pointer" }}
            title={owner ? `vergeben an ${owner}` : c}
            aria-label={owner ? `Farbe ${c}, vergeben an ${owner}` : `Farbe ${c}`}
            aria-pressed={value === c}
            disabled={!!owner}
            onClick={() => onPick(c)}
          />
        );
      })}
      <label className="swatch swatch-custom" title="Eigene Farbe" style={custom ? { background: value } : undefined}>
        <span className="sr-only">Eigene Farbe</span>
        <input type="color" value={value ?? "#ffffff"} onChange={(e) => onPick(e.target.value.toLowerCase())} />
      </label>
    </fieldset>
  );
}
