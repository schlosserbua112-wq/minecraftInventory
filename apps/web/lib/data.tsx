"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { DemoSource } from "./demo";
import { loadSnapshot, subscribeChanges, supabase, supabaseActions, supabaseConfigured } from "./supabase";
import type { Actions, Snapshot } from "./types";
import { loadProfile, type Profile } from "./users";

interface DataState {
  mode: "demo" | "live";
  snapshot: Snapshot | null;
  error: string | null;
  actions: Actions;
  session: Session | null;
  authReady: boolean;
  /** undefined = lädt noch, null = angemeldet, aber ohne Profil (kein Zugang) */
  profile: Profile | null | undefined;
  reloadProfile: () => void;
}

const Ctx = createContext<DataState | null>(null);

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData außerhalb von DataProvider");
  return v;
}

export function DataProvider({ children }: { children: ReactNode }) {
  return supabaseConfigured ? <LiveProvider>{children}</LiveProvider> : <DemoProvider>{children}</DemoProvider>;
}

const DEMO_PROFILE: Profile = { id: "demo", username: "Demo", is_admin: true, must_change_password: false, created_at: new Date(0).toISOString() };

function DemoProvider({ children }: { children: ReactNode }) {
  const source = useMemo(() => new DemoSource(), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    setSnapshot(source.snapshot());
    const unsub = source.subscribe(() => setSnapshot(source.snapshot()));
    source.start();
    return () => {
      unsub();
      source.stop();
    };
  }, [source]);

  const value = useMemo<DataState>(
    () => ({ mode: "demo", snapshot, error: null, actions: source.actions, session: null, authReady: true, profile: DEMO_PROFILE, reloadProfile: () => {} }),
    [snapshot, source],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function LiveProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileTick, setProfileTick] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(() => {
    // Viele Realtime-Events kurz hintereinander zu einem Neuladen bündeln
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      loadSnapshot()
        .then((s) => {
          setSnapshot(s);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 400);
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(undefined);
      return;
    }
    loadProfile(session.user.id)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [session, profileTick]);

  useEffect(() => {
    if (!session) return;
    refresh();
    const unsub = subscribeChanges(refresh);
    const poll = setInterval(refresh, 60_000); // Rückfall, falls Realtime abreißt
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [session, refresh]);

  const actions = useMemo(() => supabaseActions(refresh), [refresh]);
  const value = useMemo<DataState>(
    () => ({ mode: "live", snapshot, error, actions, session, authReady, profile, reloadProfile: () => setProfileTick((t) => t + 1) }),
    [snapshot, error, actions, session, authReady, profile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
