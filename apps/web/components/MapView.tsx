"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type WheelEvent } from "react";
import { biomeName, regionsForZone, type OwnerType } from "@mc/core";
import { useData } from "@/lib/data";
import { OWNER_COLOR, OWNER_LABEL, chestHeading } from "@/lib/derive";
import type { ContainerRow, LandmarkRow, ZoneRow } from "@/lib/types";
import { useBiomes, useWorldMap } from "@/lib/worldmap";

/** Farben zur Auswahl für Landmarks */
export const LANDMARK_COLORS = ["#e9c46a", "#f29e6d", "#ff9c8a", "#e88fb5", "#b48ce0", "#7fb3e6", "#6fd0c4", "#9ee08a", "#eef0ea"];

/** Offene Karte oben links: Landmark oder Zone, neu (id null) oder bestehend. Zahlen als Text, damit man frei tippen kann. */
type Card =
  | { kind: "landmark"; id: number | null; name: string; color: string; x: string; z: string }
  | { kind: "zone"; id: number | null; name: string; x: string; z: string; r: string };

const num = (v: string) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const landmarkCard = (l: LandmarkRow): Card => ({ kind: "landmark", id: l.id, name: l.name, color: l.color, x: String(l.x), z: String(l.z) });
const zoneCard = (z: ZoneRow): Card => ({ kind: "zone", id: z.id, name: z.name, x: String(z.center_x), z: String(z.center_z), r: String(z.radius) });

