"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loading } from "@/components/Loading";
import { useData } from "@/lib/data";
import { createUser, deleteUser, listProfiles, renameUser, setAdmin, setPassword, type Profile } from "@/lib/users";

const DEMO_USERS: Profile[] = ["Valentin", "Max", "Lena"].map((username, i) => ({
  id: String(i), username, is_admin: i === 0, must_change_password: i === 2, created_at: new Date().toISOString(), inventory_public: i !== 1, aliases: [],
}));

export default function UsersPage() {
  const { mode, profile, reloadProfile } = useData();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", password: "", admin: false });
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [nameFor, setNameFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [note, setNote] = useState("");

  const reload = useCallback(() => {
    if (mode === "demo") return setUsers(DEMO_USERS);
    listProfiles().then(setUsers).catch((e) => setError(e.message));
  }, [mode]);
  useEffect(reload, [reload]);

  if (!profile?.is_admin) return <main className="page"><p className="empty">Diese Seite ist nur für Admins.</p></main>;
  if (!users) return <main className="page"><Loading /></main>;

  async function run(fn: () => Promise<void>, ok: string) {
    setError("");
    setNote("");
    if (mode === "demo") return setNote("Im Demo-Modus wird nichts gespeichert.");
    try {
      await fn();
      setNote(ok);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(() => createUser(form.name.trim(), form.password, form.admin), `${form.name.trim()} ist angelegt. Beim ersten Login muss ein eigenes Passwort gewählt werden.`);
    setForm({ name: "", password: "", admin: false });
  }

  return (
    <main className="page">
      <h1>Benutzer</h1>
      {error && <p role="alert" style={{ margin: 0, color: "var(--down)" }}>{error}</p>}
      {note && <p role="status" style={{ margin: 0, color: "var(--up)" }}>{note}</p>}

      <section className="panel" aria-labelledby="new-user">
        <div className="panel-head"><h2 id="new-user">Neuer Benutzer</h2><span className="faint">am besten der Minecraft-Name</span></div>
        <form onSubmit={create} className="panel-body row" style={{ alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "2 1 180px" }}>
            Name
            <input className="input" required pattern="[A-Za-z0-9_]{2,32}" title="2–32 Zeichen: Buchstaben, Ziffern, _" autoComplete="off" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field" style={{ flex: "2 1 180px" }}>
            Startpasswort
            <input className="input" required type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.checked })} />
            Admin
          </label>
          <button className="btn btn-primary" type="submit">Anlegen</button>
        </form>
      </section>

      <section className="panel" aria-labelledby="all-users">
        <div className="panel-head"><h2 id="all-users">Alle Benutzer</h2><span className="faint">{users.length}</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Rolle</th><th>Status</th><th className="r"><span className="sr-only">Aktionen</span></th></tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === profile.id;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.username}{self && <span className="faint"> (du)</span>}</td>
                    <td>{u.is_admin ? "Admin" : "Mitglied"}</td>
                    <td className="muted">{u.must_change_password ? "muss Passwort ändern" : "aktiv"}</td>
                    <td className="r">
                      {nameFor === u.id ? (
                        <form
                          className="row"
                          style={{ justifyContent: "flex-end", gap: 6 }}
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const name = newName.trim();
                            await run(
                              () => renameUser(u.id, name),
                              self ? `Du heißt jetzt ${name}. Melde dich ab jetzt mit diesem Namen an.` : `${u.username} heißt jetzt ${name}. Der Login geht ab jetzt mit dem neuen Namen, das Passwort bleibt.`,
                            );
                            if (self) reloadProfile();
                            setNameFor(null);
                          }}
                        >
                          <label className="sr-only" htmlFor={`name-${u.id}`}>Neuer Name für {u.username}</label>
                          <input id={`name-${u.id}`} className="input" required pattern="[A-Za-z0-9_]{2,32}" title="2–32 Zeichen: Buchstaben, Ziffern, _" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />
                          <button className="btn" type="submit">Umbenennen</button>
                          <button className="btn btn-quiet" type="button" onClick={() => setNameFor(null)}>Abbrechen</button>
                        </form>
                      ) : pwFor === u.id ? (
                        <form
                          className="row"
                          style={{ justifyContent: "flex-end", gap: 6 }}
                          onSubmit={async (e) => {
                            e.preventDefault();
                            await run(() => setPassword(u.id, newPw), `Neues Passwort für ${u.username} gesetzt.`);
                            setPwFor(null);
                            setNewPw("");
                          }}
                        >
                          <label className="sr-only" htmlFor={`pw-${u.id}`}>Neues Passwort für {u.username}</label>
                          <input id={`pw-${u.id}`} className="input" type="text" required autoComplete="off" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="neues Passwort" />
                          <button className="btn" type="submit">Setzen</button>
                          <button className="btn btn-quiet" type="button" onClick={() => setPwFor(null)}>Abbrechen</button>
                        </form>
                      ) : (
                        <span className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                          <button className="btn btn-quiet" type="button" onClick={() => { setNameFor(u.id); setNewName(u.username); setPwFor(null); }}>Umbenennen</button>
                          <button className="btn btn-quiet" type="button" onClick={() => { setPwFor(u.id); setNewPw(""); setNameFor(null); }}>Passwort setzen</button>
                          {!self && (
                            <button className="btn btn-quiet" type="button" onClick={() => run(() => setAdmin(u.id, !u.is_admin), u.is_admin ? `${u.username} ist kein Admin mehr.` : `${u.username} ist jetzt Admin.`)}>
                              {u.is_admin ? "Admin entziehen" : "Zum Admin machen"}
                            </button>
                          )}
                          {!self && (
                            <button
                              className="btn btn-quiet"
                              type="button"
                              style={{ color: "var(--down)" }}
                              onClick={() => window.confirm(`${u.username} wirklich löschen?`) && run(() => deleteUser(u.id), `${u.username} gelöscht.`)}
                            >
                              Löschen
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
