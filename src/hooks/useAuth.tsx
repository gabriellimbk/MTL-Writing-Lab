import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, requireSupabaseConfig, supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { isAnonymousUser } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isTeacher: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Check active sessions and sets up listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsTeacher(!!session?.user && !isAnonymousUser(session.user));
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsTeacher(!!session?.user && !isAnonymousUser(session?.user));
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string) => {
    requireSupabaseConfig();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/teacher'
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    requireSupabaseConfig();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isTeacher, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
