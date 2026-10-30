"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { DemoSource } from "./demo";
import { loadSnapshot, subscribeChanges, supabase, supabaseActions, supabaseConfigured } from "./supabase";
import type { Actions, Snapshot } from "./types";

interface DataState {
  mode: "demo" | "live";
  snapshot: Snapshot | null;
  error: string | null;
  actions: Actions;
  session: Session | null;
  authReady: boolean;
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
    () => ({ mode: "demo", snapshot, error: null, actions: source.actions, session: null, authReady: true }),
    [snapshot, source],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function LiveProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    () => ({ mode: "live", snapshot, error, actions, session, authReady }),
    [snapshot, error, actions, session, authReady],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
