"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { coords, kindLabel } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import type { StockRow } from "@mc/core";
import type { ContainerRow } from "@/lib/types";
import { loadPrivateContainer, setContainerPrivate } from "@/lib/users";

type Chest = ContainerRow & { items: number; label: string | null };

const chestTitle = (c: Chest) => c.label ?? c.custom_name ?? kindLabel(c.kind);

/**
 * Eigene Kisten verwalten: Inhalt je Kiste, Umbenennen und die private Kiste.
 * Zum Nachschauen (Inventar, Enderkiste, alles zusammen, andere Spieler) dient die Suche unter „Nach Spieler“.
 */
export default function MyChestsPage() {
  const { snapshot, mode, profile, actions } = useData();
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [privateId, setPrivateId] = useState<string | null>(null);

  // Im Demo-Modus gehört dem Demo-Konto nichts; dort spielt man den ersten Beispielspieler
  const me = (mode === "demo" ? snapshot?.players[0]?.name : profile?.username)?.toLowerCase() ?? "";
  useEffect(() => {
    if (mode === "live" && profile?.id) loadPrivateContainer(profile.id).then(setPrivateId);
  }, [mode, profile?.id]);

  const chests = useMemo(() => {
    if (!snapshot) return [];
    const sums = new Map<string, number>();
    for (const r of snapshot.stock) if (r.source_kind === "container") sums.set(r.source_id, (sums.get(r.source_id) ?? 0) + r.count);
    return snapshot.containers
      .filter((c) => c.owner_type === "player" && c.owner_key === me)
      .map((c) => ({ ...c, items: sums.get(c.id) ?? 0, label: snapshot.labels[c.id] ?? null }))
      .sort((a, b) => b.items - a.items || a.id.localeCompare(b.id));
  }, [snapshot, me]);

  if (!snapshot) return <div className="page"><Loading /></div>;

  const rowsOf = (id: string) => snapshot.stock.filter((r) => r.source_kind === "container" && r.source_id === id);
  const q = query.trim().toLowerCase();
  const visible = q
    ? chests.filter((c) => [c.label, c.custom_name, coords(c)].some((s) => s?.toLowerCase().includes(q)) || rowsOf(c.id).some((r) => itemName(r.item_id).toLowerCase().includes(q) || r.item_id.includes(q)))
    : chests;
  const chest = chests.find((c) => c.id === picked) ?? chests[0];
  const privateChest = chests.find((c) => c.id === privateId);

  return (
    <main className="split">
      <section className="side" aria-label="Meine Kisten">
        <h1>Meine Kisten</h1>
        {mode === "demo" && snapshot.players[0] && <span className="faint" style={{ fontSize: 13 }}>Demo: Du siehst die Kisten von {snapshot.players[0].name}.</span>}
        <span className="faint" style={{ fontSize: 13 }}>Kisten mit deinem Namen oder als „Meine“ markiert. Hier benennst du sie um und legst deine private Kiste fest.</span>
        {chests.length > 3 && (
          <label className="search" style={{ height: 40 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kiste oder Item suchen" aria-label="Kiste oder Item suchen" />
          </label>
        )}
        {chests.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>Dir gehört noch keine Kiste. Benenne eine im Amboss mit deinem Namen oder markiere eine unbenannte in der Suche als „Meine“.</p>
        ) : visible.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>Keine Kiste passt zu „{query}“.</p>
        ) : (
          <div className="list">
            {visible.map((c) => (
              <button key={c.id} type="button" className="item-row" aria-current={chest?.id === c.id} onClick={() => setPicked(c.id)}>
                <span className="grow">
                  <span>{chestTitle(c)}</span>
                  <span className="sub">
                    {kindLabel(c.kind)} · {coords(c)}
                    {c.id === privateId && <span style={{ color: "var(--accent)" }}> · privat</span>}
                  </span>
                </span>
                <span className="qty">{fmt.format(c.items)}</span>
              </button>
            ))}
          </div>
        )}
        <p className="note" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <span>
            Inventar, Enderkiste und alles zusammen siehst du in der <Link href="/?modus=spieler">Suche unter „Nach Spieler“ → Nur ich</Link>.
          </span>
        </p>
      </section>
      <section className="main" style={{ gap: 16 }}>
        {chest && (
          <ChestDetail
            key={chest.id}
            chest={chest}
            rows={rowsOf(chest.id)}
            privateChest={privateChest}
            demo={mode === "demo"}
            rename={actions.renameContainer}
            onPrivate={setPrivateId}
          />
        )}
      </section>
    </main>
  );
}

