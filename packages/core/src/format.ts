/** "minecraft:iron_ingot" → "Iron Ingot" */
export function itemLabel(id: string): string {
  const name = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return name
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
