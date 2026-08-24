import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  requestCode: (email: string) => Promise<CodeSent>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export type CodeSent = {
  firstName: string | null;
  sentTo: string;
};

type SessionGrant = { email: string; tokenHash: string };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function completeGrant(grant: SessionGrant) {
    // supabase-js refuses if `email` is passed alongside `token_hash`:
    // the token_hash form identifies the user itself and adding the email
    // is treated as ambiguous input. Send only what the token_hash flow
    // wants — the type discriminator and the hash — and let GoTrue derive
    // the identity from the hash.
    const { error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: grant.tokenHash,
    });
    if (error) throw error;
  }

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    loading,
    requestCode: (email) => api.post<CodeSent>('/auth/admin/request-code', { email }),
    verifyCode: async (email, code) => {
      const grant = await api.post<SessionGrant>('/auth/admin/verify-code', { email, code });
      await completeGrant(grant);
    },
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
