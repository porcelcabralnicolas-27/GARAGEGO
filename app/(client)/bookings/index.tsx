import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { cancelBooking, getBookingErrorMessage, listMyBookings } from '@/features/booking/api';
import type { ClientBookingItem } from '@/features/booking/types';
import { queryKeys } from '@/lib/queryKeys';
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
 *   Pendientes          pending (solo reservas viejas — ver abajo)
 *
 * Las finalizadas y las canceladas NO están acá: viven en la pantalla de historial, a la que
 * se entra por el ícono del encabezado. Esta pantalla queda solo con lo que está en curso o
 * por venir, que es sobre lo que el conductor puede actuar.
 *
 * "Pendientes" ya no se genera: desde la migración 0024 el pago deja la reserva confirmada.
 * La sección se mantiene igual para no esconder las reservas que quedaron en ese estado de
 * antes (la 0025 las promueve, pero mientras no se corra tienen que seguir siendo visibles).
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
] as const;

export default function MyBookingsScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [cancelTarget, setCancelTarget] = useState<ClientBookingItem | null>(null);
  const [lockedCancelTarget, setLockedCancelTarget] = useState<ClientBookingItem | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.bookings.myList(userId ?? ''),
    queryFn: () => listMyBookings(userId as string),
    enabled: Boolean(userId),
  });

  // Esta pantalla es el destino de "volver" desde el detalle de una reserva (iniciar, finalizar,
  // cancelar) y desde el pago de una nueva: sin este refetch, seguiría mostrando lo que había en
  // cache hasta que venza el staleTime, en vez de reflejar la acción que se acaba de hacer.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
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

  // Un solo lugar para el mensaje de error, sea de la carga o de cancelar: como en el resto de
  // las pantallas ya migradas, no hace falta duplicar el estado de React Query en uno propio.
  const [mutationErrorMessage, setMutationError] = useState<string | null>(null);
  const errorMessage = mutationErrorMessage ?? (isError ? 'No se pudieron cargar tus reservas.' : null);

  const cancel = useMutation({
    mutationFn: (booking: ClientBookingItem) => cancelBooking(booking.id),
    onSuccess: () => {
      setCancelTarget(null);
      reloadProfile();
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (error) => {
      setCancelTarget(null);
      setMutationError(getBookingErrorMessage(error));
    },
  });

  return (
    <Screen>
      <ScreenHeader
        title="Mis reservas"
        action={
          <IconButton
            name="time-outline"
            accessibilityLabel="Ver historial de reservas"
            onPress={() => router.push('/(client)/bookings/history')}
          />
        }
      />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && sections.length === 0 && !errorMessage ? (
        <EmptyState
          icon="calendar-outline"
          title="No tenés reservas activas"
          description="Acá vas a ver tu sesión en curso y los lugares que tengas reservados. Las finalizadas están en el historial."
          actionLabel="Buscar estacionamientos"
          onAction={() => router.push('/(client)/search')}
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => {
          setMutationError(null);
          refetch();
        }}
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
              // Iniciar y finalizar viven en el detalle: ahí están el contador, la ventana
              // horaria y el anillo de progreso, que no entran en una tarjeta de lista.
              onPress={() => router.push({ pathname: '/(client)/bookings/[id]', params: { id: item.id } })}
              actions={
                canCancel ? (
                  <Button
                    label="Cancelar"
                    size="compact"
                    variant="outlined"
                    // El botón sigue visible aunque ya no se pueda cancelar: al tocarlo
                    // aparece el cartel que explica por qué, en vez de un botón muerto.
                    onPress={() =>
                      isCancelLocked(item, new Date()) ? setLockedCancelTarget(item) : setCancelTarget(item)
                    }
                  />
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
        loading={cancel.isPending}
        onConfirm={() => {
          if (!cancelTarget) return;
          setMutationError(null);
          cancel.mutate(cancelTarget);
        }}
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
