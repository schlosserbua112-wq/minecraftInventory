"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import type { OwnerType } from "@mc/core";
import { OWNER_COLOR, OWNER_LABEL } from "@/lib/derive";
import type { ContainerRow, ZoneRow } from "@/lib/types";
import { useWorldMap } from "@/lib/worldmap";

export interface MapPin {
  id: string;
  x: number;
  z: number;
  ownerType: OwnerType;
  label?: string;
  title: string;
}

interface View {
  cx: number;
  cz: number;
  /** Sichtbare Breite in Blöcken */
  w: number;
}

function fit(points: { x: number; z: number; r?: number }[], aspect: number): View {
  if (!points.length) return { cx: 0, cz: 0, w: 1200 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of points) {
    const r = p.r ?? 0;
    minX = Math.min(minX, p.x - r);
    maxX = Math.max(maxX, p.x + r);
    minZ = Math.min(minZ, p.z - r);
    maxZ = Math.max(maxZ, p.z + r);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, w: Math.max(maxX - minX, (maxZ - minZ) * aspect, 200) * 1.2 };
}

/**
 * Draufsicht (Norden oben, x nach rechts, z nach unten): gerenderte Weltkarte des Sammlers
 * als Hintergrund (falls vorhanden), Region-Raster (512 Blöcke), Chunk-Raster beim
 * Hineinzoomen, Zonen und Kisten-Pins.
 */
