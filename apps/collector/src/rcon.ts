import { Socket } from "node:net";

const AUTH = 3;
const EXEC = 2;

/**
 * Minimaler RCON-Client (Source-RCON-Protokoll, wie Vanilla-Minecraft es spricht).
 * Eine Verbindung, Befehle nacheinander.
 */
export class Rcon {
  private socket?: Socket;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<number, (body: string) => void>();

  constructor(private host: string, private port: number, private password: string) {}

  async connect(timeoutMs = 5000): Promise<void> {
    this.socket = new Socket();
    this.socket.setTimeout(timeoutMs);
    this.socket.on("data", (chunk) => this.onData(chunk));
    await new Promise<void>((resolve, reject) => {
      this.socket!.once("error", reject);
      this.socket!.once("timeout", () => reject(new Error("RCON: Zeitüberschreitung")));
      this.socket!.connect(this.port, this.host, () => resolve());
    });
    const id = this.nextId++;
    const authed = new Promise<boolean>((resolve) => {
      // Bei falschem Passwort antwortet der Server mit ID -1
      this.pending.set(id, () => resolve(true));
      this.pending.set(-1, () => resolve(false));
    });
    this.write(id, AUTH, this.password);
    if (!(await authed)) throw new Error("RCON: Passwort abgelehnt");
    this.pending.delete(-1);
  }

  async command(cmd: string): Promise<string> {
    if (!this.socket) throw new Error("RCON: nicht verbunden");
    const id = this.nextId++;
    const result = new Promise<string>((resolve) => this.pending.set(id, resolve));
    this.write(id, EXEC, cmd);
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
      const body = this.buffer.toString("utf8", 12, 4 + len - 2);
      this.buffer = this.buffer.subarray(4 + len);
      const cb = this.pending.get(id);
      if (cb) {
        this.pending.delete(id);
        cb(body);
      }
    }
  }
}
