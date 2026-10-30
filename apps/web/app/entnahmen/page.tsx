"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { ago, coords, kindLabel } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import { useItemNames } from "@/lib/itemicons";
import type { TakeRow } from "@/lib/types";

type Filter = "all" | TakeRow["confidence"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "sicher", label: "Sicher" },
  { id: "wahrscheinlich", label: "Wahrscheinlich" },
  { id: "möglich", label: "Möglich" },
];

const CONFIDENCE: Record<TakeRow["confidence"], { color: string; text: string }> = {
  sicher: { color: "var(--down)", text: "stand an der Kiste und hat das Item bekommen" },
  wahrscheinlich: { color: "var(--own-project)", text: "hat das Item bekommen, war in der Nähe" },
  möglich: { color: "var(--own-unassigned)", text: "stand an der Kiste, Item aber nicht im Inventar" },
};

/** Koordinaten aus einer Kisten-ID "<dimension>:<x>:<y>:<z>". */
function posOf(id: string) {
  const [x, y, z] = id.split(":").slice(-3).map(Number);
  return { x: x!, y: y!, z: z! };
}

/**
 * Wer hat etwas aus meinen Kisten genommen? Der Sammler schätzt das aus Kisteninhalt,
 * Inventaren und Positionen. Besitzer sehen ihre Kisten, Admins alle.
 */
export default function TakesPage() {
  useItemNames();
  const { snapshot, actions, profile } = useData();
  const [takes, setTakes] = useState<TakeRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [onlyMine, setOnlyMine] = useState(true);

  const reload = useCallback(
    () =>
      actions
        .listTakes()
        .then((list) => {
          setTakes(list);
          setProblem(null);
        })
        .catch((e) => {
          setProblem(e instanceof Error ? e.message : String(e));
          setTakes((t) => t ?? []);
        }),
    [actions],
  );
  useEffect(() => {
    reload();
    return actions.subscribeTakes(reload);
  }, [actions, reload]);

  const me = profile?.username.toLowerCase() ?? "";
  const admin = Boolean(profile?.is_admin);
  const chests = useMemo(() => new Map((snapshot?.containers ?? []).map((c) => [c.id, c])), [snapshot]);

  if (!takes || !snapshot) return <div className="page"><Loading /></div>;

  const mine = admin && onlyMine ? takes.filter((t) => t.owner_key === me) : takes;
  const shown = filter === "all" ? mine : mine.filter((t) => t.confidence === filter);

  async function remove(id: number) {
    setTakes((t) => t?.filter((x) => x.id !== id) ?? null);
    try {
      await actions.deleteTake(id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
      reload();
    }
  }

  return (
    <main className="page" style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1>{admin && !onlyMine ? "Entnahmen aus Spielerkisten" : "Entnahmen aus deinen Kisten"}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Fehlt in einer Spielerkiste etwas, schaut der Sammler, wer gerade dort war und genau dieses Item dazubekommen hat.
          Minecraft selbst merkt sich das nicht, deshalb ist es eine Schätzung. Was du selbst nimmst und was Trichter abziehen, steht hier nicht.
          Es zählen nur Kisten in den Zonen, solange der Dieb online ist.
        </p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="chips" role="group" aria-label="Sicherheit">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {admin && (
          <button type="button" className="chip" aria-pressed={!onlyMine} onClick={() => setOnlyMine((v) => !v)} title="Als Admin siehst du die Entnahmen aus allen Spielerkisten">
            Alle Spieler
          </button>
        )}
      </div>

      {problem && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{problem}</p>}

      <section className="panel">
        <div className="panel-head">
          <h2>Verlauf</h2>
          <span className="faint num">{fmt.format(shown.length)}</span>
        </div>
        <div className="panel-body list" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {shown.length === 0 && (
            <p className="empty" style={{ padding: "16px 0" }}>
              {mine.length === 0 ? "Bisher hat niemand etwas aus deinen Kisten genommen." : "Keine Einträge in diesem Filter."}
            </p>
          )}
          {shown.map((t) => {
            const c = chests.get(t.container_id);
            const where = `${c?.custom_name ?? kindLabel(c?.kind ?? "chest")} bei ${coords(c ?? posOf(t.container_id))}`;
            const conf = CONFIDENCE[t.confidence];
            const [first, ...rest] = t.suspects;
            return (
              <div key={t.id} className="item-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                <span style={{ paddingTop: 2 }}><ItemIcon id={t.item_id} size={22} /></span>
                <span className="grow" style={{ gap: 3 }}>
                  <span>
                    <b>{first ?? "Unbekannt"}</b>
                    {rest.length > 0 && <span className="muted"> (oder {rest.join(", ")})</span>}
                    {" "}hat {fmt.format(t.count)}× {itemName(t.item_id)} genommen
                  </span>
                  <span className="sub">
                    aus {where}{t.owner_key !== me ? ` · Kiste von ${t.owner_label}` : ""} · {ago(t.taken_at)} ({new Date(t.taken_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })})
                  </span>
                  <span className="badge" title={conf.text}>
                    <span className="dot" style={{ background: conf.color }} />
                    {t.confidence}: {conf.text}{t.distance != null ? `, ${t.distance} Blöcke entfernt` : ""}
                  </span>
                </span>
                <button type="button" className="btn btn-quiet" onClick={() => remove(t.id)} title="Eintrag entfernen">
                  Erledigt
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
