import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Flag } from '@/components/ui/Flag';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { signOut } from '@/features/auth/api';
import {
  deleteAccount,
  getAccountDeletionCheck,
  getAccountDeletionErrorMessage,
  type AccountDeletionCheck,
} from '@/features/profile/api';
import { useRegion } from '@/hooks/useRegion';
import { t } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
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
      accessibilityLabel={href ? t(item.label) : `${t(item.label)}, ${t('próximamente')}`}
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
        {t(item.label).toUpperCase()}
      </Text>
      {!href ? (
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{t('Próximamente')}</Text>
      ) : null}
    </Pressable>
  );
}

/** Fila de país/región (demo regional, 0086), como el selector de país de las tiendas online. */
function RegionRow({ role }: { role: Role }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const region = useRegion();

  return (
    <Pressable
      onPress={() => router.push(role === 'client' ? '/(client)/profile/region' : '/(owner)/profile/region')}
      accessibilityRole="button"
      accessibilityLabel={`${t('País/región')}: ${t(region.label)}`}
      style={({ pressed }) => [
        styles.regionRow,
        shadows.card,
        { backgroundColor: colors.surface, borderColor: colors.outline, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={styles.regionBody}>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{t('País/región')}</Text>
        <View style={styles.regionValue}>
          <Flag region={region.code} size={26} />
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{t(region.label)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

/** Texto del diálogo de eliminar cuenta según lo que devolvió el chequeo previo. */
function deletionDialogText(check: AccountDeletionCheck): { blocked: boolean; title: string; message: string } {
  if (check.driverBookings + check.ownerBookings > 0) {
    const parts: string[] = [];
    if (check.driverBookings > 0) {
      parts.push(t('Reservas tuyas activas o próximas: {count}.', { count: check.driverBookings }));
    }
    if (check.ownerBookings > 0) {
      parts.push(t('Reservas activas o próximas en tus cocheras: {count}.', { count: check.ownerBookings }));
    }
    return {
      blocked: true,
      title: t('Todavía no podés eliminar tu cuenta'),
      message: `${parts.join(' ')} ${t('Cuando terminen o se cancelen, vas a poder eliminarla.')}`,
    };
  }
  const balance =
    check.walletBalance > 0
      ? ` ${t('Vas a perder el saldo de tu billetera ({amount}).', { amount: formatMoney(check.walletBalance) })}`
      : '';
  return {
    blocked: false,
    title: t('¿Eliminar tu cuenta?'),
    message:
      t(
        'Se borran tus datos personales y tus vehículos, y tus publicaciones dejan de aparecer. Las reservas pasadas y los movimientos de dinero se conservan sin tu nombre, porque la otra parte los necesita.'
      ) +
      balance +
      ` ${t('No se puede deshacer.')}`,
  };
}

export function SettingsView({ backHref, role }: { backHref: Href; role: Role }) {
  const { colors, typography } = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionCheck, setDeletionCheck] = useState<AccountDeletionCheck | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Primero se pregunta al servidor si hay algo que lo impida, así no se pide confirmar algo
  // que después va a fallar.
  const handleDeletePress = async () => {
    setDeleteError(null);
    setIsChecking(true);
    try {
      setDeletionCheck(await getAccountDeletionCheck());
    } catch (error) {
      setDeleteError(getAccountDeletionErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      // Al cerrarse la sesión, el layout raíz lleva solo al inicio de sesión.
      await deleteAccount();
    } catch (error) {
      setDeletionCheck(null);
      setDeleteError(getAccountDeletionErrorMessage(error));
      setIsDeleting(false);
    }
  };

  const dialog = deletionCheck ? deletionDialogText(deletionCheck) : null;

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
        <ScreenHeader title={t('Ajustes')} backHref={backHref} />

        <RegionRow role={role} />

        <View style={styles.grid}>
          {ITEMS[role].map((item) => (
            <SettingsCard key={item.key} item={item} />
          ))}
        </View>

        <Button label={t('Cerrar sesión')} onPress={handleSignOut} loading={isSigningOut} disabled={isSigningOut} fullWidth />

        {deleteError ? (
          <View style={styles.deleteError}>
            <Banner message={deleteError} />
          </View>
        ) : null}

        <View style={styles.deleteBlock}>
          {/* Chico y centrado, a propósito: tiene que costar más tocarlo que "Cerrar sesión". El
              bloque se ajusta a su contenido más ancho (el aviso) y el botón lo ocupa entero. */}
          <Button
            label={t('Eliminar cuenta')}
            variant="danger"
            size="compact"
            onPress={handleDeletePress}
            loading={isChecking}
            disabled={isChecking || isDeleting}
            fullWidth
          />
          <Text style={[typography.label, styles.deleteNote, { color: colors.onSurfaceVariant }]}>
            {t('Esta acción es irreversible')}
          </Text>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel={dialog?.blocked ? t('Entendido') : t('Eliminar mi cuenta')}
        hideCancel={dialog?.blocked}
        loading={isDeleting}
        onConfirm={dialog?.blocked ? () => setDeletionCheck(null) : handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeletionCheck(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  regionBody: {
    flex: 1,
    gap: spacing.xs,
  },
  regionValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
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
    // `center` hace que el bloque mida lo que su hijo más ancho: el botón y el aviso quedan iguales.
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  deleteError: {
    marginTop: spacing.md,
  },
  deleteNote: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
