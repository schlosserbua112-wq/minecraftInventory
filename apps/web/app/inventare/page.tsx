"use client";

import { useEffect, useMemo, useState } from "react";
import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { fmt } from "@/lib/items";
import { listProfiles, type Profile } from "@/lib/users";

/** Inventare und Enderkisten je Spieler. Wer sein Inventar verbirgt, erscheint ohne Inhalt. */
export default function InventoriesPage() {
  const { snapshot, mode, profile } = useData();
  const [picked, setPicked] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (mode === "live") listProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, [mode]);

  /** Minecraft-Name (klein) → Konto, über Kontoname oder Alias */
  const accountOf = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const p of profiles) {
      m.set(p.username.toLowerCase(), p);
      for (const a of p.aliases ?? []) m.set(a.toLowerCase(), p);
    }
    return m;
  }, [profiles]);

  const players = useMemo(
    () => [...(snapshot?.players ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
    [snapshot],
  );
  if (!snapshot) return <div className="page"><Loading /></div>;

  const player = players.find((p) => p.uuid === picked) ?? players[0];
  if (!player) return <div className="page"><p className="empty">Noch keine Spieler erfasst. Sobald jemand online war, taucht er hier auf.</p></div>;

  const account = accountOf.get(player.name.toLowerCase());
  const ownerKey = (account?.username ?? player.name).toLowerCase();
  const isMe = !!account && account.id === profile?.id;
  const hidden = !!account && !account.inventory_public && !isMe;
  const inv = snapshot.stock.filter((r) => r.source_kind === "inventory" && r.source_id === player.uuid);
  const ender = snapshot.stock.filter((r) => r.source_kind === "enderchest" && r.source_id === player.uuid);
  const chests = snapshot.stock.filter((r) => r.source_kind === "container" && r.owner_type === "player" && r.owner_key === ownerKey);
  const chestCount = snapshot.containers.filter((c) => c.owner_type === "player" && c.owner_key === ownerKey).length;
  const sum = (rows: typeof inv) => rows.reduce((n, r) => n + r.count, 0);
  const chestNames = [...new Map([account?.username, ...(account?.aliases ?? []), player.name].filter((n): n is string => !!n).map((n) => [n.toLowerCase(), n])).values()];

  return (
    <main className="split">
      <section className="side" aria-label="Spieler">
        <h1>Wer hat was?</h1>
        <div className="list">
          {players.map((p) => {
            const acc = accountOf.get(p.name.toLowerCase());
            const priv = !!acc && !acc.inventory_public && acc.id !== profile?.id;
            return (
              <button key={p.uuid} type="button" className="item-row" aria-current={p.uuid === player.uuid} onClick={() => setPicked(p.uuid)}>
                <span className="dot" style={{ background: p.online ? "var(--up)" : "var(--line-strong)" }} />
                <span className="grow">
                  <span>{p.name}</span>
                  <span className="sub">{p.online ? "online" : `zuletzt ${ago(p.last_seen)}`}{priv ? " · verborgen" : ""}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="main" aria-label={player.name} style={{ gap: 24 }}>
        <div className="row">
          <h1>{player.name}</h1>
          {account && account.username.toLowerCase() !== player.name.toLowerCase() && <span className="muted">Konto {account.username}</span>}
          {isMe && <span className="faint">{account!.inventory_public ? "Dein Inventar ist für alle sichtbar." : "Nur du siehst dein Inventar."}</span>}
        </div>
        {hidden ? (
          <div className="panel">
            <div className="panel-body">
              <p className="empty" style={{ margin: 0 }}>{player.name} zeigt Inventar und Enderkiste nur sich selbst.</p>
            </div>
          </div>
        ) : (
          <div className="cols">
            <div className="panel">
              <div className="panel-head"><h2>Inventar</h2><span className="faint num">{fmt.format(sum(inv))}</span></div>
              <ItemTable rows={inv} empty="Inventar ist leer." />
            </div>
            <div className="panel">
              <div className="panel-head"><h2>Enderkiste</h2><span className="faint num">{fmt.format(sum(ender))}</span></div>
              <ItemTable rows={ender} empty="Enderkiste ist leer." />
            </div>
          </div>
        )}
        <div className="panel">
          <div className="panel-head">
            <h2>Eigene Kisten</h2>
            <span className="faint">{chestCount} mit Namen {chestNames.map((n) => `„${n}“`).join(" oder ")} oder als „Meine“ markiert</span>
          </div>
          <ItemTable rows={chests} empty={`Noch keine Kiste heißt „${player.name}“. Im Amboss benennen, dann zählt sie hier.`} />
        </div>
      </section>
    </main>
  );
}
