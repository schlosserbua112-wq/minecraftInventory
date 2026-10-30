import type { NbtValue } from "./nbt.js";

/**
 * Parser für SNBT, also die Textform von NBT, wie sie `/data get` über RCON liefert.
 * Zahlen-Suffixe (b, s, l, f, d) werden entfernt, typisierte Arrays ([B;…], [I;…], [L;…]) zu Zahlen-Arrays,
 * true/false zu 1/0 wie im Spiel.
 */
export function parseSnbt(text: string): NbtValue {
  let i = 0;
  const s = text;

  const ws = () => {
    while (i < s.length && /\s/.test(s[i]!)) i++;
  };
  const fail = (msg: string): never => {
    throw new Error(`SNBT: ${msg} an Position ${i}: …${s.slice(Math.max(0, i - 20), i + 20)}…`);
  };

  function quoted(): string {
    const q = s[i++]!;
    let out = "";
    while (i < s.length) {
      const c = s[i++]!;
      if (c === "\\") {
        const n = s[i++];
        if (n === "n") out += "\n";
        else if (n === "t") out += "\t";
        else if (n === "u") { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4; }
        else out += n;
      } else if (c === q) return out;
      else out += c;
    }
    return fail("String nicht beendet");
  }

  // Schlüssel ohne ':', Werte dürfen ihn enthalten (z. B. minecraft:stone)
  function bare(allowColon = true): string {
    const start = i;
    const re = allowColon ? /[A-Za-z0-9_\-.+:]/ : /[A-Za-z0-9_\-.+]/;
    while (i < s.length && re.test(s[i]!)) i++;
    if (i === start) fail("Wert erwartet");
    return s.slice(start, i);
  }

  function key(): string {
    ws();
    return s[i] === '"' || s[i] === "'" ? quoted() : bare(false);
  }

  function scalar(token: string): NbtValue {
    if (token === "true") return 1;
    if (token === "false") return 0;
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([bslfdBSLFD]?)$/.exec(token);
    if (m) return Number(m[1]);
    return token;
  }

  function value(): NbtValue {
    ws();
    const c = s[i];
    if (c === "{") {
      i++;
      const o: Record<string, NbtValue> = {};
      ws();
      if (s[i] === "}") { i++; return o; }
      for (;;) {
        const k = key();
        ws();
        if (s[i] !== ":") fail("':' erwartet");
        i++;
        o[k] = value();
        ws();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "}") { i++; return o; }
        fail("',' oder '}' erwartet");
      }
    }
    if (c === "[") {
      i++;
      ws();
      // Typisiertes Array: [B; 1b, 2b], [I; …], [L; …]
      if (/[BIL]/.test(s[i] ?? "") && s[i + 1] === ";") i += 2;
      const a: NbtValue[] = [];
      ws();
      if (s[i] === "]") { i++; return a; }
      for (;;) {
        a.push(value());
        ws();
        if (s[i] === ",") { i++; continue; }
        if (s[i] === "]") { i++; return a; }
        fail("',' oder ']' erwartet");
      }
    }
    if (c === '"' || c === "'") return quoted();
    return scalar(bare());
  }

  const v = value();
  ws();
  if (i < s.length) fail("unerwarteter Rest");
  return v;
}

/**
 * Schneidet die SNBT-Daten aus einer `/data get`-Antwort ("… has the following … data: {…}").
 * Der Server stellt manchmal die Ausgabe eines früheren Befehls davor (auch von anderen RCON-Verbindungen),
 * deshalb zählt nur die letzte Antwort; mit `subject` (Spielername oder "x, y, z") nur die zum abgefragten Ziel.
 */
export function snbtFromDataGet(response: string, subject?: string): NbtValue | null {
  const at = response.lastIndexOf(subject ? `${subject} has the following ` : "has the following ");
  if (at < 0) return null;
  const idx = response.indexOf(": ", at);
  if (idx < 0) return null;
  const rest = response.slice(idx + 2).trim();
  if (!/^[{["'\-\d]/.test(rest)) return null;
  return parseSnbt(rest);
}
