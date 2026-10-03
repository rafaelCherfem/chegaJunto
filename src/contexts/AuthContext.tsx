import type { User } from "@supabase/supabase-js";
import {
  createContext,
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { createSessionScope, type SessionScope } from "@/lib/sessionScope";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  scope: SessionScope;
  getScope: () => SessionScope;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const current = useRef(createSessionScope(null));
  const [state, setState] = useState({
    user: null as User | null,
    loading: true,
    epoch: 0,
  });

  useEffect(() => {
    let active = true;
    let revision = 0;
    let identity: string | null | undefined;
    function accept(user: User | null) {
      if (!active) return;
      if (identity === (user?.id ?? null)) {
        setState((previous) => ({ ...previous, user }));
        return;
      }
      identity = user?.id ?? null;
      const transition = ++revision;
      current.current.dispose();
      current.current = createSessionScope(identity);
      setState((previous) => ({ user: null, loading: true, epoch: previous.epoch + 1 }));
      // All current queries are private. Cancel before clearing, then publish Auth.
      const cancelled = client.cancelQueries({}, { silent: true });
      client.clear();
      void cancelled.then(() => {
        if (active && transition === revision) {
          setState((previous) => ({ ...previous, user, loading: false }));
        }
      });
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      accept(session?.user ?? null);
    });

    const initialRevision = revision;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active && revision === initialRevision)
          accept(error ? null : (data.session?.user ?? null));
      })
      .catch(() => {
        if (active && revision === initialRevision) accept(null);
      });
    return () => {
      active = false;
      current.current.dispose();
      void client.cancelQueries({}, { silent: true });
      client.clear();
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        loading: state.loading,
        scope: current.current.scope,
        getScope: () => current.current.scope,
      }}
    >
      {state.loading ? (
        <p role="status">Carregando sessão...</p>
      ) : (
        <Fragment key={state.epoch}>{children}</Fragment>
      )}
    </AuthContext.Provider>
  );
}
