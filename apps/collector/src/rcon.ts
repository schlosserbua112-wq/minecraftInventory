import { Socket } from "node:net";

const AUTH = 3;
const EXEC = 2;
const RESPONSE = 0;

/**
 * Minimaler RCON-Client (Source-RCON-Protokoll, wie Vanilla-Minecraft es spricht).
 * Eine Verbindung, Befehle nacheinander.
 * Lange Antworten teilt der Server in mehrere Pakete (je 4096 Zeichen) mit derselben ID.
 * Deshalb folgt jedem Befehl ein leeres Typ-0-Paket; dessen Antwort ("Unknown request 0")
 * kommt erst nach allen Teilen und markiert das Ende. An G-Portal (26.3, Fabric) geprüft.
 */
export class Rcon {
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, (body: string) => void>();
  /** Teilantworten je Befehls-ID */
  private parts = new Map<number, Buffer[]>();

  constructor(private host: string, private port: number, private password: string) {}

  async connect(timeoutMs = 5000): Promise<void> {
    this.socket = new Socket();
    this.socket.setTimeout(timeoutMs);
    this.socket.on("data", (chunk) => this.onData(chunk));
    try {
      await new Promise<void>((resolve, reject) => {
        this.socket!.once("error", reject);
        this.socket!.once("timeout", () => reject(new Error("RCON: Zeitüberschreitung")));
        this.socket!.connect(this.port, this.host, () => resolve());
      });
    } catch (err) {
      this.close();
      throw err;
    }
    // Spätere Fehler nicht als Absturz werfen; offene Befehle laufen dann in ihr eigenes Zeitlimit
    this.socket.on("error", () => {});
    this.socket.setTimeout(0);
    const id = this.nextId++;
    const authed = new Promise<boolean>((resolve) => {
      // Bei falschem Passwort antwortet der Server mit ID -1
      this.pending.set(id, () => resolve(true));
      this.pending.set(-1, () => resolve(false));
    });
    this.write(id, AUTH, this.password);
    // Ohne Zeitlimit hängt der Sammler für immer, wenn der Server die Anmeldung nie beantwortet
    let timer: NodeJS.Timeout | undefined;
    const ok = await Promise.race([
      authed,
      new Promise<"timeout">((resolve) => (timer = setTimeout(() => resolve("timeout"), timeoutMs))),
    ]).finally(() => clearTimeout(timer));
    this.pending.delete(id);
    this.pending.delete(-1);
    if (ok !== true) {
      this.close();
      throw new Error(ok === "timeout" ? "RCON: keine Antwort auf die Anmeldung" : "RCON: Passwort abgelehnt");
    }
  }

  async command(cmd: string): Promise<string> {
    if (!this.socket) throw new Error("RCON: nicht verbunden");
    const id = this.nextId++;
    const marker = this.nextId++;
    this.parts.set(id, []);
    const result = new Promise<string>((resolve) =>
      this.pending.set(marker, () => {
        // Erst am Ende dekodieren, sonst zerbrechen Umlaute an Paketgrenzen
        const body = Buffer.concat(this.parts.get(id) ?? []).toString("utf8");
        this.parts.delete(id);
        resolve(body);
      }),
    );
    this.write(id, EXEC, cmd);
    this.write(marker, RESPONSE, "");
    return result;
  }

  close() {
    this.socket?.destroy();
    this.socket = undefined;
  }

  private write(id: number, type: number, body: string) {
    const payload = Buffer.from(body, "utf8");
    const packet = Buffer.alloc(14 + payload.length);
    packet.writeInt32LE(10 + payload.length, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    this.socket!.write(packet);
  }

  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const len = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + len) return;
      const id = this.buffer.readInt32LE(4);
      const raw = Buffer.from(this.buffer.subarray(12, 4 + len - 2));
      const body = raw.toString("utf8");
      this.buffer = this.buffer.subarray(4 + len);
      const collecting = this.parts.get(id);
      if (collecting) {
        collecting.push(raw);
        continue;
      }
      const cb = this.pending.get(id);
      if (cb) {
        this.pending.delete(id);
        cb(body);
      }
    }
  }
}
