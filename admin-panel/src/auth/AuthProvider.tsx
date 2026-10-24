import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { configError, supabase } from '../lib/supabase';

/**
 * Lo único del panel que toca datos reales.
 *
 * Flujo: se inicia sesión contra Supabase Auth, después se lee la propia fila de `profiles` para
 * ver `is_admin`. Funciona sin políticas nuevas porque `profiles_select_all` (migración 0001) ya
 * es `using (true)` para autenticados.
 *
 * Si la persona existe pero no es admin, se cierra la sesión de verdad (`signOut`), no alcanza
 * con no mostrar el panel: dejar la sesión viva sería dejarle un token válido en el navegador.
 */

export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

type AuthContextValue = {
  user: AdminUser | null;
  /** `true` hasta resolver si hay sesión previa; evita el parpadeo del login al recargar. */
  isLoading: boolean;
  configError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Traduce los errores de Supabase, que vienen en inglés y son poco claros. */
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (message.includes('Email not confirmed')) return 'Esa cuenta todavía no confirmó su email.';
  if (message.toLowerCase().includes('failed to fetch')) {
    return 'No se pudo conectar con Supabase. Revisá la URL del proyecto y tu conexión.';
  }
  return message;
}

const NOT_ADMIN =
  'Esa cuenta no tiene acceso al panel de administración. Pedile a alguien del equipo que te habilite.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(configError === null);

  /** Lee el perfil y devuelve el admin, o null si no lo es. */
  const resolveAdmin = useCallback(async (session: Session): Promise<AdminUser | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, is_admin')
      .eq('id', session.user.id)
      .single();

    if (error || !data?.is_admin) return null;

    return {
      id: data.id as string,
      email: session.user.email ?? '',
      firstName: (data.first_name as string) ?? '',
      lastName: (data.last_name as string) ?? '',
    };
  }, []);

  // Sesión previa: al recargar la página Supabase la restaura desde localStorage, pero hay que
  // volver a chequear is_admin — puede haberse revocado desde la última vez.
  useEffect(() => {
    // Se captura en una const: el narrowing de `supabase` no sobrevive al callback asincrónico.
    const client = supabase;
    if (!client) return;
    let cancelled = false;

    client.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        setIsLoading(false);
        return;
      }
      const admin = await resolveAdmin(data.session);
      if (cancelled) return;
      if (!admin) await client.auth.signOut();
      setUser(admin);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [resolveAdmin]);

  const signIn = useCallback<AuthContextValue['signIn']>(
    async (email, password) => {
      if (!supabase) return { error: configError };

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: translateAuthError(error.message) };
      if (!data.session) return { error: 'No se pudo iniciar sesión.' };

      const admin = await resolveAdmin(data.session);
      if (!admin) {
        await supabase.auth.signOut();
        return { error: NOT_ADMIN };
      }

      setUser(admin);
      return { error: null };
    },
    [resolveAdmin]
  );

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, configError, signIn, signOut }),
    [user, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