export function MapView({
  pins,
  zones,
  selectedId,
  onSelect,
  focus,
}: {
  pins: MapPin[];
  zones: ZoneRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Ändert sich der Schlüssel, passt sich die Ansicht neu an. */
  focus?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const world = useWorldMap();
  const [showWorld, setShowWorld] = useState(true);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const aspect = size.h ? size.w / size.h : 1.5;
  const initial = useMemo(
    () => fit([...pins, ...zones.filter((z) => z.is_main).map((z) => ({ x: z.center_x, z: z.center_z, r: z.radius }))], aspect),
    // Nur beim Wechsel des Fokus oder der Größe neu einpassen, nicht bei jedem Daten-Update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus, size.w > 0, Math.round(aspect * 10)],
  );
  const [view, setView] = useState<View>(initial);
  useEffect(() => setView(initial), [initial]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const k = view.w / Math.max(size.w || 800, 1); // Blöcke pro Bildschirmpixel
  const h = (size.h || 560) * k;
  const x0 = view.cx - view.w / 2;
  const z0 = view.cz - h / 2;

  const drag = useRef<{ x: number; y: number; cx: number; cz: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("[data-pin]")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * k, cz: d.cz - (e.clientY - d.y) * k }));
  };
  const onUp = () => (drag.current = null);
  const zoom = (factor: number) => setView((v) => ({ ...v, w: Math.min(Math.max(v.w * factor, 64), 20000) }));
  const onWheel = (e: WheelEvent) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);

  const regionLines = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = Math.ceil(x0 / 512) * 512; x <= x0 + view.w; x += 512) xs.push(x);
    for (let z = Math.ceil(z0 / 512) * 512; z <= z0 + h; z += 512) zs.push(z);
    return { xs, zs };
  }, [x0, z0, view.w, h]);

  const regionLabels = useMemo(() => {
    const out: { x: number; z: number; text: string }[] = [];
    for (let rx = Math.floor(x0 / 512); rx * 512 <= x0 + view.w; rx++)
      for (let rz = Math.floor(z0 / 512); rz * 512 <= z0 + h; rz++) out.push({ x: rx * 512, z: rz * 512, text: `r.${rx}.${rz}` });
    return out.length > 64 ? [] : out;
  }, [x0, z0, view.w, h]);

  const tiles = showWorld ? world.tiles.filter((t) => t.x + 512 > x0 && t.x < x0 + view.w && t.z + 512 > z0 && t.z < z0 + h) : [];
  const showChunks = view.w / 16 < 120;
  const pinSize = 24 * k;
  const usedTypes = [...new Set(pins.map((p) => p.ownerType))];

  return (
    <div
      ref={box}
      className="map"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      role="application"
      aria-label="Karte der Kisten. Ziehen zum Verschieben, Mausrad zum Zoomen."
    >
      <svg viewBox={`${x0} ${z0} ${view.w} ${h}`} preserveAspectRatio="none">
        <defs>
          <pattern id="chunks" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth={k} />
          </pattern>
        </defs>
        {tiles.map((t) => (
          <image key={`${t.x},${t.z}`} href={t.url} x={t.x} y={t.z} width={512} height={512} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />
        ))}
        {showChunks && <rect x={x0} y={z0} width={view.w} height={h} fill="url(#chunks)" />}
        {regionLines.xs.map((x) => (
          <line key={`x${x}`} x1={x} x2={x} y1={z0} y2={z0 + h} stroke="#fff" strokeOpacity="0.35" strokeWidth={k} />
        ))}
        {regionLines.zs.map((z) => (
          <line key={`z${z}`} y1={z} y2={z} x1={x0} x2={x0 + view.w} stroke="#fff" strokeOpacity="0.35" strokeWidth={k} />
        ))}
        {regionLabels.map((r) => (
          <text key={r.text} x={r.x + 8 * k} y={r.z + 16 * k} fontSize={11 * k} fill="#fff" fillOpacity="0.8" stroke="#000" strokeOpacity="0.45" strokeWidth={3 * k} paintOrder="stroke">
            {r.text}
          </text>
        ))}
        {zones.map((z) => (
          <g key={z.id}>
            <circle cx={z.center_x} cy={z.center_z} r={z.radius} fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.75" strokeWidth={2 * k} strokeDasharray={`${8 * k} ${6 * k}`} />
            <text x={z.center_x} y={z.center_z - z.radius - 6 * k} fontSize={12 * k} fill="#fff" textAnchor="middle" stroke="#000" strokeOpacity="0.5" strokeWidth={3 * k} paintOrder="stroke">
              {z.name}
            </text>
          </g>
        ))}
        <circle cx={0} cy={0} r={3 * k} fill="#fff" fillOpacity="0.8">
          <title>0 / 0</title>
        </circle>
        {pins.map((p) => {
          const sel = p.id === selectedId;
          const s = sel ? pinSize * 1.15 : p.label ? pinSize : pinSize * 0.5;
          return (
            <g key={p.id} data-pin onClick={() => onSelect?.(p.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <title>{p.title}</title>
              <rect
                x={p.x - s / 2}
                y={p.z - s / 2}
                width={s}
                height={s}
                rx={3 * k}
                fill={OWNER_COLOR[p.ownerType]}
                stroke={sel ? "#fff" : "#000"}
                strokeOpacity={sel ? 1 : 0.35}
                strokeWidth={(sel ? 3 : 1) * k}
              />
              {p.label && (
                <text x={p.x} y={p.z + 4.5 * k} fontSize={13 * k} fontWeight={600} textAnchor="middle" fill="#20251f">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="map-tools">
        <button type="button" className="btn" aria-label="Hineinzoomen" onClick={() => zoom(1 / 1.4)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className="btn" aria-label="Herauszoomen" onClick={() => zoom(1.4)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        {world.tiles.length > 0 && (
          <button
            type="button"
            className="btn"
            aria-label={showWorld ? "Weltkarte ausblenden" : "Weltkarte einblenden"}
            aria-pressed={showWorld}
            title={world.updatedAt ? `Weltkarte vom ${new Date(world.updatedAt).toLocaleString("de-DE")}` : "Weltkarte"}
            onClick={() => setShowWorld((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /></svg>
          </button>
        )}
        <button type="button" className="btn" aria-label="Ansicht zurücksetzen" onClick={() => setView(initial)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      {usedTypes.length > 0 && (
        <div className="map-legend">
          {usedTypes.map((t) => (
            <span key={t} className="badge">
              <span className="dot" style={{ background: OWNER_COLOR[t] }} />
              {OWNER_LABEL[t]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function containerPins(containers: ContainerRow[]): MapPin[] {
  return containers
    .filter((c) => c.owner_type)
    .map((c) => ({ id: c.id, x: c.x, z: c.z, ownerType: c.owner_type!, title: `${c.custom_name ?? "Kiste"} · ${c.x} / ${c.y} / ${c.z}` }));
}
