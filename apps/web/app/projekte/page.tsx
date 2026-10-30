"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import { ItemPicker } from "@/components/ItemPicker";
import { Loading } from "@/components/Loading";
import { MapView, type MapPin } from "@/components/MapView";
import { useData } from "@/lib/data";
import { coords, kindLabel } from "@/lib/derive";
import { fmt, itemName } from "@/lib/items";
import { knownItemIds, useItemNames } from "@/lib/itemicons";
import type { ContainerRow, Project, Snapshot } from "@/lib/types";

const COLOR_DIRECT = "var(--accent)";
const COLOR_OWNER = "var(--own-project)";
const COLOR_OTHER = "var(--own-unassigned)";

const chestName = (c: ContainerRow) => c.custom_name ?? `${kindLabel(c.kind)} ohne Namen`;

/** Bestand je Item aus den Kisten des Projekts: einzeln gewählte und alle Kisten der gewählten Spieler. */
function projectStock(s: Snapshot, p: Project) {
  const direct = new Set(p.containers);
  const owners = new Set(p.owners);
  const counted = (c: ContainerRow) => direct.has(c.id) || (c.owner_type === "player" && !!c.owner_key && owners.has(c.owner_key));
  const ids = new Set(s.containers.filter(counted).map((c) => c.id));
  const have = new Map<string, number>();
  for (const r of s.stock) if (r.source_kind === "container" && ids.has(r.source_id)) have.set(r.item_id, (have.get(r.item_id) ?? 0) + r.count);
  return { have, chests: ids.size, counted };
}

function missingOf(s: Snapshot, p: Project) {
  const { have } = projectStock(s, p);
  return p.items.filter((i) => (have.get(i.item_id) ?? 0) < i.quantity).length;
}

