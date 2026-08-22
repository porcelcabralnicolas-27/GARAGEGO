import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { StatCard } from '@/components/ui/StatCard';
import { getOwnerStats } from '@/features/stats/api';
import type { OwnerStats } from '@/features/stats/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function OwnerDashboardScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const walletBalance = useAuthStore((s) => s.walletBalance);

  const [stats, setStats] = useState<OwnerStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setErrorMessage(null);
    getOwnerStats(profile.id)
      .then(setStats)
      .catch(() => setErrorMessage('No se pudieron cargar las estadísticas.'));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScrollView>
        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 4 }]}>
          Hola{profile ? `, ${profile.firstName}` : ''}
        </Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 20 }]}>
          Resumen de tu actividad como propietario.
        </Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <View style={styles.grid}>
          <StatCard label="Saldo disponible" value={walletBalance !== null ? formatCurrency(walletBalance) : '—'} icon="wallet" />
          <StatCard label="Ganancias totales" value={stats ? formatCurrency(stats.totalEarnings) : '—'} icon="cash" />
          <StatCard label="Reservas pendientes" value={stats ? String(stats.pendingCount) : '—'} icon="time" />
          <StatCard label="Reservas confirmadas" value={stats ? String(stats.confirmedCount) : '—'} icon="checkmark-circle" />
          <StatCard
            label="Publicaciones activas"
            value={stats ? `${stats.activeListingsCount}/${stats.totalListingsCount}` : '—'}
            icon="business"
          />
          <StatCard
            label="Calificación promedio"
            value={stats?.averageRating != null ? stats.averageRating.toFixed(1) : 'Sin datos'}
            icon="star"
          />
        </View>

        <View style={styles.spacer} />

        <Button label="Ver mis publicaciones" variant="outlined" onPress={() => router.push('/(owner)/parkings')} />
        <View style={styles.spacerSmall} />
        <Button label="Ver reservas recibidas" variant="outlined" onPress={() => router.push('/(owner)/bookings')} />
        <View style={styles.spacerSmall} />
        <Button label="Ver estadísticas detalladas" variant="text" onPress={() => router.push('/(owner)/stats')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  spacer: {
    height: 12,
  },
  spacerSmall: {
    height: 12,
  },
});
