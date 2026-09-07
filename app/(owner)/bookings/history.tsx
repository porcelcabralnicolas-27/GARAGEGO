import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { hideBooking, listHiddenBookingIds, listReceivedBookings } from '@/features/booking/api';
import type { OwnerBookingItem } from '@/features/booking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/**
 * Historial del propietario: las reservas de sus cocheras que ya terminaron. La pantalla de
 * "Reservas recibidas" queda solo con las que están en curso o por venir.
 *
 * El "Borrar" oculta la reserva solo para él: el conductor la sigue viendo en su propio
 * historial y no se toca ningún registro de plata. Ver la migración 0031.
 */
const SECTION_DEFS = [
  { key: 'done', title: 'Finalizadas', match: (b: OwnerBookingItem) => b.status === 'completed' },
  { key: 'cancelled', title: 'Canceladas', match: (b: OwnerBookingItem) => b.status === 'cancelled' },
] as const;

export default function OwnerBookingHistoryScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [bookings, setBookings] = useState<OwnerBookingItem[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerBookingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([listReceivedBookings(profile.id), listHiddenBookingIds(profile.id)])
      .then(([bookingsResult, hidden]) => {
        setBookings(bookingsResult);
        setHiddenIds(hidden);
      })
      .catch(() => setErrorMessage('No se pudo cargar el historial.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sections = useMemo(
    () =>
      SECTION_DEFS.map((def) => ({
        key: def.key,
        title: def.title,
        data: bookings.filter((b) => def.match(b) && !hiddenIds.has(b.id)),
      })).filter((section) => section.data.length > 0),
    [bookings, hiddenIds]
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !profile) return;
    setIsDeleting(true);
    try {
      await hideBooking(deleteTarget.id, profile.id);
      // Se saca de la lista en el acto en vez de recargar: el resultado es el mismo y evita
      // el parpadeo de toda la pantalla por borrar una fila.
      setHiddenIds((current) => new Set(current).add(deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setErrorMessage('No se pudo borrar la reserva del historial.');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Historial" backHref="/(owner)/bookings" />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && sections.length === 0 && !errorMessage ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar las reservas finalizadas y canceladas de tus estacionamientos."
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={[typography.label, styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => (
          <BookingCard
            title={item.parkingLotName}
            subtitle={item.clientName}
            date={item.date}
            startTime={item.startTime}
            endTime={item.endTime}
            totalPrice={item.totalPrice}
            status={item.status}
            actualStartAt={item.actualStartAt}
            vehicleLabel={item.vehicle ? [item.vehicle.plate, item.vehicle.brand].filter(Boolean).join(' · ') : null}
            overtimeMinutes={item.overtimeMinutes}
            overtimeCharge={item.overtimeCharge}
            actions={
              <Button
                label="Borrar"
                size="compact"
                variant="outlined"
                onPress={() => setDeleteTarget(item)}
              />
            }
          />
        )}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Borrar del historial"
        message="Esta reserva se saca de tu historial y no la vas a ver más. No afecta al conductor, que la sigue viendo en el suyo."
        confirmLabel="Borrar"
        cancelLabel="Volver"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