/** Projekte: benötigte Items, Kisten und Spieler, deren Bestand zählt, und was noch fehlt. Für alle sichtbar. */
export default function ProjectsPage() {
  useItemNames(); // deutsche Namen und Item-Liste nachladen
  const { snapshot, actions, profile, mode } = useData();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const fail = (e: unknown) => setProblem(e instanceof Error ? e.message : String(e));
  const reload = useCallback(
    () =>
      actions
        .listProjects()
        .then((list) => {
          setProjects(list);
          setProblem(null);
        })
        .catch((e) => {
          fail(e);
          setProjects((p) => p ?? []);
        }),
    [actions],
  );

  useEffect(() => {
    reload();
    return actions.subscribeProjects(reload);
  }, [actions, reload]);

  // Gewähltes Projekt im Link merken (?projekt=3), damit es Neuladen übersteht und sich teilen lässt
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("projekt"));
    if (id) setActiveId(id);
  }, []);
  const select = (id: number) => {
    setActiveId(id);
    const url = new URL(location.href);
    url.searchParams.set("projekt", String(id));
    history.replaceState(null, "", url);
  };

  /** Sofort anzeigen, dann speichern; danach den Stand aus der Datenbank holen. */
  function edit(id: number, local: (p: Project) => Project, save: () => Promise<unknown>) {
    setProjects((ps) => ps?.map((p) => (p.id === id ? local(p) : p)) ?? null);
    save().catch(fail).finally(reload);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim().slice(0, 60);
    if (!name) return;
    try {
      const id = await actions.createProject(name);
      setNewName("");
      await reload();
      select(id);
    } catch (err) {
      fail(err);
    }
  }

  async function remove(p: Project) {
    if (!confirm(`Projekt „${p.name}“ löschen? Das gilt für alle.`)) return;
    try {
      await actions.deleteProject(p.id);
      setActiveId(null);
      await reload();
    } catch (err) {
      fail(err);
    }
  }

  if (!snapshot || !projects) return <div className="page"><Loading /></div>;

  const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;
  const canDelete = mode === "demo" || !!profile?.is_admin || (!!active && active.created_by === profile?.id);

  return (
    <main className="split">
      <section className="side" aria-label="Projekte">
        <h1>Projekte</h1>
        <p className="muted" style={{ margin: 0 }}>Was ein Bauprojekt braucht und was davon schon in seinen Kisten liegt. Alle sehen und bearbeiten dieselben Projekte.</p>
        <form className="row" style={{ gap: 8, flexWrap: "nowrap" }} onSubmit={create}>
          <label className="sr-only" htmlFor="new-project">Name des neuen Projekts</label>
          <input id="new-project" className="input" style={{ flex: "1 1 auto", minWidth: 0 }} placeholder="Neues Projekt, z. B. Burg" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>Anlegen</button>
        </form>
        {problem && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{problem}</p>}
        <div className="list" aria-label="Alle Projekte">
          {projects.length === 0 && <p className="empty">Noch kein Projekt. Leg oben eins an, etwa für die Burg oder die nächste Farm.</p>}
          {projects.map((p) => {
            const open = missingOf(snapshot, p);
            return (
              <button key={p.id} type="button" className="item-row" aria-current={p.id === active?.id} onClick={() => select(p.id)}>
                <span className="dot" style={{ background: p.items.length && !open ? "var(--up)" : COLOR_OWNER }} />
                <span className="grow">
                  <span>{p.name}</span>
                  <span className="sub">
                    {p.items.length === 0 ? "noch keine Items" : open ? `${open} von ${p.items.length} Items fehlen noch` : `alle ${p.items.length} Items beisammen`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="main" aria-label={active?.name ?? "Projekt"} style={{ gap: 20 }}>
        {active ? (
          <ProjectDetail
            key={active.id}
            project={active}
            snapshot={snapshot}
            canDelete={canDelete}
            onRename={(name) => edit(active.id, (p) => ({ ...p, name }), () => actions.renameProject(active.id, name))}
            onDelete={() => remove(active)}
            onItem={(itemId, quantity) =>
              edit(
                active.id,
                (p) => ({
                  ...p,
                  items:
                    quantity <= 0
                      ? p.items.filter((i) => i.item_id !== itemId)
                      : p.items.some((i) => i.item_id === itemId)
                        ? p.items.map((i) => (i.item_id === itemId ? { item_id: itemId, quantity } : i))
                        : [...p.items, { item_id: itemId, quantity }],
                }),
                () => actions.setProjectItem(active.id, itemId, quantity),
              )
            }
            onSource={(source, on) =>
              edit(
                active.id,
                (p) => {
                  const [key, value] = "container" in source ? (["containers", source.container] as const) : (["owners", source.owner] as const);
                  const rest = p[key].filter((x) => x !== value);
                  return { ...p, [key]: on ? [...rest, value] : rest };
                },
                () => actions.setProjectSource(active.id, source, on),
              )
            }
          />
        ) : (
          <div className="panel">
            <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h2>Noch kein Projekt</h2>
              <p className="muted" style={{ margin: 0 }}>Ein Projekt sammelt, welche Items du in welcher Menge brauchst. Dann wählst du Kisten oder Spieler, deren Bestand zählt, und siehst, was noch fehlt.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ProjectDetail({
  project,
  snapshot,
  canDelete,
  onRename,
  onDelete,
  onItem,
  onSource,
}: {
  project: Project;
  snapshot: Snapshot;
  canDelete: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onItem: (itemId: string, quantity: number) => void;
  onSource: (source: { container: string } | { owner: string }, on: boolean) => void;
}) {
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState<string | null>(null);
  const [qty, setQty] = useState("64");
  useEffect(() => setName(project.name), [project.name]);

  const { have, chests, counted } = projectStock(snapshot, project);
  const namesVersion = useItemNames(); // Item-Liste kommt nachgeladen dazu
  const options = useMemo(() => [...new Set([...snapshot.stock.map((r) => r.item_id), ...knownItemIds()])], [snapshot.stock, namesVersion]);
  const taken = project.items.map((i) => i.item_id);

  /** Spieler mit eigenen Kisten (Besitzer-Schlüssel → Anzeigename, Anzahl Kisten) */
  const owners = useMemo(() => {
    const m = new Map<string, { label: string; chests: number }>();
    for (const c of snapshot.containers) {
      if (c.owner_type !== "player" || !c.owner_key) continue;
      const e = m.get(c.owner_key) ?? { label: c.owner_label ?? c.owner_key, chests: 0 };
      e.chests++;
      m.set(c.owner_key, e);
    }
    for (const k of project.owners) if (!m.has(k)) m.set(k, { label: k, chests: 0 });
    return [...m].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [snapshot.containers, project.owners]);

  const byId = new Map(snapshot.containers.map((c) => [c.id, c]));
  const direct = new Set(project.containers);
  const rows = project.items.map((i) => {
    const h = have.get(i.item_id) ?? 0;
    return { ...i, have: h, missing: Math.max(i.quantity - h, 0) };
  });
  const open = rows.filter((r) => r.missing > 0).length;

  const pins: MapPin[] = snapshot.containers.map((c) => {
    const inDirect = direct.has(c.id);
    const viaOwner = !inDirect && counted(c);
    return {
      id: c.id,
      x: c.x,
      z: c.z,
      ownerType: c.owner_type ?? "unassigned",
      color: inDirect ? COLOR_DIRECT : viaOwner ? COLOR_OWNER : COLOR_OTHER,
      title: `${chestName(c)} · ${coords(c)} · ${inDirect ? "zählt zum Projekt, klicken zum Entfernen" : viaOwner ? `zählt über ${c.owner_label}` : "klicken zum Hinzufügen"}`,
    };
  });

  function rename() {
    const n = name.trim().slice(0, 60);
    if (!n) return setName(project.name);
    if (n !== project.name) onRename(n);
  }
  function add(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(qty));
    if (!pending || !(n > 0)) return;
    onItem(pending, n);
    setPending(null);
  }

  return (
    <>
      <div className="proj-head">
        <label className="sr-only" htmlFor="project-name">Name des Projekts</label>
        <input id="project-name" className="input proj-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <span className="muted">
          {rows.length === 0 ? "Noch keine Items" : open ? `${open} von ${rows.length} Items fehlen noch` : "Alles beisammen"} · {chests} {chests === 1 ? "Kiste zählt" : "Kisten zählen"}
        </span>
        <span className="spacer" />
        {canDelete && <button type="button" className="btn btn-quiet btn-danger" onClick={onDelete}>Projekt löschen</button>}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Bedarf</h2><span className="faint">fehlende Items zuerst</span></div>
        <form className="proj-add" onSubmit={add}>
          {pending ? (
            <span className="row" style={{ gap: 10, flex: "1 1 240px", maxWidth: 420, flexWrap: "nowrap", minHeight: 40 }}>
              <ItemIcon id={pending} />
              <span style={{ fontWeight: 500 }}>{itemName(pending)}</span>
              <button type="button" className="btn btn-quiet btn-small" onClick={() => setPending(null)}>Anderes Item</button>
            </span>
          ) : (
            <ItemPicker options={options} taken={taken} onPick={setPending} placeholder="Item hinzufügen, z. B. Steinziegel" />
          )}
          <label className="sr-only" htmlFor="add-qty">Menge</label>
          <input id="add-qty" className="input qty-input" type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={!pending || !(Number(qty) > 0)}>Hinzufügen</button>
        </form>
        {rows.length === 0 ? (
          <p className="empty">Such oben ein Item und gib an, wie viel das Projekt davon braucht.</p>
        ) : (
          <div className="table-wrap">
            <table className="proj-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Benötigt</th>
                  <th className="r col-have">Vorhanden</th>
                  <th className="r">Fehlt</th>
                  <th><span className="sr-only">Aktionen</span></th>
                </tr>
              </thead>
              <tbody>
                {[...rows].sort((a, b) => Number(b.missing > 0) - Number(a.missing > 0)).map((r) => (
                  <tr key={r.item_id}>
                    <td>
                      <span className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                        <ItemIcon id={r.item_id} size={18} />
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          {itemName(r.item_id)}
                          <span className="have-sub faint">{fmt.format(r.have)} vorhanden</span>
                        </span>
                      </span>
                    </td>
                    <td className="r">
                      <QuantityInput value={r.quantity} label={`Benötigte Menge ${itemName(r.item_id)}`} onChange={(n) => onItem(r.item_id, n)} />
                    </td>
                    <td className="r col-have">{fmt.format(r.have)}</td>
                    <td className="r">{r.missing ? <span className="missing">{fmt.format(r.missing)}</span> : <span className="complete">fertig</span>}</td>
                    <td className="r" style={{ width: 1 }}>
                      <button type="button" className="btn btn-quiet btn-small" aria-label={`${itemName(r.item_id)} entfernen`} title="Entfernen" onClick={() => onItem(r.item_id, 0)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Spieler</h2><span className="faint">alle ihre Kisten zählen</span></div>
        <div className="panel-body">
          {owners.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Noch keine Kiste gehört einem Spieler. Im Amboss mit dem eigenen Namen benennen, dann taucht er hier auf.</p>
          ) : (
            <div className="chips" role="group" aria-label="Spieler, deren Kisten zählen">
              {owners.map(([key, o]) => (
                <button key={key} type="button" className="chip" aria-pressed={project.owners.includes(key)} onClick={() => onSource({ owner: key }, !project.owners.includes(key))}>
                  {o.label}
                  <span className="faint num">{o.chests}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Einzelne Kisten</h2><span className="faint">auf der Karte anklicken</span></div>
        {project.containers.length > 0 && (
          <div className="panel-body list" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {project.containers.map((id) => {
              const c = byId.get(id);
              return (
                <div key={id} className="item-row" style={{ cursor: "default" }}>
                  <span className="dot" style={{ background: COLOR_DIRECT }} />
                  <span className="grow">
                    <span>{c ? chestName(c) : "Kiste nicht mehr gefunden"}</span>
                    <span className="sub">{c ? coords(c) : id}</span>
                  </span>
                  <button type="button" className="btn btn-quiet btn-small" onClick={() => onSource({ container: id }, false)}>Entfernen</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="proj-map">
          <MapView
            pins={pins}
            zones={snapshot.zones}
            onSelect={(id) => onSource({ container: id }, !direct.has(id))}
            focus={String(project.id)}
            legend={[
              { label: "Im Projekt", color: COLOR_DIRECT },
              { label: "Über Spieler", color: COLOR_OWNER },
              { label: "Andere Kisten", color: COLOR_OTHER },
            ]}
          />
        </div>
      </div>
    </>
  );
}

/** Zahlenfeld, das erst beim Verlassen oder mit Enter speichert. */
function QuantityInput({ value, label, onChange }: { value: number; label: string; onChange: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  function commit() {
    const n = Math.round(Number(v));
    if (n > 0 && n !== value) onChange(n);
    else setV(String(value));
  }
  return (
    <input
      className="input qty-input"
      type="number"
      min={1}
      inputMode="numeric"
      aria-label={label}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}
