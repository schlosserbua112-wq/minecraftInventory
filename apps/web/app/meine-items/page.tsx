"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { coords, kindLabel } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import type { ContainerRow } from "@/lib/types";
import { loadPrivateContainer } from "@/lib/users";

type Selection = "all" | "inventory" | "enderchest" | string;

/** Alles, was mir gehört: Inventar, Enderkiste und meine Kisten mit Inhalt. Eigene Kisten lassen sich umbenennen. */
export default function MyItemsPage() {
  const { snapshot, mode, profile, actions } = useData();
  const [picked, setPicked] = useState<Selection>("all");
  const [query, setQuery] = useState("");
  const [privateId, setPrivateId] = useState<string | null>(null);

  // Im Demo-Modus gehört dem Demo-Konto nichts; dort spielt man den ersten Beispielspieler
  const me = (mode === "demo" ? snapshot?.players[0]?.name : profile?.username)?.toLowerCase() ?? "";
  useEffect(() => {
    if (mode === "live" && profile?.id) loadPrivateContainer(profile.id).then(setPrivateId);
  }, [mode, profile?.id]);

  /** Eigene Spieler-UUIDs: Kontoname oder Alias als Minecraft-Name */
  const myUuids = useMemo(() => {
    const names = new Set([me, ...(mode === "demo" ? [] : profile?.aliases ?? []).map((a) => a.toLowerCase())]);
    return new Set((snapshot?.players ?? []).filter((p) => names.has(p.name.toLowerCase())).map((p) => p.uuid));
  }, [snapshot, me, mode, profile?.aliases]);

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

  const chestIds = new Set(chests.map((c) => c.id));
  const inv = snapshot.stock.filter((r) => r.source_kind === "inventory" && myUuids.has(r.source_id));
  const ender = snapshot.stock.filter((r) => r.source_kind === "enderchest" && myUuids.has(r.source_id));
  const inChests = snapshot.stock.filter((r) => r.source_kind === "container" && chestIds.has(r.source_id));
  const sum = (rows: typeof inv) => rows.reduce((n, r) => n + r.count, 0);

  const q = query.trim().toLowerCase();
  const visible = q
    ? chests.filter((c) =>
        [c.label, c.custom_name, coords(c)].some((s) => s?.toLowerCase().includes(q)) ||
        inChests.some((r) => r.source_id === c.id && (itemName(r.item_id).toLowerCase().includes(q) || r.item_id.includes(q))),
      )
    : chests;
  const chest = chests.find((c) => c.id === picked);
  const current: Selection = chest || picked === "inventory" || picked === "enderchest" ? picked : "all";

  return (
    <main className="split">
      <section className="side" aria-label="Meine Kisten">
        <h1>Meine Items</h1>
        {mode === "demo" && snapshot.players[0] && <span className="faint" style={{ fontSize: 13 }}>Demo: Du siehst die Sachen von {snapshot.players[0].name}.</span>}
        <div className="list">
          <Row active={current === "all"} onClick={() => setPicked("all")} title="Alles zusammen" sub="Inventar, Enderkiste und alle Kisten" qty={sum(inv) + sum(ender) + sum(inChests)} />
          <Row active={current === "inventory"} onClick={() => setPicked("inventory")} title="Inventar" sub={myUuids.size ? "bei dir" : "kein Minecraft-Name verknüpft"} qty={sum(inv)} />
          <Row active={current === "enderchest"} onClick={() => setPicked("enderchest")} title="Enderkiste" sub="bei dir" qty={sum(ender)} />
        </div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Kisten</h2>
          <span className="faint num">{chests.length}</span>
        </div>
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
              <Row
                key={c.id}
                active={current === c.id}
                onClick={() => setPicked(c.id)}
                title={c.label ?? c.custom_name ?? kindLabel(c.kind)}
                sub={`${kindLabel(c.kind)} · ${coords(c)}${c.id === privateId ? " · privat" : ""}`}
                qty={c.items}
              />
            ))}
          </div>
        )}
      </section>
      <section className="main" style={{ gap: 24 }}>
        {chest ? (
          <ChestDetail key={chest.id} chest={chest} isPrivate={chest.id === privateId} rows={inChests.filter((r) => r.source_id === chest.id)} rename={actions.renameContainer} />
        ) : current === "inventory" ? (
          <Section title="Inventar" total={sum(inv)}><ItemTable rows={inv} empty={myUuids.size ? "Inventar ist leer." : "Trag unter „Konto“ deinen Minecraft-Namen als Alias ein, dann erscheint hier dein Inventar."} /></Section>
        ) : current === "enderchest" ? (
          <Section title="Enderkiste" total={sum(ender)}><ItemTable rows={ender} empty="Enderkiste ist leer." /></Section>
        ) : (
          <>
            <h1>Alles zusammen</h1>
            <Section title="In meinen Kisten" total={sum(inChests)} note={`${chests.length} ${chests.length === 1 ? "Kiste" : "Kisten"}`}>
              <ItemTable rows={inChests} empty="In deinen Kisten liegt noch nichts." />
            </Section>
            <div className="cols">
              <Section title="Inventar" total={sum(inv)}><ItemTable rows={inv} empty="Inventar ist leer." /></Section>
              <Section title="Enderkiste" total={sum(ender)}><ItemTable rows={ender} empty="Enderkiste ist leer." /></Section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Row({ active, onClick, title, sub, qty }: { active: boolean; onClick: () => void; title: string; sub: string; qty: number }) {
  return (
    <button type="button" className="item-row" aria-current={active} onClick={onClick}>
      <span className="grow">
        <span>{title}</span>
        <span className="sub">{sub}</span>
      </span>
      <span className="qty">{fmt.format(qty)}</span>
    </button>
  );
}

function Section({ title, total, note, children }: { title: string; total: number; note?: string; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className="faint num">{note ? `${note} · ` : ""}{fmt.format(total)} Items</span>
      </div>
      {children}
    </div>
  );
}

type Chest = ContainerRow & { items: number; label: string | null };

function ChestDetail({ chest, isPrivate, rows, rename }: { chest: Chest; isPrivate: boolean; rows: Parameters<typeof ItemTable>[0]["rows"]; rename: (id: string, label: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chest.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent, value = name) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await rename(chest.id, value);
      setName(value.trim());
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const title = chest.label ?? chest.custom_name ?? kindLabel(chest.kind);
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
          <h1>{title}</h1>
          <button className="btn btn-small" type="button" onClick={() => { setName(chest.label ?? ""); setEditing(true); }}>Umbenennen</button>
        </div>
      )}
      <span className="faint" style={{ fontSize: 13 }}>
        {kindLabel(chest.kind)} bei {coords(chest)}
        {chest.custom_name ? ` · im Amboss „${chest.custom_name}“` : " · ohne Amboss-Namen, als „Meine“ markiert"}
        {isPrivate ? " · privat" : ""}
      </span>
      {editing && <span className="faint" style={{ fontSize: 13 }}>Der Name gilt nur hier auf der Website und ist für alle sichtbar, die die Kiste sehen. Im Spiel und für die Zuordnung zählt weiter der Amboss-Name.</span>}
      {error && <span role="alert" style={{ color: "var(--down)" }}>{error}</span>}
      <Section title="Inhalt" total={chest.items}>
        <ItemTable rows={rows} empty="Die Kiste ist leer." />
      </Section>
    </>
  );
}
