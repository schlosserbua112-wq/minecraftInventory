import { inflateSync, gunzipSync } from "node:zlib";
import { readNbt, type NbtValue } from "./nbt.js";

/**
 * Leser für Region-Dateien (Anvil, r.X.Z.mca): 1024 Chunks, Kopf mit Sektor-Offsets,
 * je Chunk 4 Byte Länge, 1 Byte Kompression, dann NBT.
 * Liefert Chunk für Chunk, damit nie die ganze Region im Speicher liegt.
 * `only`: nur diese Felder je Chunk lesen (Standard: nur die Block-Entities).
 */
export function* eachRegionChunk(
  buf: Buffer,
  onError?: (index: number, err: unknown) => void,
  only: readonly string[] = ["block_entities", "Level", "xPos", "zPos"],
): Generator<Record<string, NbtValue>> {
  if (buf.length < 8192) return;
  for (let index = 0; index < 1024; index++) {
    const loc = buf.readUInt32BE(index * 4);
    const offset = (loc >>> 8) * 4096;
    if (offset === 0 || offset + 5 > buf.length) continue;
    try {
      const length = buf.readUInt32BE(offset);
      const compression = buf.readUInt8(offset + 4);
      if (compression & 0x80) continue; // Chunk liegt ausgelagert in c.X.Z.mcc, sehr selten
      const data = buf.subarray(offset + 5, offset + 4 + length);
      let raw: Buffer;
      if (compression === 1) raw = gunzipSync(data);
      else if (compression === 2) raw = inflateSync(data);
      else if (compression === 3) raw = data;
      else throw new Error(`Kompression ${compression} wird nicht unterstützt`);
      yield readNbt(raw, only);
    } catch (err) {
      onError?.(index, err);
    }
  }
}

/** Alle Chunks auf einmal (für Tests und kleine Dateien). */
export function readRegionChunks(buf: Buffer, onError?: (index: number, err: unknown) => void): Record<string, NbtValue>[] {
  return [...eachRegionChunk(buf, onError)];
}
