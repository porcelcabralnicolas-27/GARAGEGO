import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { cancelBooking, getBookingErrorMessage, listMyBookings, startBooking } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { listMyRatedBookingIds } from '@/features/rating/api';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/** Ventana mínima de antelación para que el cliente pueda cancelar una reserva ya aprobada. */
const CANCEL_LOCK_MS = 60 * 60 * 1000;

/** Cuántas reservas se ven por sección antes de tener que tocar "Ver todo". */
const COLLAPSED_LIMIT = 3;

/**
 * Una reserva confirmada ya no se puede cancelar cuando falta menos de una hora para el inicio.
 * Las pendientes de aprobación se pueden cancelar siempre. La regla real la impone la RPC
 * cancel_booking; esto es solo para avisar antes de que el usuario intente.
 */
function isCancelLocked(booking: ClientBookingItem, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  const startsAt = new Date(`${booking.date}T${booking.startTime}`);
  return startsAt.getTime() - now.getTime() < CANCEL_LOCK_MS;
}

/**
 * Las secciones de la pantalla, en orden de urgencia. Se derivan de los cuatro estados que
 * maneja el modelo (`pending | confirmed | cancelled | completed`) más `actualStartAt`, que es
 * lo que separa una reserva ya confirmada de una que además ya arrancó:
 *
 *   Sesión activa       confirmed + ya iniciada
 *   Lugares reservados  confirmed + todavía no iniciada
 *   Pendientes          pending (esperando que el propietario apruebe)
 *   Sesiones completadas completed
 *   Canceladas          cancelled
 *
 * Cada reserva cae en exactamente una, así que ninguna se pierde ni aparece dos veces.
 */
const SECTION_DEFS = [
  {
    key: 'active',
    title: 'Sesión activa',
    highlight: true,
    match: (b: ClientBookingItem) => b.status === 'confirmed' && b.actualStartAt !== null,
  },
  {
    key: 'reserved',
    title: 'Lugares reservados',
    highlight: false,
    match: (b: ClientBookingItem) => b.status === 'confirmed' && b.actualStartAt === null,
  },
  {
    key: 'pending',
    title: 'Pendientes',
    highlight: false,
    match: (b: ClientBookingItem) => b.status === 'pending',
  },
  {
    key: 'completed',
    title: 'Sesiones completadas',
    highlight: false,
    match: (b: ClientBookingItem) => b.status === 'completed',
  },
  {
    key: 'cancelled',
    title: 'Canceladas',
    highlight: false,
    match: (b: ClientBookingItem) => b.status === 'cancelled',
  },
] as const;

export default function MyBookingsScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [bookings, setBookings] = useState<ClientBookingItem[]>([]);
  const [ratedBookingIds, setRatedBookingIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ClientBookingItem | null>(null);
  const [lockedCancelTarget, setLockedCancelTarget] = useState<ClientBookingItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [rateTarget, setRateTarget] = useState<ClientBookingItem | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    Promise.all([listMyBookings(profile.id), listMyRatedBookingIds(profile.id)])
      .then(([bookingsResult, ratedIds]) => {
        setBookings(bookingsResult);
        setRatedBookingIds(ratedIds);
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus reservas.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Las secciones vacías no se muestran. "Ver todo" recorta a los primeros COLLAPSED_LIMIT en
  // vez de navegar a otra pantalla: no existe una ruta por estado y la lista completa ya está
  // cargada en memoria, así que expandir en el lugar no cuesta una consulta más.
  const sections = useMemo(
    () =>
      SECTION_DEFS.map((def) => {
        const all = bookings.filter(def.match);
        const isExpanded = expandedKeys.has(def.key);
        return {
          key: def.key,
          title: def.title,
          highlight: def.highlight,
          totalCount: all.length,
          isExpanded,
          data: isExpanded ? all : all.slice(0, COLLAPSED_LIMIT),
        };
      }).filter((section) => section.totalCount > 0),
    [bookings, expandedKeys]
  );

  const toggleSection = (key: string) => {
    setExpandedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleStart = async (booking: ClientBookingItem) => {
    setStartingId(booking.id);
    setErrorMessage(null);
    try {
      await startBooking(booking.id);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setStartingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      reloadProfile();
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
      setCancelTarget(null);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Mis reservas" />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && bookings.length === 0 && !errorMessage ? (
        <EmptyState
          icon="calendar-outline"
          title="Todavía no hiciste ninguna reserva"
          description="Buscá un estacionamiento cerca tuyo y reservá tu lugar."
          actionLabel="Buscar estacionamientos"
          onAction={() => router.push('/(client)/search')}
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text
              style={[
                typography.label,
                styles.sectionTitle,
                // La sesión activa va destacada en color de marca, como en el Figma; el resto
                // de los encabezados son gris secundario.
                { color: section.highlight ? colors.accent : colors.onSurfaceVariant },
              ]}
            >
              {section.title.toUpperCase()}
            </Text>

            {section.totalCount > COLLAPSED_LIMIT ? (
              <Pressable
                onPress={() => toggleSection(section.key)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  section.isExpanded
                    ? `Ver menos de ${section.title}`
                    : `Ver las ${section.totalCount} reservas de ${section.title}`
                }
              >
                <Text style={[typography.label, { color: colors.accent }]}>
                  {section.isExpanded ? 'VER MENOS' : 'VER TODO'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => {
          const canCancel = item.status === 'pending' || item.status === 'confirmed';
          const canStart = item.status === 'confirmed' && !item.actualStartAt;
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
              actions={
                canStart || canCancel || canRate ? (
                  <>
                    {canStart ? (
                      <Button
                        label="Iniciar"
                        size="compact"
                        onPress={() => handleStart(item)}
                        loading={startingId === item.id}
                        disabled={startingId !== null}
                      />
                    ) : null}
                    {canCancel ? (
                      <Button
                        label="Cancelar"
                        size="compact"
                        variant="outlined"
                        // El botón sigue visible aunque ya no se pueda cancelar: al tocarlo
                        // aparece el cartel que explica por qué, en vez de un botón muerto.
                        onPress={() =>
                          isCancelLocked(item, new Date()) ? setLockedCancelTarget(item) : setCancelTarget(item)
                        }
                        disabled={startingId !== null}
                      />
                    ) : null}
                    {canRate ? <Button label="Calificar" size="compact" onPress={() => setRateTarget(item)} /> : null}
                  </>
                ) : undefined
              }
            />
          );
        }}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar reserva"
        message={
          cancelTarget?.status === 'confirmed'
            ? '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo. Tené en cuenta que vas a poder cancelarla hasta 1 hora antes del inicio.'
            : '¿Seguro que querés cancelar esta reserva? El monto pagado se te reintegrará a tu saldo.'
        }
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        loading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        visible={lockedCancelTarget !== null}
        title="Ya no se puede cancelar"
        message="Falta menos de 1 hora para que empiece esta reserva, así que ya no se puede cancelar. Si no vas a poder ir, escribile al propietario por el chat."
        confirmLabel="Entendido"
        hideCancel
        onConfirm={() => setLockedCancelTarget(null)}
        onCancel={() => setLockedCancelTarget(null)}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    letterSpacing: 1,
  },
});
