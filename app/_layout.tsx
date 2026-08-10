import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

function useNavigationGuard() {
  const segments = useSegments();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const hasNavigatedOnce = useRef(false);

  useEffect(() => {
    if (isInitializing) return;

    const group = segments[0];
    const inAuthGroup = group === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    if (session && inAuthGroup) {
      const role = profile?.currentRole ?? 'client';
      router.replace(role === 'owner' ? '/(owner)/dashboard' : '/(client)');
      return;
    }

    hasNavigatedOnce.current = true;
  }, [session, profile, segments, isInitializing, router]);
}

export default function RootLayout() {
  useAuthListener();
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
