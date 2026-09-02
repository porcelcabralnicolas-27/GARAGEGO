import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { formatMoney } from '@/lib/money';
import { listRecentTransactions, type WalletTransaction } from '@/features/profile/api';
import { getOwnerStats } from '@/features/stats/api';
import type { OwnerStats } from '@/features/stats/types';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, shadows, spacing, useTheme } from '@/theme';

const TX_LABELS: Record<WalletTransaction['type'], string> = {
  topup: 'Recarga',
  booking_payment: 'Pago de reserva',
  refund: 'Reintegro',
  adjustment: 'Ajuste',
  overtime_charge: 'Cargo por excedente',
};

const TX_ICONS: Record<WalletTransaction['type'], keyof typeof Ionicons.glyphMap> = {
  topup: 'arrow-down-circle-outline',
  booking_payment: 'card-outline',
  refund: 'arrow-undo-outline',
  adjustment: 'options-outline',
  overtime_charge: 'time-outline',
};

function formatTxDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const walletBalance = useAuthStore((s) => s.walletBalance);

  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setErrorMessage(null);
    Promise.all([getOwnerStats(profile.id), listRecentTransactions(profile.id)])
      .then(([statsResult, txResult]) => {
        setStats(statsResult);
        setTransactions(txResult);
      })
      .catch(() => setErrorMessage('No se pudo cargar tu panel.'));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tiles = [
    { icon: 'checkmark-circle-outline' as const, value: stats ? String(stats.confirmedCount) : '—', label: 'Reservas confirmadas' },
    { icon: 'business-outline' as const, value: stats ? String(stats.activeListingsCount) : '—', label: 'Publicaciones activas' },
    { icon: 'time-outline' as const, value: stats ? String(stats.pendingCount) : '—', label: 'Reservas pendientes' },
  ];

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: spacing.xs }]}>
          Hola{profile ? `, ${profile.firstName}` : ''}
        </Text>
        <Text style={[typography.bodyMedium, styles.subtitle, { color: colors.onSurfaceVariant }]}>
          Resumen de tu actividad como propietario.
        </Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {/* Saldo disponible + retiro */}
        <View style={[styles.balanceCard, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={[typography.label, styles.balanceLabel, { color: colors.onSurfaceVariant }]}>
            SALDO DISPONIBLE
          </Text>
          <Text style={[typography.displayLarge, { color: colors.accent }]}>
            {walletBalance !== null ? formatMoney(walletBalance) : '—'}
          </Text>
          <View style={styles.withdrawWrap}>
            {/* El retiro de fondos todavía no existe (no hay función de payout y la billetera
                del propietario aún no se acredita — ver Q10 del documento de pagos). */}
            <Button label="Retiro de fondos" onPress={() => {}} disabled fullWidth />
            <Text style={[typography.label, styles.withdrawNote, { color: colors.onSurfaceVariant }]}>
              Próximamente
            </Text>
          </View>
        </View>

        {/* Tiles */}
        <View style={styles.tileRow}>
          {tiles.map((tile) => (
            <View
              key={tile.label}
              style={[styles.tile, shadows.card, { backgroundColor: colors.surface }]}
            >
              <Ionicons name={tile.icon} size={20} color={colors.onSurfaceVariant} />
              <Text style={[typography.titleLarge, styles.tileValue, { color: colors.accent }]}>{tile.value}</Text>
              <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{tile.label}</Text>
            </View>
          ))}
        </View>

        {/* Calificación promedio */}
        <Card padding="md" spaced>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={18} color={colors.accent} />
            <Text style={[typography.bodyLarge, styles.ratingLabel, { color: colors.onSurface }]}>
              Calificación promedio
            </Text>
            <Text style={[typography.titleMedium, { color: colors.onSurface }]}>
              {stats?.averageRating != null ? `${stats.averageRating.toFixed(1)} / 5` : 'Sin datos'}
            </Text>
          </View>
        </Card>

        {/* Pagos recientes */}
        <View style={styles.sectionHeader}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Pagos recientes</Text>
          <Pressable
            onPress={() => router.push('/(owner)/stats')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Ver todas las estadísticas"
          >
            <Text style={[typography.label, { color: colors.accent }]}>VER TODO</Text>
          </Pressable>
        </View>

        {transactions.length === 0 ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Todavía no hay movimientos en tu billetera.
          </Text>
        ) : (
          transactions.map((tx) => (
            <Card key={tx.id} padding="md" spaced>
              <View style={styles.txRow}>
                <View style={[styles.txIcon, { backgroundColor: colors.surfaceVariant }]}>
                  <Ionicons name={TX_ICONS[tx.type]} size={18} color={colors.onSurfaceVariant} />
                </View>
                <View style={styles.txBody}>
                  <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{TX_LABELS[tx.type]}</Text>
                  <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{formatTxDate(tx.createdAt)}</Text>
                </View>
                <Text
                  style={[
                    typography.titleMedium,
                    { color: tx.amount >= 0 ? colors.accent : colors.onSurface },
                  ]}
                >
                  {formatMoney(tx.amount)}
                </Text>
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    marginBottom: spacing.lg,
  },
  balanceCard: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  withdrawWrap: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  withdrawNote: {
    marginTop: spacing.xs,
  },
  tileRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  tileValue: {
    marginTop: spacing.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ratingLabel: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txBody: {
    flex: 1,
  },
});
