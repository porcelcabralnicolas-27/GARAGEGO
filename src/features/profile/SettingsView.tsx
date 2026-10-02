import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { signOut } from '@/features/auth/api';
import { radius, shadows, spacing, useTheme } from '@/theme';

type Role = 'client' | 'owner';

type SettingsItem = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Sin destino, la tarjeta se muestra como "Próximamente" y no navega. */
  href?: Href;
};

// Grilla del Figma de Ajustes. El conductor tiene "Mis vehículos" en el lugar que el Figma
// le da a "Seguridad"; el propietario no maneja vehículos, así que en su lugar tiene
// "Seguridad".
const ITEMS: Record<Role, SettingsItem[]> = {
  client: [
    { key: 'vehicles', label: 'Mis vehículos', icon: 'car-outline', href: '/(client)/vehicles' },
    { key: 'support', label: 'Soporte y ayuda', icon: 'headset-outline', href: '/(client)/profile/support' },
    { key: 'legal', label: 'Legal', icon: 'document-text-outline', href: '/(client)/profile/legal' },
    { key: 'info', label: 'Información', icon: 'information-circle-outline', href: '/(client)/profile/info' },
  ],
  owner: [
    { key: 'security', label: 'Seguridad', icon: 'shield-checkmark-outline', href: '/(owner)/profile/security' },
    { key: 'support', label: 'Soporte y ayuda', icon: 'headset-outline', href: '/(owner)/profile/support' },
    { key: 'legal', label: 'Legal', icon: 'document-text-outline', href: '/(owner)/profile/legal' },
    { key: 'info', label: 'Información', icon: 'information-circle-outline', href: '/(owner)/profile/info' },
  ],
};

function SettingsCard({ item }: { item: SettingsItem }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const href = item.href;

  return (
    <Pressable
      onPress={href ? () => router.push(href) : undefined}
      disabled={!href}
      accessibilityRole="button"
      accessibilityLabel={href ? item.label : `${item.label}, próximamente`}
      style={({ pressed }) => [
        styles.card,
        shadows.card,
        { backgroundColor: colors.surface, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
        <Ionicons name={item.icon} size={30} color={colors.onSurface} />
      </View>
      <Text style={[typography.titleMedium, styles.cardLabel, { color: colors.onSurface }]}>
        {item.label.toUpperCase()}
      </Text>
      {!href ? (
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>Próximamente</Text>
      ) : null}
    </Pressable>
  );
}

export function SettingsView({ backHref, role }: { backHref: Href; role: Role }) {
  const { colors, typography } = useTheme();
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
      <ScrollView showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Ajustes" backHref={backHref} />

        <View style={styles.grid}>
          {ITEMS[role].map((item) => (
            <SettingsCard key={item.key} item={item} />
          ))}
        </View>

        <Button label="Cerrar sesión" onPress={handleSignOut} loading={isSigningOut} disabled={isSigningOut} fullWidth />

        {/* Todavía sin funcionalidad: solo el botón y el aviso. */}
        <View style={styles.deleteBlock}>
          <Button label="Eliminar cuenta" variant="danger" onPress={() => {}} fullWidth />
          <Text style={[typography.label, styles.deleteNote, { color: colors.onSurfaceVariant }]}>
            Esta acción es irreversible
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  card: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  cardLabel: {
    textAlign: 'center',
  },
  deleteBlock: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  deleteNote: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
