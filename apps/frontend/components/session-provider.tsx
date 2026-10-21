"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Session } from "../lib/api";

type State = { session: Session | null; loading: boolean; refresh: () => Promise<Session | null>; signOut: () => Promise<void> };
const SessionContext = createContext<State | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async (): Promise<Session | null> => { try { const next = await api.me(); setSession(next); return next; } catch { setSession(null); return null; } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signOut = async () => { await api.logout(); setSession(null); };
  return <SessionContext.Provider value={{ session, loading, refresh, signOut }}>{children}</SessionContext.Provider>;
}
export function useSession() { const state = useContext(SessionContext); if (!state) throw new Error("useSession must be inside SessionProvider"); return state; }
