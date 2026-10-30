/** Region-Datei zu Blockkoordinaten: r.X.Z.mca mit X = floor(x / 512), Z = floor(z / 512). */
export function regionOf(x: number, z: number): { rx: number; rz: number; file: string } {
  const rx = Math.floor(x / 512);
  const rz = Math.floor(z / 512);
  return { rx, rz, file: `r.${rx}.${rz}.mca` };
}

/** Alle Region-Dateien, die ein Kreis um (cx, cz) mit Radius r in Blöcken berührt. */
export function regionsForZone(cx: number, cz: number, radius: number): string[] {
  const min = regionOf(cx - radius, cz - radius);
  const max = regionOf(cx + radius, cz + radius);
  const files: string[] = [];
  for (let rx = min.rx; rx <= max.rx; rx++) {
    for (let rz = min.rz; rz <= max.rz; rz++) {
      // nächster Punkt der Region zum Mittelpunkt
      const nx = Math.min(Math.max(cx, rx * 512), rx * 512 + 511);
      const nz = Math.min(Math.max(cz, rz * 512), rz * 512 + 511);
      if ((nx - cx) ** 2 + (nz - cz) ** 2 <= radius ** 2) files.push(`r.${rx}.${rz}.mca`);
    }
  }
  return files;
}

export function containerId(dimension: string, x: number, y: number, z: number): string {
  return `${dimension}:${x}:${y}:${z}`;
}
