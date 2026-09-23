import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { formatMoney } from '@/lib/money';
import { getOwnerStats } from '@/features/stats/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerStatsScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const {
    data: stats,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.stats.owner(userId ?? ''),
    queryFn: () => getOwnerStats(userId as string),
    enabled: Boolean(userId),
  });

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

  const errorMessage = isError ? 'No se pudieron cargar las estadísticas.' : null;

  return (
    <Screen>
      <ScrollView>
        <ScreenHeader title="Estadísticas" backHref="/(owner)/dashboard" />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {stats ? (
          <>
            <Text style={[typography.titleMedium, { color: colors.onBackground, marginBottom: 8 }]}>
              Reservas por estado
            </Text>
            <View style={[styles.summaryRow, { borderColor: colors.outline }]}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>Confirmadas</Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{stats.confirmedCount}</Text>
            </View>
            <View style={[styles.summaryRow, { borderColor: colors.outline }]}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>En curso</Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{stats.activeSessionsCount}</Text>
            </View>
            <View style={[styles.summaryRow, { borderColor: colors.outline }]}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>Finalizadas</Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{stats.completedCount}</Text>
            </View>
            <View style={[styles.summaryRow, { borderColor: colors.outline }]}>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>Canceladas</Text>
              <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>{stats.cancelledCount}</Text>
            </View>

            <View style={styles.spacerLarge} />

            <Text style={[typography.titleMedium, { color: colors.onBackground, marginBottom: 8 }]}>
              Ganancias por estacionamiento
            </Text>
            {stats.revenueByLot.length === 0 ? (
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
                Todavía no tenés reservas finalizadas.
              </Text>
            ) : (
              stats.revenueByLot.map((lot) => (
                <View key={lot.parkingLotId} style={[styles.summaryRow, { borderColor: colors.outline }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodyMedium, { color: colors.onSurface }]} numberOfLines={1}>
                      {lot.name}
                    </Text>
                    <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
                      {lot.bookingsCount} {lot.bookingsCount === 1 ? 'reserva' : 'reservas'}
                    </Text>
                  </View>
                  <Text style={[typography.titleMedium, { color: colors.accent }]}>{formatMoney(lot.revenue)}</Text>
                </View>
              ))
            )}
          </>
        ) : !errorMessage ? (
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  spacerLarge: {
    height: 24,
  },
});