function ChestDetail({
  chest,
  rows,
  privateChest,
  demo,
  rename,
  onPrivate,
}: {
  chest: Chest;
  rows: StockRow[];
  privateChest: Chest | undefined;
  demo: boolean;
  rename: (id: string, label: string) => Promise<void>;
  onPrivate: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chest.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isPrivate = privateChest?.id === chest.id;

  async function run(job: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent, value = name) => {
    e.preventDefault();
    return run(async () => {
      await rename(chest.id, value);
      setName(value.trim());
      setEditing(false);
    });
  };

  /** Privat an/aus; eine andere private Kiste wird dabei freigegeben, weil nur eine privat sein darf. */
  const togglePrivate = () =>
    run(async () => {
      if (demo) throw new Error("Im Demo-Modus wird nichts gespeichert.");
      if (isPrivate) {
        await setContainerPrivate(chest.id, false);
        onPrivate(null);
        return;
      }
      if (privateChest) await setContainerPrivate(privateChest.id, false);
      await setContainerPrivate(chest.id, true);
      onPrivate(chest.id);
    });

  return (
    <>
      {editing ? (
        <form className="row" onSubmit={save}>
          <input
            className="input grow"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={chest.custom_name ?? kindLabel(chest.kind)}
            aria-label="Name der Kiste"
            autoFocus
            onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>Speichern</button>
          <button className="btn btn-quiet" type="button" onClick={() => setEditing(false)}>Abbrechen</button>
          {chest.label && <button className="btn btn-quiet" type="button" disabled={busy} onClick={(e) => save(e, "")}>Namen entfernen</button>}
        </form>
      ) : (
        <div className="row">
          <h1>{chestTitle(chest)}</h1>
          <button className="btn btn-small" type="button" onClick={() => { setName(chest.label ?? ""); setEditing(true); }}>Umbenennen</button>
          <span className="spacer" />
          <Link className="btn btn-small" href={`/?kiste=${encodeURIComponent(chest.id)}`}>Auf der Karte zeigen</Link>
        </div>
      )}
      <span className="faint" style={{ fontSize: 13 }}>
        {kindLabel(chest.kind)} bei {coords(chest)}
        {chest.custom_name ? ` · im Amboss „${chest.custom_name}“` : " · ohne Amboss-Namen, als „Meine“ markiert"}
      </span>
      {editing && <span className="faint" style={{ fontSize: 13 }}>Der Name gilt nur hier auf der Website und ist für alle sichtbar, die die Kiste sehen. Im Spiel und für die Zuordnung zählt weiter der Amboss-Name.</span>}

      <div className="panel">
        <label className="panel-body row" style={{ cursor: busy ? "default" : "pointer", flexWrap: "nowrap" }}>
          <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 auto" }}>
            <span style={{ fontWeight: 500 }}>Private Kiste</span>
            <span className="faint" style={{ fontSize: 12 }}>
              {isPrivate
                ? "Andere Spieler sehen diese Kiste nirgends, weder in der Suche noch auf der Karte oder in Projekten. Nur Admins sehen sie weiterhin."
                : privateChest
                  ? `Nur eine Kiste kann privat sein. Gerade ist es „${chestTitle(privateChest)}“, die wird beim Einschalten wieder für alle sichtbar.`
                  : "Eine deiner Kisten kannst du privat machen. Andere Spieler sehen sie dann nirgends, nur Admins."}
            </span>
          </span>
          <input type="checkbox" role="switch" className="switch" checked={isPrivate} disabled={busy} onChange={togglePrivate} aria-label="Private Kiste" />
        </label>
      </div>
      {error && <span role="alert" style={{ color: "var(--down)" }}>{error}</span>}

      <div className="panel">
        <div className="panel-head">
          <h2>Inhalt</h2>
          <span className="faint num">{fmt.format(chest.items)} Items</span>
        </div>
        <ItemTable rows={rows} empty="Die Kiste ist leer." />
      </div>
    </>
  );
}
