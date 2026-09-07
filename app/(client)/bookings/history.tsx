import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { hideBooking, listHiddenBookingIds, listMyBookings } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { listMyRatedBookingIds } from '@/features/rating/api';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/**
 * Historial del conductor: lo que ya terminó. La pantalla de "Mis reservas" queda solo con la
 * sesión activa y los lugares reservados, que es sobre lo que se puede actuar.
 *
 * "Calificar" vive acá y no en la lista principal porque solo se puede calificar una reserva
 * finalizada, y las finalizadas ya no aparecen allá.
 */
const SECTION_DEFS = [
  { key: 'completed', title: 'Finalizadas', match: (b: ClientBookingItem) => b.status === 'completed' },
  { key: 'cancelled', title: 'Canceladas', match: (b: ClientBookingItem) => b.status === 'cancelled' },
] as const;

export default function ClientBookingHistoryScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [bookings, setBookings] = useState<ClientBookingItem[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientBookingItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([listMyBookings(profile.id), listHiddenBookingIds(profile.id), listMyRatedBookingIds(profile.id)])
      .then(([bookingsResult, hidden, ratedIds]) => {
        setBookings(bookingsResult);
        setHiddenIds(hidden);
        setRatedBookingIds(ratedIds);
      })
      .catch(() => setErrorMessage('No se pudo cargar tu historial.'))
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
      <ScreenHeader title="Historial" backHref="/(client)/bookings" />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && sections.length === 0 && !errorMessage ? (
        <EmptyState
          icon="time-outline"
          title="Tu historial está vacío"
          description="Acá van a quedar tus reservas finalizadas y canceladas."
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
        renderItem={({ item }) => {
          const canRate = item.status === 'completed' && !ratedBookingIds.has(item.id);
          return (
            <BookingCard
              title={item.parkingLotName}
              subtitle={item.parkingLotAddress}
              date={item.date}
              startTime={item.startTime}
              endTime={item.endTime}
              totalPrice={item.totalPrice}
              status={item.status}
              actualStartAt={item.actualStartAt}
              overtimeMinutes={item.overtimeMinutes}
              overtimeCharge={item.overtimeCharge}
              onPress={() => router.push({ pathname: '/(client)/bookings/[id]', params: { id: item.id } })}
              actions={
                <>
                  {canRate ? <Button label="Calificar" size="compact" onPress={() => setRateTarget(item)} /> : null}
                  <Button
                    label="Borrar"
                    size="compact"
                    variant="outlined"
                    onPress={() => setDeleteTarget(item)}
                  />
                </>
              }
            />
          );
        }}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Borrar del historial"
        message="Esta reserva se saca de tu historial y no la vas a ver más. No afecta al propietario, que la sigue viendo en el suyo."
        confirmLabel="Borrar"
        cancelLabel="Volver"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {rateTarget && profile ? (
        <RateBookingDialog
          visible={rateTarget !== null}
          bookingId={rateTarget.id}
          parkingLotId={rateTarget.parkingLotId}
          userId={profile.id}
          parkingLotName={rateTarget.parkingLotName}
          onClose={() => setRateTarget(null)}
          onSuccess={() => {
            setRateTarget(null);
            load();
          }}
        />
      ) : null}
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
