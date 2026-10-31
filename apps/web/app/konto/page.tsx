"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PasswordForm } from "@/components/PasswordForm";
import { PlayerColorPicker } from "@/components/PlayerColorPicker";
import { useData } from "@/lib/data";
import { coords, kindLabel } from "@/lib/derive";
import { fmt } from "@/lib/items";
import { fallbackColor } from "@/lib/search";
import { listProfiles, loadPrivateContainer, setContainerPrivate, setPlayerColor, updateOwnSettings } from "@/lib/users";

export default function AccountPage() {
  const { mode, profile, reloadProfile, snapshot } = useData();
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
              <span className="faint" style={{ fontSize: 13 }}>Ausgeschaltet siehst nur du sie unter „Wer hat was?“. Deine Kisten sind für alle sichtbar, bis auf eine private Kiste.</span>
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
      <PrivateChest mode={mode} userId={profile?.id ?? ""} me={profile?.username.toLowerCase() ?? ""} snapshot={snapshot} />
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

/** Eine eigene Kiste als privat markieren: Sie und ihr Inhalt sind dann für alle anderen unsichtbar. */
function PrivateChest({ mode, userId, me, snapshot }: { mode: string; userId: string; me: string; snapshot: ReturnType<typeof useData>["snapshot"] }) {
  const [current, setCurrent] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode === "live" && userId) loadPrivateContainer(userId).then(setCurrent);
  }, [mode, userId]);

  const mine = useMemo(() => {
    if (!snapshot) return [];
    const sums = new Map<string, number>();
    for (const r of snapshot.stock) if (r.source_kind === "container") sums.set(r.source_id, (sums.get(r.source_id) ?? 0) + r.count);
    return snapshot.containers
      .filter((c) => c.owner_type === "player" && c.owner_key === me)
      .map((c) => ({ ...c, items: sums.get(c.id) ?? 0 }))
      .sort((a, b) => b.items - a.items);
  }, [snapshot, me]);

  const label = (c: (typeof mine)[number]) => `${c.custom_name ?? kindLabel(c.kind)} · ${coords(c)} · ${fmt.format(c.items)} Items`;
  const privateChest = mine.find((c) => c.id === current);

  async function apply(id: string, on: boolean) {
    setError("");
    if (mode === "demo") return setError("Im Demo-Modus wird nichts gespeichert.");
    setBusy(true);
    try {
      await setContainerPrivate(id, on);
      setCurrent(on ? id : null);
      setChoice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="private-chest">
      <div className="panel-head">
        <h2 id="private-chest">Private Kiste</h2>
      </div>
      <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="faint" style={{ fontSize: 13 }}>
          Eine deiner Kisten kannst du privat machen. Andere Spieler sehen sie dann nirgends, weder in der Suche noch auf der Karte oder in Projekten, und ihr Inhalt zählt im Verlauf nicht mit. Nur Admins sehen sie weiterhin.
        </span>
        {privateChest ? (
          <div className="row">
            <span className="grow">{label(privateChest)}</span>
            <button type="button" className="btn" disabled={busy} onClick={() => apply(privateChest.id, false)}>Wieder für alle zeigen</button>
          </div>
        ) : mine.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Dir gehört noch keine Kiste.</p>
        ) : (
          <div className="row">
            <select className="input grow" value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Kiste">
              <option value="">Kiste wählen …</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>{label(c)}</option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" disabled={busy || !choice} onClick={() => apply(choice, true)}>Privat machen</button>
          </div>
        )}
        {error && <span role="alert" style={{ color: "var(--down)" }}>{error}</span>}
      </div>
    </section>
  );
}
