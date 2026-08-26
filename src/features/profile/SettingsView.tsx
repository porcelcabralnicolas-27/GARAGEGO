import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { signOut } from '@/features/auth/api';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export function SettingsView({ backHref }: { backHref: Href }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Screen>
      <BackHeader href={backHref} />

      <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 20 }]}>Ajustes</Text>

      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Cuenta</Text>
      <Button
        label="Mis vehículos"
        variant="outlined"
        onPress={() => router.push(profile?.activeRole === 'owner' ? '/(owner)/vehicles' : '/(client)/vehicles')}
      />

      <View style={styles.spacerLarge} />

      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Notificaciones</Text>
      <View style={[styles.placeholderCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}>
        <Ionicons name="notifications-outline" size={20} color={colors.onSurfaceVariant} />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginLeft: 10, flex: 1 }]}>
          Notificaciones push — próximamente
        </Text>
      </View>

      <View style={styles.spacerLarge} />

      <Button label="Cerrar sesión" variant="text" onPress={handleSignOut} loading={isSigningOut} disabled={isSigningOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  spacerLarge: {
    height: 24,
  },
});
