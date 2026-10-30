import { gunzipSync, inflateSync } from "node:zlib";

/**
 * Leser für binäres NBT (Big Endian), wie es in level.dat, playerdata/*.dat und Region-Dateien steckt.
 * Ergebnis sind einfache JS-Werte: Compound → Objekt, List/Arrays → Array, Long → number
 * (Koordinaten und Zähler passen, UUID-Teile kommen als Int-Array).
 * Mit `bigLongArrays` kommen Long-Arrays verlustfrei als BigInt64Array (Blockdaten, Heightmaps).
 */
export type NbtValue = number | string | NbtValue[] | BigInt64Array | { [key: string]: NbtValue };

class Reader {
  pos = 0;
  constructor(private buf: Buffer, readonly bigLongArrays = false) {}
  byte() { const v = this.buf.readInt8(this.pos); this.pos += 1; return v; }
  ubyte() { const v = this.buf.readUInt8(this.pos); this.pos += 1; return v; }
  short() { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  ushort() { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  int() { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  long() { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return Number(v); }
  bigLongs(n: number) { const a = new BigInt64Array(n); for (let i = 0; i < n; i++) a[i] = this.buf.readBigInt64BE(this.pos + i * 8); this.pos += n * 8; return a; }
  float() { const v = this.buf.readFloatBE(this.pos); this.pos += 4; return v; }
  double() { const v = this.buf.readDoubleBE(this.pos); this.pos += 8; return v; }
  string() {
    const len = this.ushort();
    // Java "modified UTF-8"; für normale Namen identisch mit UTF-8
    const v = this.buf.toString("utf8", this.pos, this.pos + len);
    this.pos += len;
    return v;
  }
}

/** Überspringt einen Wert, ohne ihn aufzubauen (spart Speicher bei großen Chunks). */
function skipPayload(r: Reader, type: number): void {
  // Länge immer zuerst lesen: `r.pos += r.int()` würde die 4 Längen-Bytes verschlucken
  const skip = (n: number) => { r.pos += n; };
  switch (type) {
    case 1: return skip(1);
    case 2: return skip(2);
    case 3: case 5: return skip(4);
    case 4: case 6: return skip(8);
    case 7: return skip(r.int());
    case 8: return skip(r.ushort());
    case 9: { const inner = r.ubyte(); const n = r.int(); for (let i = 0; i < n; i++) skipPayload(r, inner); return; }
    case 10: for (;;) { const t = r.ubyte(); if (t === 0) return; skip(r.ushort()); skipPayload(r, t); }
    case 11: return skip(r.int() * 4);
    case 12: return skip(r.int() * 8);
    default: throw new Error(`Unbekannter NBT-Typ ${type} an Position ${r.pos}`);
  }
}

function readPayload(r: Reader, type: number, depth: number): NbtValue {
  if (depth > 512) throw new Error("NBT zu tief verschachtelt");
  switch (type) {
    case 1: return r.byte();
    case 2: return r.short();
    case 3: return r.int();
    case 4: return r.long();
    case 5: return r.float();
    case 6: return r.double();
    case 7: { const n = r.int(); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.byte()); return a; }
    case 8: return r.string();
    case 9: {
      const inner = r.ubyte();
      const n = r.int();
      const a: NbtValue[] = [];
      for (let i = 0; i < n; i++) a.push(readPayload(r, inner, depth + 1));
      return a;
    }
    case 10: {
      const o: Record<string, NbtValue> = {};
      for (;;) {
        const t = r.ubyte();
        if (t === 0) return o;
        const name = r.string();
        o[name] = readPayload(r, t, depth + 1);
      }
    }
    case 11: { const n = r.int(); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.int()); return a; }
    case 12: { const n = r.int(); if (r.bigLongArrays) return r.bigLongs(n); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.long()); return a; }
    default: throw new Error(`Unbekannter NBT-Typ ${type} an Position ${r.pos}`);
  }
}

/** Entpackt gzip oder zlib, falls nötig (erkannt an den ersten Bytes). */
export function decompress(buf: Buffer): Buffer {
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
  if (buf[0] === 0x78) return inflateSync(buf);
  return buf;
}

/**
 * Liest das Wurzel-Compound einer NBT-Datei (gepackt oder ungepackt).
 * `only`: nur diese Felder der obersten Ebene aufbauen, alle anderen überspringen.
 */
export function readNbt(input: Buffer, only?: readonly string[], bigLongArrays = false): Record<string, NbtValue> {
  const r = new Reader(decompress(input), bigLongArrays);
  const type = r.ubyte();
  if (type !== 10) throw new Error(`NBT-Wurzel ist kein Compound (Typ ${type})`);
  r.string(); // Name der Wurzel, meist leer
  if (!only) return readPayload(r, 10, 0) as Record<string, NbtValue>;
  const keep = new Set(only);
  const o: Record<string, NbtValue> = {};
  for (;;) {
    const t = r.ubyte();
    if (t === 0) return o;
    const name = r.string();
    if (keep.has(name)) o[name] = readPayload(r, t, 1);
    else skipPayload(r, t);
  }
}
