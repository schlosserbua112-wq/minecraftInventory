import { gunzipSync, inflateSync } from "node:zlib";

/**
 * Leser für binäres NBT (Big Endian), wie es in level.dat, playerdata/*.dat und Region-Dateien steckt.
 * Ergebnis sind einfache JS-Werte: Compound → Objekt, List/Arrays → Array, Long → number
 * (Koordinaten und Zähler passen, UUID-Teile kommen als Int-Array).
 */
export type NbtValue = number | string | NbtValue[] | { [key: string]: NbtValue };

class Reader {
  pos = 0;
  constructor(private buf: Buffer) {}
  byte() { const v = this.buf.readInt8(this.pos); this.pos += 1; return v; }
  ubyte() { const v = this.buf.readUInt8(this.pos); this.pos += 1; return v; }
  short() { const v = this.buf.readInt16BE(this.pos); this.pos += 2; return v; }
  ushort() { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  int() { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v; }
  long() { const v = this.buf.readBigInt64BE(this.pos); this.pos += 8; return Number(v); }
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
    case 12: { const n = r.int(); const a: number[] = []; for (let i = 0; i < n; i++) a.push(r.long()); return a; }
    default: throw new Error(`Unbekannter NBT-Typ ${type} an Position ${r.pos}`);
  }
}

/** Entpackt gzip oder zlib, falls nötig (erkannt an den ersten Bytes). */
export function decompress(buf: Buffer): Buffer {
  if (buf[0] === 0x1f && buf[1] === 0x8b) return gunzipSync(buf);
  if (buf[0] === 0x78) return inflateSync(buf);
  return buf;
}

/** Liest das Wurzel-Compound einer NBT-Datei (gepackt oder ungepackt). */
export function readNbt(input: Buffer): Record<string, NbtValue> {
  const r = new Reader(decompress(input));
  const type = r.ubyte();
  if (type !== 10) throw new Error(`NBT-Wurzel ist kein Compound (Typ ${type})`);
  r.string(); // Name der Wurzel, meist leer
  return readPayload(r, 10, 0) as Record<string, NbtValue>;
}