export interface MapPin {
  id: string;
  x: number;
  z: number;
  ownerType: OwnerType;
  /** Eigene Farbe, z. B. je Spieler; sonst die Farbe der Besitzart */
  color?: string;
  label?: string;
  title: string;
  /** Weitere Zeilen im Hover-Text, z. B. der Inhalt der Kiste (nur bei einer einzelnen Kiste) */
  detail?: string;
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
 * Hineinzoomen, Zonen, Landmarks und Kisten-Pins. Landmarks setzt jedes Mitglied per Klick,
 * Scan-Zonen zieht ein Admin als Kreis auf.
 */
export function MapView({
  pins,
  zones,
  selectedId,
  onSelect,
  focus,
  legend,
  target,
}: {
  pins: MapPin[];
  zones: ZoneRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Ändert sich der Schlüssel, passt sich die Ansicht neu an. */
  focus?: string;
  /** Eigene Legende statt der Besitzarten */
  legend?: { label: string; color: string }[];
  /** Landmark, zu dem gesprungen wird; `n` hochzählen, um erneut zu springen. */
  target?: { id: number; n: number };
}) {
  const { snapshot, actions, profile, mode } = useData();
  const landmarks = snapshot?.landmarks ?? [];
  const admin = mode === "demo" || Boolean(profile?.is_admin);
  const canEdit = (l: LandmarkRow) => admin || (profile != null && l.created_by === profile.id);
  const [tool, setTool] = useState<"landmark" | "zone" | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const world = useWorldMap();
  const [redrawError, setRedrawError] = useState("");
  const redrawing = snapshot?.scans.some((r) => r.kind === "map" && !r.finished_at) ?? false;
  async function redrawMap() {
    setRedrawError("");
    try {
      await actions.requestScan("map");
    } catch (err) {
      setRedrawError(err instanceof Error ? err.message : String(err));
    }
  }
  const [showWorld, setShowWorld] = useState(true);
  const [showLandmarks, setShowLandmarksState] = useState(true);
  // Schalter für Landmarks je Browser merken
  useEffect(() => {
    try {
      if (localStorage.getItem("karte.landmarks") === "aus") setShowLandmarksState(false);
    } catch {}
  }, []);
  const setShowLandmarks = (on: boolean) => {
    setShowLandmarksState(on);
    try {
      localStorage.setItem("karte.landmarks", on ? "an" : "aus");
    } catch {}
  };
  const [showBiomes, setShowBiomesState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("karte.biome") === "an") setShowBiomesState(true);
    } catch {}
  }, []);
  const setShowBiomes = (on: boolean) => {
    setShowBiomesState(on);
    try {
      localStorage.setItem("karte.biome", on ? "an" : "aus");
    } catch {}
  };
  const biomes = useBiomes(showBiomes && world.tiles.length > 0);
  /** Grenzlinien mit Umriss, damit nur sichtbare gezeichnet werden */
  const biomeLines = useMemo(
    () =>
      (biomes.layer?.lines ?? []).map((l) => {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < l.length; i += 2) {
          minX = Math.min(minX, l[i]);
          maxX = Math.max(maxX, l[i]);
          minZ = Math.min(minZ, l[i + 1]);
          maxZ = Math.max(maxZ, l[i + 1]);
        }
        return { d: `M${l.join(" ")}`, minX, maxX, minZ, maxZ };
      }),
    [biomes.layer],
  );
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

  // Sprung zu einem Landmark, z. B. aus der Suche
  useEffect(() => {
    const l = target && landmarks.find((x) => x.id === target.id);
    if (!l) return;
    setView((v) => ({ cx: l.x, cz: l.z, w: Math.min(v.w, 600) }));
    setShowLandmarks(true);
    setCard(landmarkCard(l));
    setTool(null);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n]);

  // Escape bricht Werkzeug oder offene Karte ab
  useEffect(() => {
    if (!tool && !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tool) setTool(null);
      else setCard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, card]);

  /** Bildschirmpunkt in Blockkoordinaten */
  const toWorld = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: x0 + (e.clientX - r.left) * k, z: z0 + (e.clientY - r.top) * k };
  };

  /** Block unter dem Mauszeiger bzw. dem letzten Tipp, null wenn der Zeiger außerhalb ist */
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const trackHover = (e: PointerEvent) => {
    const p = toWorld(e);
    setHover({ x: Math.floor(p.x), z: Math.floor(p.z) });
  };

  const drag = useRef<{ x: number; y: number; cx: number; cz: number; moved: boolean } | null>(null);
  /** Mittelpunkt beim Aufziehen einer Zone */
  const draw = useRef<{ x: number; z: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    trackHover(e);
    if ((e.target as Element).closest("[data-pin], [data-ui]")) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (tool === "zone") {
      const p = toWorld(e);
      draw.current = p;
      setCard((c) => ({ kind: "zone", id: null, name: c?.kind === "zone" && c.id === null ? c.name : "", x: String(Math.round(p.x)), z: String(Math.round(p.z)), r: "0" }));
      setError("");
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    // Beim Ziehen bleibt der Block unter dem Finger gleich, die Anzeige also auch
    if (!drag.current?.moved) trackHover(e);
    const c = draw.current;
    if (c) {
      const p = toWorld(e);
      const r = String(Math.round(Math.hypot(p.x - c.x, p.z - c.z)));
      setCard((cur) => (cur?.kind === "zone" ? { ...cur, r } : cur));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * k, cz: d.cz - (e.clientY - d.y) * k }));
  };
  const onUp = (e: PointerEvent) => {
    if (draw.current) {
      draw.current = null;
      // Nur geklickt statt gezogen: kleine Standardzone, Radius lässt sich in der Karte anpassen
      setCard((cur) => (cur?.kind === "zone" && num(cur.r) < 8 ? { ...cur, r: "64" } : cur));
      setTool(null);
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && tool === "landmark" && e.type === "pointerup") {
      const p = toWorld(e);
      setCard((c) => ({
        kind: "landmark",
        id: null,
        name: c?.kind === "landmark" && c.id === null ? c.name : "",
        color: c?.kind === "landmark" ? c.color : LANDMARK_COLORS[0],
        x: String(Math.round(p.x)),
        z: String(Math.round(p.z)),
      }));
      setError("");
      setTool(null);
    }
  };
  const pickTool = (t: "landmark" | "zone") => {
    if (t === "landmark") setShowLandmarks(true);
    setTool((cur) => (cur === t ? null : t));
    setError("");
  };
  const openCard = (c: Card) => {
    setCard(c);
    setTool(null);
    setError("");
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!card || !card.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (card.kind === "landmark") {
        const l = { name: card.name.trim(), color: card.color, x: num(card.x), z: num(card.z) };
        if (card.id === null) await actions.addLandmark(l);
        else await actions.updateLandmark(card.id, l);
      } else {
        if (num(card.r) < 1) throw new Error("Der Radius muss mindestens 1 Block sein.");
        await actions.addZone({
          name: card.name.trim(),
          dimension: "minecraft:overworld",
          center_x: num(card.x),
          center_z: num(card.z),
          radius: num(card.r),
          is_main: zones.length === 0,
        });
      }
      setCard(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!card || card.id === null) return;
    setBusy(true);
    setError("");
    try {
      if (card.kind === "landmark") await actions.removeLandmark(card.id);
      else await actions.removeZone(card.id);
      setCard(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const zoom = (factor: number) => setView((v) => ({ ...v, w: Math.min(Math.max(v.w * factor, 64), 60000) }));
  const onWheel = (e: WheelEvent) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15);

  const regionLines = useMemo(() => {
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = Math.ceil(x0 / 512) * 512; x <= x0 + view.w; x += 512) xs.push(x);
    for (let z = Math.ceil(z0 / 512) * 512; z <= z0 + h; z += 512) zs.push(z);
    return { xs, zs };
  }, [x0, z0, view.w, h]);

  /** Achsenbeschriftung: runde Schritte (1, 2, 5 × 10ⁿ), etwa alle 110 Bildschirmpixel einer */
  const ticks = useMemo(() => {
    const raw = 110 * k;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = Math.ceil((x0 + 30 * k) / step) * step; x <= x0 + view.w - 50 * k; x += step) xs.push(x);
    for (let z = Math.ceil((z0 + 30 * k) / step) * step; z <= z0 + h - 20 * k; z += step) zs.push(z);
    return { xs, zs };
  }, [k, x0, z0, view.w, h]);

  const regionLabels = useMemo(() => {
    const out: { x: number; z: number; text: string }[] = [];
    for (let rx = Math.floor(x0 / 512); rx * 512 <= x0 + view.w; rx++)
      for (let rz = Math.floor(z0 / 512); rz * 512 <= z0 + h; rz++) out.push({ x: rx * 512, z: rz * 512, text: `r.${rx}.${rz}` });
    return out.length > 64 ? [] : out;
  }, [x0, z0, view.w, h]);

  const tiles = showWorld ? world.tiles.filter((t) => t.x + 512 > x0 && t.x < x0 + view.w && t.z + 512 > z0 && t.z < z0 + h) : [];
  const showChunks = view.w / 16 < 120;
  const biomePath = biomes.layer
    ? biomeLines.filter((l) => l.maxX >= x0 && l.minX <= x0 + view.w && l.maxZ >= z0 && l.minZ <= z0 + h).map((l) => l.d).join("")
    : "";
  /** Schilder: nur Flächen, die auf dem Bildschirm groß genug sind, größte zuerst, ohne Überlappung */
  const biomeTags = useMemo(() => {
    const out: { key: string; name: string; x: number; z: number; w: number }[] = [];
    if (!biomes.layer) return out;
    const placed: { x1: number; z1: number; x2: number; z2: number }[] = [];
    const tagH = 20 * k;
    for (const l of biomes.layer.labels) {
      if (Math.sqrt(l.area) / k < 56) break; // nach Fläche sortiert: alle weiteren sind noch kleiner
      if (l.x < x0 || l.x > x0 + view.w || l.z < z0 || l.z > z0 + h) continue;
      const w = (biomeName(l.id).length * 6.6 + 16) * k;
      const box = { x1: l.x - w / 2 - 4 * k, z1: l.z - tagH / 2 - 4 * k, x2: l.x + w / 2 + 4 * k, z2: l.z + tagH / 2 + 4 * k };
      if (placed.some((p) => p.x1 < box.x2 && box.x1 < p.x2 && p.z1 < box.z2 && box.z1 < p.z2)) continue;
      placed.push(box);
      out.push({ key: `${l.x},${l.z}`, name: biomeName(l.id), x: l.x, z: l.z, w });
      if (out.length >= 80) break;
    }
    return out;
  }, [biomes.layer, k, x0, z0, view.w, h]);
  const pinSize = 24 * k;
  const editing = card?.kind === "landmark" ? card : null;
  /** Gespeicherte Landmarks, das gerade bearbeitete in seiner Entwurfsfassung */
  const shownLandmarks = [
    ...(showLandmarks ? landmarks.filter((l) => l.id !== editing?.id) : []),
    ...(editing ? [{ id: editing.id ?? -1, name: editing.name || "Neues Landmark", color: editing.color, x: num(editing.x), z: num(editing.z), created_by: null }] : []),
  ];
  const draftZone = card?.kind === "zone" && card.id === null ? card : null;
  const mark = 14 * k;
  /** Kisten in derselben Spalte (gleiches x/z) teilen sich einen Pin; die gewählte liegt oben und wird zuletzt gezeichnet. */
  const stacks = useMemo(() => {
    const byColumn = new Map<string, MapPin[]>();
    for (const p of pins) {
      const key = `${p.x},${p.z}`;
      byColumn.set(key, [...(byColumn.get(key) ?? []), p]);
    }
    return [...byColumn.values()]
      .map((group) => ({ pin: group.find((p) => p.id === selectedId) ?? group[0], count: group.length, titles: group.map((p) => p.title) }))
      .sort((a, b) => Number(a.pin.id === selectedId) - Number(b.pin.id === selectedId));
  }, [pins, selectedId]);
  const legendItems = legend ?? [...new Set(pins.map((p) => p.ownerType))].map((t) => ({ label: OWNER_LABEL[t], color: OWNER_COLOR[t] }));

  return (
    <div
      ref={box}
      className={tool ? "map map-drawing" : "map"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      onWheel={onWheel}
      role="application"
      aria-label="Karte der Kisten und Landmarks. Ziehen zum Verschieben, Mausrad zum Zoomen."
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
        {biomePath && (
          <g pointerEvents="none" fill="none" strokeLinejoin="round" strokeLinecap="round">
            <path d={biomePath} stroke="#000" strokeOpacity="0.45" strokeWidth={4 * k} />
            <path d={biomePath} stroke="#fff" strokeOpacity="0.9" strokeWidth={1.75 * k} strokeDasharray={`${6 * k} ${4 * k}`} />
          </g>
        )}
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
        {biomeTags.map((t) => (
          <g key={t.key} pointerEvents="none" className="biome-tag">
            <rect x={t.x - t.w / 2} y={t.z - 10 * k} width={t.w} height={20 * k} rx={10 * k} fill="#1d221c" fillOpacity="0.78" stroke="#fff" strokeOpacity="0.35" strokeWidth={k} />
            <text x={t.x} y={t.z + 4 * k} fontSize={11.5 * k} fontWeight={600} textAnchor="middle" fill="#fff">
              {t.name}
            </text>
          </g>
        ))}
        {zones.map((z) => (
          <g key={z.id}>
            <circle cx={z.center_x} cy={z.center_z} r={z.radius} fill="#fff" fillOpacity="0.05" stroke="#fff" strokeOpacity="0.75" strokeWidth={2 * k} strokeDasharray={`${8 * k} ${6 * k}`} />
            <text
              data-pin
              x={z.center_x}
              y={z.center_z - z.radius - 6 * k}
              fontSize={12 * k}
              fill="#fff"
              textAnchor="middle"
              stroke="#000"
              strokeOpacity="0.5"
              strokeWidth={3 * k}
              paintOrder="stroke"
              style={{ cursor: "pointer" }}
              onClick={() => openCard(zoneCard(z))}
            >
              <title>{`Zone ${z.name} · ${z.center_x} / ${z.center_z}, Radius ${z.radius}`}</title>
              {z.name}
            </text>
          </g>
        ))}
        {draftZone && (
          <g pointerEvents="none">
            <circle cx={num(draftZone.x)} cy={num(draftZone.z)} r={Math.max(num(draftZone.r), 0)} fill="#e9c46a" fillOpacity="0.12" stroke="#e9c46a" strokeWidth={2 * k} />
            <circle cx={num(draftZone.x)} cy={num(draftZone.z)} r={3 * k} fill="#e9c46a" />
          </g>
        )}
        <circle cx={0} cy={0} r={3 * k} fill="#fff" fillOpacity="0.8">
          <title>0 / 0</title>
        </circle>
        {stacks.map(({ pin: p, count, titles }) => {
          const sel = p.id === selectedId;
          const s = sel ? pinSize * 1.15 : p.label || count > 1 ? pinSize : pinSize * 0.5;
          return (
            <g key={p.id} data-pin onClick={() => onSelect?.(p.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
              <title>{count > 1 ? `${count} Kisten übereinander:\n${titles.join("\n")}` : p.detail ? `${p.title}\n${p.detail}` : p.title}</title>
              <rect
                x={p.x - s / 2}
                y={p.z - s / 2}
                width={s}
                height={s}
                rx={3 * k}
                fill={p.color ?? OWNER_COLOR[p.ownerType]}
                stroke={sel ? "#fff" : "#000"}
                strokeOpacity={sel ? 1 : 0.35}
                strokeWidth={(sel ? 3 : 1) * k}
              />
              {count > 1 && (
                // Versetzte Kante dahinter: hier liegen mehrere Kisten übereinander
                <rect x={p.x - s / 2 + 3 * k} y={p.z - s / 2 - 3 * k} width={s} height={s} rx={3 * k} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.5 * k} pointerEvents="none" />
              )}
              {(p.label || count > 1) && (
                <text x={p.x} y={p.z + 4.5 * k} fontSize={13 * k} fontWeight={600} textAnchor="middle" fill="#20251f">
                  {p.label ?? `${count}`}
                </text>
              )}
            </g>
          );
        })}
        {shownLandmarks.map((l) => {
          const sel = editing ? editing.id === l.id || (editing.id === null && l.id === -1) : card?.kind === "landmark" && card.id === l.id;
          const s = sel ? mark * 1.25 : mark;
          return (
            <g
              key={l.id}
              data-pin
              onClick={() => {
                const row = landmarks.find((x) => x.id === l.id);
                if (row) openCard(landmarkCard(row));
              }}
              style={{ cursor: "pointer" }}
            >
              <title>{`${l.name} · ${l.x} / ${l.z}`}</title>
              <rect
                x={l.x - s / 2}
                y={l.z - s / 2}
                width={s}
                height={s}
                transform={`rotate(45 ${l.x} ${l.z})`}
                fill={l.color}
                stroke={sel ? "#fff" : "#000"}
                strokeOpacity={sel ? 1 : 0.5}
                strokeWidth={(sel ? 2.5 : 1.5) * k}
              />
              <text x={l.x + s * 0.9} y={l.z + 4.5 * k} fontSize={13 * k} fontWeight={600} fill="#fff" stroke="#000" strokeOpacity="0.6" strokeWidth={3 * k} paintOrder="stroke">
                {l.name}
              </text>
            </g>
          );
        })}
        {hover && k < 0.5 && (
          <rect x={hover.x} y={hover.z} width={1} height={1} fill="#fff" fillOpacity="0.25" stroke="#fff" strokeWidth={1.5 * k} pointerEvents="none" />
        )}
        <g className="map-axis" pointerEvents="none" fontSize={11 * k} fill="#fff" stroke="#000" strokeOpacity="0.55" strokeWidth={3 * k} paintOrder="stroke">
          {ticks.xs.map((x) => (
            <g key={`tx${x}`}>
              <line x1={x} x2={x} y1={z0} y2={z0 + 6 * k} stroke="#fff" strokeOpacity="0.8" strokeWidth={1.5 * k} />
              <text x={x} y={z0 + 18 * k} textAnchor="middle">{x}</text>
            </g>
          ))}
          {ticks.zs.map((z) => (
            <g key={`tz${z}`}>
              <line x1={x0} x2={x0 + 6 * k} y1={z} y2={z} stroke="#fff" strokeOpacity="0.8" strokeWidth={1.5 * k} />
              <text x={x0 + 9 * k} y={z + 4 * k}>{z}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="map-coords" data-ui aria-live="off" title={hover ? "Block unter dem Mauszeiger" : "Mitte der Ansicht"}>
        <span>X <b>{hover ? hover.x : Math.floor(view.cx)}</b></span>
        <span>Z <b>{hover ? hover.z : Math.floor(view.cz)}</b></span>
        {!hover && <span className="map-coords-note">Mitte</span>}
      </div>
      {tool && (
        <div className="map-hint" data-ui role="status">
          <span>{tool === "landmark" ? "Klick auf die Karte, wo das Landmark hin soll." : "Am Mittelpunkt drücken und nach außen ziehen."}</span>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setTool(null)}>Abbrechen</button>
        </div>
      )}
      {!tool && !redrawing && !redrawError && biomes.missing && (
        <div className="map-hint" data-ui role="status">
          <span>Biome gibt es nach dem nächsten Neuzeichnen der Karte.</span>
          <button type="button" className="btn btn-quiet btn-small" onClick={() => setShowBiomes(false)}>Ausblenden</button>
        </div>
      )}
      {!tool && (redrawing || redrawError) && (
        <div className="map-hint" data-ui role="status">
          <span className={redrawError ? "map-card-error" : undefined}>{redrawError || "Der Pi zeichnet die Karte neu. Das dauert ein paar Minuten."}</span>
          {redrawError && <button type="button" className="btn btn-quiet btn-small" onClick={() => setRedrawError("")}>Schließen</button>}
        </div>
      )}
      {card && (
        <MapCard
          card={card}
          setCard={setCard}
          canEdit={card.kind === "landmark" ? card.id === null || canEdit(landmarks.find((l) => l.id === card.id) ?? ({ created_by: null } as LandmarkRow)) : admin}
          busy={busy}
          error={error}
          onSave={save}
          onRemove={remove}
          onClose={() => {
            setCard(null);
            setError("");
          }}
        />
      )}
      <div className="map-tools" data-ui>
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
        {world.tiles.length > 0 && (
          <button
            type="button"
            className="btn"
            aria-label={showBiomes ? "Biome ausblenden" : "Biome einblenden"}
            title={showBiomes ? "Biome ausblenden" : "Biome einblenden"}
            aria-pressed={showBiomes}
            onClick={() => setShowBiomes(!showBiomes)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 17c3-1 4-5 8-5s5 3 10 2" strokeDasharray="3 2.5" />
              <path d="M4 5h7v4H4z" />
            </svg>
          </button>
        )}
        {landmarks.length > 0 && (
          <button
            type="button"
            className="btn"
            aria-label={showLandmarks ? "Landmarks ausblenden" : "Landmarks einblenden"}
            title={showLandmarks ? "Landmarks ausblenden" : "Landmarks einblenden"}
            aria-pressed={showLandmarks}
            onClick={() => setShowLandmarks(!showLandmarks)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 4l8 8-8 8-8-8z" />
              {!showLandmarks && <path d="M4 4l16 16" />}
            </svg>
          </button>
        )}
        <button type="button" className="btn" aria-label="Ansicht zurücksetzen" onClick={() => setView(initial)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
        {profile !== null && (
          <button type="button" className="btn map-tool-gap" aria-label="Landmark setzen" title="Landmark setzen" aria-pressed={tool === "landmark"} onClick={() => pickTool("landmark")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
          </button>
        )}
        {admin && (
          <button type="button" className="btn" aria-label="Scan-Zone ziehen" title="Scan-Zone ziehen" aria-pressed={tool === "zone"} onClick={() => pickTool("zone")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="8" strokeDasharray="3 3" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M12 12h8" /></svg>
          </button>
        )}
        {admin && (
          <button
            type="button"
            className="btn"
            aria-label="Karte neu zeichnen"
            title={redrawing ? "Karte wird neu gezeichnet …" : world.updatedAt ? `Karte neu zeichnen (zuletzt ${new Date(world.updatedAt).toLocaleString("de-DE")})` : "Karte neu zeichnen"}
            disabled={redrawing}
            onClick={redrawMap}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={redrawing ? "spin" : undefined}><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" /></svg>
          </button>
        )}
      </div>
      {legendItems.length > 0 && (
        <div className="map-legend">
          {legendItems.map((l) => (
            <span key={l.label} className="badge">
              <span className="dot" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Formular oder Info zu Landmark/Zone, oben links über der Karte */
function MapCard({
  card,
  setCard,
  canEdit,
  busy,
  error,
  onSave,
  onRemove,
  onClose,
}: {
  card: Card;
  setCard: (c: Card) => void;
  canEdit: boolean;
  busy: boolean;
  error: string;
  onSave: (e: FormEvent) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const isNew = card.id === null;
  const set = (patch: Partial<Card>) => setCard({ ...card, ...patch } as Card);
  const close = (
    <button type="button" className="btn btn-quiet btn-small map-card-close" aria-label="Schließen" onClick={onClose}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
  const regions = card.kind === "zone" && num(card.r) > 0 ? regionsForZone(num(card.x), num(card.z), num(card.r)).length : 0;

  // Nur ansehen: fremdes Landmark oder Zone ohne Admin-Recht, bzw. gespeicherte Zone
  if (!canEdit || (card.kind === "zone" && !isNew)) {
    return (
      <div className="map-card" data-ui role="dialog" aria-label={card.name}>
        <div className="map-card-head">
          <h2 className="row" style={{ gap: 8 }}>
            {card.kind === "landmark" && <span className="dot" style={{ background: card.color, transform: "rotate(45deg)" }} />}
            {card.name}
          </h2>
          {close}
        </div>
        <span className="muted num">
          {card.kind === "landmark" ? `${card.x} / ${card.z}` : `Scan-Zone · ${card.x} / ${card.z}, Radius ${card.r}`}
        </span>
        {card.kind === "zone" && <span className="faint small">Prüft {regions} Region-{regions === 1 ? "Datei" : "Dateien"}</span>}
        {card.kind === "landmark" && <span className="faint small">Ändern kann es nur, wer es gesetzt hat, oder ein Admin.</span>}
        {card.kind === "zone" && canEdit && (
          <div className="row">
            <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>Zone löschen</button>
          </div>
        )}
        {error && <p role="alert" className="map-card-error">{error}</p>}
      </div>
    );
  }

  return (
    <form className="map-card" data-ui onSubmit={onSave} aria-label={isNew ? (card.kind === "zone" ? "Neue Scan-Zone" : "Neues Landmark") : "Landmark bearbeiten"}>
      <div className="map-card-head">
        <h2>{card.kind === "zone" ? "Neue Scan-Zone" : isNew ? "Neues Landmark" : "Landmark bearbeiten"}</h2>
        {close}
      </div>
      <label className="field">
        Name
        <input
          className="input"
          value={card.name}
          maxLength={60}
          autoFocus
          placeholder={card.kind === "zone" ? "z. B. Farm im Norden" : "z. B. Dorf am See"}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      {card.kind === "landmark" && (
        <fieldset className="swatches">
          <legend>Farbe</legend>
          {LANDMARK_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Farbe ${c}`} aria-pressed={card.color === c} onClick={() => set({ color: c })} />
          ))}
          <label className="swatch swatch-custom" title="Eigene Farbe" style={LANDMARK_COLORS.includes(card.color) ? undefined : { background: card.color }}>
            <span className="sr-only">Eigene Farbe</span>
            <input type="color" value={card.color} onChange={(e) => set({ color: e.target.value.toLowerCase() })} />
          </label>
        </fieldset>
      )}
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
        <label className="field" style={{ flex: "1 1 0", minWidth: 0 }}>x<input className="input num" inputMode="numeric" value={card.x} onChange={(e) => set({ x: e.target.value })} /></label>
        <label className="field" style={{ flex: "1 1 0", minWidth: 0 }}>z<input className="input num" inputMode="numeric" value={card.z} onChange={(e) => set({ z: e.target.value })} /></label>
        {card.kind === "zone" && (
          <label className="field" style={{ flex: "1 1 0", minWidth: 0 }}>Radius<input className="input num" inputMode="numeric" value={card.r} onChange={(e) => set({ r: e.target.value })} /></label>
        )}
      </div>
      {card.kind === "zone" && (
        <span className="faint small">Der Sammler prüft dann {regions} Region-{regions === 1 ? "Datei" : "Dateien"} regelmäßig nach Kisten.</span>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-small" disabled={busy || !card.name.trim()}>
          {isNew ? (card.kind === "zone" ? "Zone anlegen" : "Landmark setzen") : "Speichern"}
        </button>
        {!isNew && <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={onRemove}>Löschen</button>}
      </div>
      {error && <p role="alert" className="map-card-error">{error}</p>}
    </form>
  );
}

export function containerPins(containers: ContainerRow[]): MapPin[] {
  return containers
    .filter((c) => c.owner_type)
    .map((c) => ({ id: c.id, x: c.x, z: c.z, ownerType: c.owner_type!, title: `${chestHeading(c)} · ${c.x} / ${c.y} / ${c.z}` }));
}
