import { itemColors } from "@/lib/items";

/** Kleines Pixel-Symbol in der Farbe des Items. */
export function ItemIcon({ id, size = 22 }: { id: string; size?: number }) {
  const [color, shade] = itemColors(id);
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden="true" style={{ flex: `0 0 ${size}px` }}>
      <rect width="4" height="4" fill={shade} />
      <rect width="3" height="3" fill={color} />
      <rect width="1" height="1" fill="#ffffff" fillOpacity="0.5" />
    </svg>
  );
}
