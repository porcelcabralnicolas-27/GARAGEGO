import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureProfile, getProfile, getWalletBalance } from '@/features/profile/api';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/useAuthStore';

// Defaults del piloto de React Query (ver src/lib/queryKeys.ts).
//
// `staleTime` en 30 s: los datos que ya están en cache se muestran al instante al volver a una
// pantalla y se refrescan en segundo plano, en vez de mostrar un spinner cada vez. Un valor
// cortito porque casi todo (reservas, notificaciones) cambia seguido.
//
// `retry: 1` en vez de los 3 reintentos que trae por defecto: en un celular con mala señal,
// tres reintentos con espera exponencial hacen que el error tarde muchísimo en aparecer.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

function useAuthListener() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    // Sin .catch, un rechazo acá (AsyncStorage roto, refresh de token fallido) dejaba
    // setInitializing(false) sin ejecutarse nunca: useNavigationGuard corta mientras
    // isInitializing es true, así que la app quedaba colgada en el splash para siempre.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.error('No se pudo recuperar la sesión:', error);
        setSession(data.session);
      })
      .catch((error) => {
        console.error('No se pudo recuperar la sesión:', error);
        setSession(null);
      })
      .finally(() => setInitializing(false));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.subscription.unsubscribe();
  }, [setSession, setInitializing]);
}

function useProfileLoader() {
  const userId = useAuthStore((s) => s.session?.user.id);
  const profileRefreshKey = useAuthStore((s) => s.profileRefreshKey);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setProfileError = useAuthStore((s) => s.setProfileError);
  const setWalletBalance = useAuthStore((s) => s.setWalletBalance);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setWalletBalance(null);
      return;
    }

    // Guarda de cancelación: sin esto, cambiar de usuario (logout+login, o pisar sesión)
    // mientras la carga anterior seguía en vuelo podía hacer que la respuesta vieja
    // sobrescribiera el perfil/saldo de la cuenta nueva, o repoblara el perfil después de que
    // la rama `!userId` ya lo hubiera limpiado.
    let cancelled = false;

    setProfileError(null);
    ensureProfile()
      .catch((error) => console.error('No se pudo verificar/crear el perfil:', error))
      .then(() => Promise.all([getProfile(userId), getWalletBalance(userId)]))
      .then(([profile, balance]) => {
        if (cancelled) return;
        setProfile(profile);
        setWalletBalance(balance);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('No se pudo cargar el perfil:', error);
        setProfile(null);
        setWalletBalance(null);
        setProfileError(error instanceof Error ? error.message : 'No se pudo cargar tu perfil.');
      });

    return () => {
      cancelled = true;
    };
  }, [userId, profileRefreshKey, setProfile, setProfileError, setWalletBalance]);
}

function useNavigationGuard() {
  const segments = useSegments();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const passwordRecoveryInProgress = useAuthStore((s) => s.passwordRecoveryInProgress);

  useEffect(() => {
    if (isInitializing) return;
    // El código de recuperación abre una sesión antes de guardar la clave nueva: sin esto, el
    // guard vería "sesión + perfil dentro de (auth)" y mandaría al usuario al inicio a mitad
    // del cambio.
    if (passwordRecoveryInProgress) return;

    const group = segments[0];
    const inAuthGroup = group === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (!session) return;

    // Sin perfil todavía cargado: no se puede saber el rol real, no redirigir hasta tenerlo
    // (evita mandar a "cliente" por defecto a alguien cuyo rol activo es "propietario").
    if (!profile) return;

    const expectedGroup = profile.activeRole === 'owner' ? '(owner)' : '(client)';
    const isInRoleGroup = group === '(client)' || group === '(owner)';

    if (inAuthGroup || (isInRoleGroup && group !== expectedGroup)) {
      router.replace(profile.activeRole === 'owner' ? '/(owner)/parkings' : '/(client)');
    }
  }, [session, profile, segments, isInitializing, passwordRecoveryInProgress, router]);
}

export default function RootLayout() {
  // Inter se carga en runtime (no embebida en el build nativo) para no depender de un rebuild.
  // Si la carga falla, se sigue igual: React Native cae a la fuente del sistema y la app queda
  // usable, solo que con otra tipografía. Nunca dejamos la pantalla en blanco por una fuente.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useAuthListener();
  useProfileLoader();
  useNavigationGuard();

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* Con edge-to-edge (obligatorio en Android desde el SDK 54) la ventana ya no se achica
            al abrir el teclado: sin esto, el input de los chats quedaba tapado. */}
        <KeyboardProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }} />
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
