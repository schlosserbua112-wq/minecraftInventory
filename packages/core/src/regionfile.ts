import { inflateSync, gunzipSync } from "node:zlib";
import { readNbt, type NbtValue } from "./nbt.js";
import { attachChestPartners } from "./chests.js";
import { containersFromChunk } from "./world.js";
import type { ContainerSnapshot } from "./types.js";

/**
 * Leser für Region-Dateien (Anvil, r.X.Z.mca): 1024 Chunks, Kopf mit Sektor-Offsets,
 * je Chunk 4 Byte Länge, 1 Byte Kompression, dann NBT.
 * Liefert Chunk für Chunk, damit nie die ganze Region im Speicher liegt.
 * `only`: nur diese Felder je Chunk lesen (Standard: nur die Block-Entities).
 * `bigLongArrays`: Long-Arrays verlustfrei als BigInt64Array (für die Karte).
 */
export function* eachRegionChunk(
  buf: Buffer,
  onError?: (index: number, err: unknown) => void,
  only: readonly string[] = ["block_entities", "Level", "xPos", "zPos"],
  bigLongArrays = false,
): Generator<Record<string, NbtValue>> {
  for (const { index, raw } of eachRawChunk(buf, onError)) {
    try {
      yield readNbt(raw, only, bigLongArrays);
    } catch (err) {
      onError?.(index, err);
    }
  }
}

/** Entpackte Chunks (noch nicht gelesenes NBT), um sie bei Bedarf mehrfach mit anderen Feldern zu lesen. */
export function* eachRawChunk(buf: Buffer, onError?: (index: number, err: unknown) => void): Generator<{ index: number; raw: Buffer }> {
  if (buf.length < 8192) return;
  for (let index = 0; index < 1024; index++) {
    const loc = buf.readUInt32BE(index * 4);
    const offset = (loc >>> 8) * 4096;
    if (offset === 0 || offset + 5 > buf.length) continue;
    let raw: Buffer;
    try {
      const length = buf.readUInt32BE(offset);
      const compression = buf.readUInt8(offset + 4);
      if (compression & 0x80) continue; // Chunk liegt ausgelagert in c.X.Z.mcc, sehr selten
      const data = buf.subarray(offset + 5, offset + 4 + length);
      if (compression === 1) raw = gunzipSync(data);
      else if (compression === 2) raw = inflateSync(data);
      else if (compression === 3) raw = data;
      else throw new Error(`Kompression ${compression} wird nicht unterstützt`);
    } catch (err) {
      onError?.(index, err);
      continue;
    }
    yield { index, raw };
  }
}

/**
 * Alle gezählten Behälter einer Region-Datei, Kistenhälften mit Verweis auf die andere Hälfte.
 * Die Blockdaten eines Chunks werden nur gelesen, wenn er Kisten enthält.
 */
export function containersFromRegion(buf: Buffer, dimension: string, onError?: (index: number, err: unknown) => void): ContainerSnapshot[] {
  const out: ContainerSnapshot[] = [];
  for (const { index, raw } of eachRawChunk(buf, onError)) {
    try {
      const found = containersFromChunk(readNbt(raw, ["block_entities", "Level", "xPos", "zPos"]), dimension);
      if (found.some((c) => c.kind === "chest" || c.kind === "trapped_chest")) attachChestPartners(found, readNbt(raw, ["sections"], true).sections);
      out.push(...found);
    } catch (err) {
      onError?.(index, err);
    }
  }
  return out;
}

/** Alle Chunks auf einmal (für Tests und kleine Dateien). */
export function readRegionChunks(buf: Buffer, onError?: (index: number, err: unknown) => void): Record<string, NbtValue>[] {
  return [...eachRegionChunk(buf, onError)];
}
