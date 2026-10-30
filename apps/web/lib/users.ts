import { supabase } from "./supabase";

export interface Profile {
  id: string;
  username: string;
  is_admin: boolean;
  must_change_password: boolean;
  created_at: string;
  /** Dürfen andere mein Inventar und meine Enderkiste sehen? */
  inventory_public: boolean;
  /** Weitere Namen (z. B. Minecraft-Name), unter denen Kisten und Inventar mir gehören. */
  aliases: string[];
}

/** Interne Login-Adresse zu einem Benutzernamen (muss zu private.login_email in der Datenbank passen). */
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@users.mc-tracker.local`;

/** Alias (z. B. Minecraft-Name) in den Kontonamen übersetzen; ohne Treffer bleibt der Name, wie er ist. */
async function resolveLoginName(name: string): Promise<string> {
  const { data, error } = await supabase().rpc("login_name", { p_name: name });
  return !error && typeof data === "string" && data ? data : name;
}

export async function signIn(username: string, password: string) {
  const name = await resolveLoginName(username);
  const { error } = await supabase().auth.signInWithPassword({ email: loginEmail(name), password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Name oder Passwort stimmt nicht." : error.message);
}

/** Erster Login: Konto für einen bekannten Minecraft-Namen mit eigenem Passwort anlegen. */
export const claimAccount = (username: string, password: string) => rpc("claim_account", { p_username: username, p_password: password });

export const signOut = () => supabase().auth.signOut();

export async function loadProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase().from("profiles").select("*").order("username");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
}

export const createUser = (username: string, password: string, isAdmin: boolean) =>
  rpc("admin_create_user", { p_username: username, p_password: password, p_is_admin: isAdmin });
export const setPassword = (id: string, password: string) => rpc("admin_set_password", { p_user: id, p_password: password });
export const renameUser = (id: string, username: string) => rpc("admin_rename_user", { p_user: id, p_username: username });
export const setAdmin = (id: string, isAdmin: boolean) => rpc("admin_set_admin", { p_user: id, p_is_admin: isAdmin });
export const deleteUser = (id: string) => rpc("admin_delete_user", { p_user: id });
export const updateOwnSettings = (inventoryPublic: boolean, aliases: string[]) =>
  rpc("update_own_settings", { p_inventory_public: inventoryPublic, p_aliases: aliases });
export const changeOwnPassword = (oldPw: string, newPw: string) => rpc("change_own_password", { p_old: oldPw, p_new: newPw });

/** Eigene private Kiste (Kisten-ID) oder null. Fehlt die Tabelle noch, gibt es einfach keine. */
export async function loadPrivateContainer(): Promise<string | null> {
  const { data, error } = await supabase().from("container_private").select("container_id").maybeSingle();
  if (error) return null;
  return (data?.container_id as string | undefined) ?? null;
}

/** Eigene Kiste privat machen (true) oder wieder für alle zeigen (false). */
export async function setContainerPrivate(id: string, isPrivate: boolean) {
  const { error } = await supabase().rpc("set_container_private", { p_container: id, p_private: isPrivate });
  if (error?.code === "PGRST202") throw new Error("Private Kisten fehlen noch in der Datenbank. Das SQL dafür muss einmal in Supabase laufen.");
  if (error) throw new Error(error.message);
}
