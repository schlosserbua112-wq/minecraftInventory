import { readdir, readFile, stat } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { Writable } from "node:stream";
import { Client } from "basic-ftp";
import type { ServerConfig } from "./config.js";

/**
 * Lesender Zugriff auf den Server-Ordner. Pfade sind relativ dazu, mit "/" getrennt.
 * Es gibt bewusst keine Schreibmethoden: der Sammler ändert nie etwas am Server.
 */
export interface WorldFiles {
  /** Dateinamen in einem Ordner; leer, wenn es ihn nicht gibt. */
  list(dir: string): Promise<string[]>;
  /**
   * Dateien eines Ordners mit Stempel aus Größe und Änderungszeit; gleicher Stempel heißt
   * unveränderte Datei. Leer, wenn es den Ordner nicht gibt.
   */
  listStamped(dir: string): Promise<{ name: string; stamp: string }[]>;
  read(path: string): Promise<Buffer>;
  /** Verbindung für einen Scan öffnen bzw. schließen (FTP); lokal ohne Wirkung. */
  open(): Promise<void>;
  close(): void;
}

export class LocalWorld implements WorldFiles {
  private root: string;
  constructor(dir: string) {
    this.root = resolve(dir);
  }
  private abs(p: string) {
    const full = resolve(this.root, p);
    if (!full.startsWith(this.root)) throw new Error(`Pfad außerhalb des Server-Ordners: ${p}`);
    return full;
  }
  async list(dir: string) {
    try {
      return await readdir(this.abs(dir));
    } catch {
      return [];
    }
  }
  async listStamped(dir: string) {
    const out: { name: string; stamp: string }[] = [];
    for (const name of await this.list(dir)) {
      try {
        const st = await stat(this.abs(posix.join(dir, name)));
        if (st.isFile()) out.push({ name, stamp: `${st.size}:${st.mtimeMs}` });
      } catch {
        // gerade gelöscht
      }
    }
    return out;
  }
  read(path: string) {
    return readFile(this.abs(path));
  }
  async open() {}
  close() {}
}

class BufferSink extends Writable {
  chunks: Buffer[] = [];
  _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void) {
    this.chunks.push(chunk);
    cb();
  }
}

/** FTP nur lesend: list und download, nie upload, rename oder delete. */
export class FtpWorld implements WorldFiles {
  private client?: Client;
  constructor(private cfg: Extract<ServerConfig["world"], { source: "ftp" }>) {}

  async open() {
    if (this.client && !this.client.closed) return;
    this.client = new Client(30_000);
    await this.client.access({ host: this.cfg.host, port: this.cfg.port, user: this.cfg.user, password: this.cfg.password, secure: this.cfg.secure });
  }
  private abs(p: string) {
    return posix.join(this.cfg.dir, p);
  }
  async list(dir: string) {
    await this.open();
    try {
      return (await this.client!.list(this.abs(dir))).filter((f) => f.isFile || f.isDirectory).map((f) => f.name);
    } catch {
      return [];
    }
  }
  async listStamped(dir: string) {
    await this.open();
    try {
      return (await this.client!.list(this.abs(dir)))
        .filter((f) => f.isFile)
        .map((f) => ({ name: f.name, stamp: `${f.size}:${f.modifiedAt?.toISOString() ?? f.rawModifiedAt}` }));
    } catch {
      return [];
    }
  }
  async read(path: string) {
    await this.open();
    const sink = new BufferSink();
    await this.client!.downloadTo(sink, this.abs(path));
    return Buffer.concat(sink.chunks);
  }
  close() {
    this.client?.close();
    this.client = undefined;
  }
}

export function worldFiles(cfg: ServerConfig["world"]): WorldFiles {
  return cfg.source === "ftp" ? new FtpWorld(cfg) : new LocalWorld(cfg.dir);
}
