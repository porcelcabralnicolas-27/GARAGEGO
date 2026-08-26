import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ensureProfile, getProfile, getWalletBalance } from '@/features/profile/api';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/useAuthStore';

const queryClient = new QueryClient();

function useAuthListener() {
  const setSession = useAuthStore((s) => s.setSession);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

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

    setProfileError(null);
    ensureProfile()
      .catch((error) => console.error('No se pudo verificar/crear el perfil:', error))
      .then(() => Promise.all([getProfile(userId), getWalletBalance(userId)]))
      .then(([profile, balance]) => {
        setProfile(profile);
        setWalletBalance(balance);
      })
      .catch((error) => {
        console.error('No se pudo cargar el perfil:', error);
        setProfile(null);
        setWalletBalance(null);
        setProfileError(error instanceof Error ? error.message : 'No se pudo cargar tu perfil.');
      });
  }, [userId, profileRefreshKey, setProfile, setProfileError, setWalletBalance]);
}

function useNavigationGuard() {
  const segments = useSegments();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  useEffect(() => {
    if (isInitializing) return;

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
      router.replace(profile.activeRole === 'owner' ? '/(owner)/dashboard' : '/(client)');
    }
  }, [session, profile, segments, isInitializing, router]);
}

export default function RootLayout() {
  useAuthListener();
  useProfileLoader();
  useNavigationGuard();

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
