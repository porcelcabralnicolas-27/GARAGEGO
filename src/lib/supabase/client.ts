import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copia .env.example a .env y completa los valores. Las llamadas a Supabase fallarán hasta entonces.'
  );
}

export const supabase = createClient<Database>(supabaseUrl ?? 'https://placeholder.supabase.co', supabaseAnonKey ?? 'placeholder-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En web, Supabase completa el intercambio PKCE automáticamente leyendo el ?code de la URL
    // al volver del proveedor OAuth. En nativo no hay barra de URL, por eso se maneja a mano
    // (ver signInWithGoogle en features/auth/api.ts).
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
