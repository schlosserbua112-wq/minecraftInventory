import type { Owner } from "./types.js";

/**
 * Holt den Klartext aus einem Amboss-Namen. Je nach Version ist der Name
 * ein String, ein JSON-Text-Komponent als String oder ein Objekt/Array.
 */
export function plainText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const s = raw.trim();
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try {
        return plainText(JSON.parse(s));
      } catch {
        return raw;
      }
    }
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
      try {
        return String(JSON.parse(s));
      } catch {
        return raw;
      }
    }
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) return raw.map(plainText).join("");
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const own = typeof o.text === "string" ? o.text : "";
    const extra = Array.isArray(o.extra) ? o.extra.map(plainText).join("") : "";
    return own + extra;
  }
  return "";
}

// Alles, was mit "Projekt" beginnt, z. B. "Projekt Burg" oder "ProjektHafen"
const PROJECT_RE = /^projekt\s*(.*)$/i;

/**
 * Ordnet einen Kistennamen nach den Namensregeln zu.
 * Gibt `null` zurück, wenn die Kiste unbenannt ist und ignoriert wird.
 * `playerNames`: Spielernamen, oder eine Map von Namen/Aliasen (klein geschrieben) auf den Kontonamen.
 */
export function classifyName(rawName: unknown, playerNames: Iterable<string> | ReadonlyMap<string, string>): Owner | null {
  const name = plainText(rawName).replace(/\s+/g, " ").trim();
  if (!name) return null;
  const lower = name.toLowerCase();

  if (lower === "allgemein") return { type: "common", key: "allgemein", label: "Allgemein" };

  const project = PROJECT_RE.exec(name);
  if (project) {
    const label = project[1].trim() || "Projekt";
    return { type: "project", key: label.toLowerCase(), label };
  }

  if (playerNames instanceof Map) {
    const label = playerNames.get(lower);
    return label ? { type: "player", key: label.toLowerCase(), label } : { type: "unassigned", key: lower, label: name };
  }
  for (const player of playerNames as Iterable<string>) {
    if (player.toLowerCase() === lower) return { type: "player", key: lower, label: player };
  }

  return { type: "unassigned", key: lower, label: name };
}
