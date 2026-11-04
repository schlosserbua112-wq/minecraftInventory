"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { PasswordForm } from "@/components/PasswordForm";
import { PlayerColorPicker } from "@/components/PlayerColorPicker";
import { useData } from "@/lib/data";
import { fallbackColor } from "@/lib/search";
import { listProfiles, setPlayerColor, updateOwnSettings } from "@/lib/users";

export default function AccountPage() {
  const { mode, profile, reloadProfile } = useData();
  const [visible, setVisible] = useState(true);
  const [aliases, setAliases] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [taken, setTaken] = useState<Map<string, string>>(new Map());
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setVisible(profile.inventory_public ?? true);
    setAliases((profile.aliases ?? []).join(", "));
    setColor(profile.color ?? fallbackColor(profile.username));
  }, [profile]);

  useEffect(() => {
    if (mode !== "live" || !profile) return;
    listProfiles()
      .then((ps) => setTaken(new Map(ps.filter((p) => p.id !== profile.id && p.color).map((p) => [p.color as string, p.username]))))
      .catch(() => setTaken(new Map()));
  }, [mode, profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setNote("");
    setError("");
    if (mode === "demo") return setNote("Im Demo-Modus wird nichts gespeichert.");
    try {
      await updateOwnSettings(visible, aliases.split(",").map((a) => a.trim()).filter(Boolean));
      if (profile && color && color !== profile.color) await setPlayerColor(profile.id, color);
      reloadProfile();
      setNote("Gespeichert. Kisten mit neuen Aliasen zählen ab der nächsten Runde des Sammlers.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="page">
      <h1>Konto</h1>
      <section className="panel" aria-labelledby="settings">
        <div className="panel-head">
          <h2 id="settings">Einstellungen</h2>
          <span className="faint">angemeldet als {profile?.username}</span>
        </div>
        <form className="panel-body" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label className="row" style={{ cursor: "pointer", alignItems: "flex-start" }}>
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} style={{ marginTop: 4 }} />
            <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span>Mein Inventar und meine Enderkiste für alle anzeigen</span>
              <span className="faint" style={{ fontSize: 13 }}>Ausgeschaltet siehst nur du sie in der Suche. Deine Kisten sind für alle sichtbar, bis auf eine private Kiste.</span>
            </span>
          </label>
          <label className="field">
            Aliase
            <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="z. B. dein Minecraft-Name, Spitzname" autoComplete="off" />
            <span className="faint" style={{ fontSize: 13 }}>
              Mit Komma trennen. Kisten mit einem dieser Namen gehören dir. Steht hier dein Minecraft-Name, gehört auch dein Inventar zu diesem Konto. Mit jedem Alias kannst du dich auch anmelden.
            </span>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <PlayerColorPicker label="Meine Farbe" value={color} taken={taken} onPick={setColor} />
            <span className="faint" style={{ fontSize: 13 }}>So erscheinen deine Kisten auf der Karte, in der Legende und in der Suche, bei allen gleich. Ausgegraute Farben hat schon jemand anderes.</span>
          </div>
          <div className="row">
            <button className="btn btn-primary" type="submit">Speichern</button>
            {note && <span role="status" style={{ color: "var(--up)" }}>{note}</span>}
            {error && <span role="alert" style={{ color: "var(--down)" }}>{error}</span>}
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Private Kiste</h2>
        </div>
        <div className="panel-body">
          <span className="faint" style={{ fontSize: 13 }}>
            Deine private Kiste legst du jetzt direkt an der Kiste fest, unter <Link href="/meine-kisten">Meine Kisten</Link>.
          </span>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Passwort ändern</h2>
        </div>
        <div className="panel-body">
          {mode === "demo" ? <p className="muted" style={{ margin: 0 }}>Im Demo-Modus gibt es keine Konten.</p> : <PasswordForm />}
        </div>
      </section>
    </main>
  );
}
