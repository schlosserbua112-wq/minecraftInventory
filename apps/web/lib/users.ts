import { supabase } from "./supabase";

export interface Profile {
  id: string;
  username: string;
  is_admin: boolean;
  must_change_password: boolean;
  created_at: string;
}

/** Interne Login-Adresse zu einem Benutzernamen (muss zu private.login_email in der Datenbank passen). */
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@users.mc-tracker.local`;

export async function signIn(username: string, password: string) {
  const { error } = await supabase().auth.signInWithPassword({ email: loginEmail(username), password });
  if (error) throw new Error(error.message === "Invalid login credentials" ? "Name oder Passwort stimmt nicht." : error.message);
}

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
export const setAdmin = (id: string, isAdmin: boolean) => rpc("admin_set_admin", { p_user: id, p_is_admin: isAdmin });
export const deleteUser = (id: string) => rpc("admin_delete_user", { p_user: id });
export const changeOwnPassword = (oldPw: string, newPw: string) => rpc("change_own_password", { p_old: oldPw, p_new: newPw });
