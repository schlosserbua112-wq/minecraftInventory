"use client";

import { useMemo, useState } from "react";
import { ItemTable } from "@/components/ItemTable";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { ago } from "@/lib/derive";
import { fmt } from "@/lib/items";

export default function PlayersPage() {
  const { snapshot } = useData();
  const [picked, setPicked] = useState<string | null>(null);

  const players = useMemo(
    () => [...(snapshot?.players ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
    [snapshot],
  );
  if (!snapshot) return <div className="page"><Loading /></div>;

  const player = players.find((p) => p.uuid === picked) ?? players[0];
  if (!player) return <div className="page"><p className="empty">Noch keine Spieler erfasst. Sobald jemand online war, taucht er hier auf.</p></div>;

  const key = player.name.toLowerCase();
  const inv = snapshot.stock.filter((r) => r.source_kind === "inventory" && r.source_id === player.uuid);
  const ender = snapshot.stock.filter((r) => r.source_kind === "enderchest" && r.source_id === player.uuid);
  const chests = snapshot.stock.filter((r) => r.source_kind === "container" && r.owner_type === "player" && r.owner_key === key);
  const chestCount = snapshot.containers.filter((c) => c.owner_type === "player" && c.owner_key === key).length;
  const sum = (rows: typeof inv) => rows.reduce((n, r) => n + r.count, 0);

  return (
    <main className="split">
      <section className="side" aria-label="Spieler">
        <h1>Spieler</h1>
        <div className="list">
          {players.map((p) => (
            <button key={p.uuid} type="button" className="item-row" aria-current={p.uuid === player.uuid} onClick={() => setPicked(p.uuid)}>
              <span className="dot" style={{ background: p.online ? "var(--up)" : "var(--line-strong)" }} />
              <span className="grow">
                <span>{p.name}</span>
                <span className="sub">{p.online ? "online" : `zuletzt ${ago(p.last_seen)}`}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="main" aria-label={player.name} style={{ gap: 24 }}>
        <div className="row">
          <h1>{player.name}</h1>
          <span className="muted">
            <span className="num">{fmt.format(sum(inv) + sum(ender) + sum(chests))}</span> Items zusammen
          </span>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Zusammen</h2><span className="faint">Inventar, Enderkiste und eigene Kisten</span></div>
          <ItemTable rows={[...inv, ...ender, ...chests]} limit={12} />
        </div>
        <div className="cols">
          <div className="panel">
            <div className="panel-head"><h2>Inventar</h2><span className="faint num">{fmt.format(sum(inv))}</span></div>
            <ItemTable rows={inv} empty="Inventar ist leer." />
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Enderkiste</h2><span className="faint num">{fmt.format(sum(ender))}</span></div>
            <ItemTable rows={ender} empty="Enderkiste ist leer." />
          </div>
          <div className="panel">
            <div className="panel-head"><h2>Eigene Kisten</h2><span className="faint">{chestCount} mit Namen „{player.name}“</span></div>
            <ItemTable rows={chests} empty={`Noch keine Kiste heißt „${player.name}“. Im Amboss benennen, dann zählt sie hier.`} />
          </div>
        </div>
      </section>
    </main>
  );
}
