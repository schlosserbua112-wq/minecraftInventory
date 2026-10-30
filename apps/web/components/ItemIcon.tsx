"use client";

import { itemColors } from "@/lib/items";
import { useItemTexture } from "@/lib/itemicons";

const PIXEL = { imageRendering: "pixelated" } as const;

/** Original-Textur des Items, falls hochgeladen; sonst ein kleines Pixel-Symbol in der Farbe des Items. */
export function ItemIcon({ id, size = 22 }: { id: string; size?: number }) {
  const tex = useItemTexture(id);
  const box = { flex: `0 0 ${size}px` };

  if (tex && "flat" in tex) {
    // Animierte Texturen sind senkrechte Streifen; "slice" zeigt nur das erste Bild
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={box}>
        <image href={tex.flat} width="16" height="16" preserveAspectRatio="xMidYMin slice" style={PIXEL} />
      </svg>
    );
  }
  if (tex) {
    // Block als Würfel wie im Inventar: Oberseite hell, linke Seite mittel, rechte Seite dunkel
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={box}>
        <image href={tex.top} width="16" height="16" preserveAspectRatio="xMidYMin slice" transform="matrix(0.9375 -0.46875 0.9375 0.46875 1 8.5)" style={PIXEL} />
        <image href={tex.front} width="16" height="16" preserveAspectRatio="xMidYMin slice" transform="matrix(0.9375 0.46875 0 0.96875 1 8.5)" style={PIXEL} />
        <image href={tex.side} width="16" height="16" preserveAspectRatio="xMidYMin slice" transform="matrix(0.9375 -0.46875 0 0.96875 16 16)" style={PIXEL} />
        <path d="M1 8.5 16 16v15.5L1 24z" fill="#000" fillOpacity="0.22" />
        <path d="M16 16 31 8.5V24l-15 7.5z" fill="#000" fillOpacity="0.42" />
      </svg>
    );
  }

  const [color, shade] = itemColors(id);
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden="true" style={box}>
      <rect width="4" height="4" fill={shade} />
      <rect width="3" height="3" fill={color} />
      <rect width="1" height="1" fill="#ffffff" fillOpacity="0.5" />
    </svg>
  );
}
