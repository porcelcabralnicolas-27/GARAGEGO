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
import {
  cancelBooking,
  completeBooking,
  getBookingErrorMessage,
  listReceivedBookings,
} from '@/features/booking/api';
import type { OwnerBookingItem } from '@/features/booking/types';
import { formatMoney } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/** Cuántas reservas se ven por sección antes de tener que tocar "Ver todo". */
const COLLAPSED_LIMIT = 3;

/**
 * Secciones de la pantalla, en orden de urgencia para el propietario. Cada reserva cae en
 * exactamente una.
 *
 * Ya no hay sección "Pendientes": desde la migración 0024 el pago deja la reserva confirmada
 * y el propietario no aprueba nada, así que el estado `pending` no se genera más. Las secciones
 * quedan espejando las del conductor, separando lo que está pasando ahora de lo que viene.
 *
 *   En curso     confirmed + ya iniciada por el conductor  (va destacada)
 *   Próximas     confirmed + todavía no iniciada
 *
 * Las finalizadas y las canceladas viven en la pantalla de historial, a la que se entra por el
 * ícono del encabezado: acá queda solo lo que está pasando o por pasar.
 */
const SECTION_DEFS = [
  {
    key: 'active',
    title: 'En curso',
    highlight: true,
    match: (b: OwnerBookingItem) => b.status === 'confirmed' && b.actualStartAt !== null,
  },
  {
    key: 'upcoming',
    title: 'Próximas',
    highlight: false,
    match: (b: OwnerBookingItem) => b.status === 'confirmed' && b.actualStartAt === null,
  },
] as const;

export default function OwnerBookingsScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [cancelTarget, setCancelTarget] = useState<OwnerBookingItem | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const {
    data: bookings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.bookings.receivedList(userId ?? ''),
    queryFn: () => listReceivedBookings(userId as string),
    enabled: Boolean(userId),
  });

  // Esta pantalla es el destino de "volver" desde cualquier pantalla que cambie una reserva: sin
  // este refetch, seguiría mostrando lo que había en cache hasta que venza el staleTime.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch])
  );

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

  const complete = useMutation({
    mutationFn: (booking: OwnerBookingItem) => completeBooking(booking.id),
    onSuccess: ({ overtimeMinutes, overtimeCharge }) => {
      if (overtimeCharge > 0) {
        setInfoMessage(`El cliente se quedó ${overtimeMinutes} min de más. Se le cobraron ${formatMoney(overtimeCharge)}.`);
      }
      reloadProfile();
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (error) => setErrorMessage(getBookingErrorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: (booking: OwnerBookingItem) => cancelBooking(booking.id),
    onSuccess: () => {
      setCancelTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (error) => {
      setCancelTarget(null);
      setErrorMessage(getBookingErrorMessage(error));
    },
  });

  const busyId = complete.isPending ? complete.variables?.id : cancel.isPending ? cancel.variables?.id : null;
  const visibleError = errorMessage ?? (isError ? 'No se pudieron cargar las reservas.' : null);

  return (
    <Screen>
      <ScreenHeader
        title="Reservas recibidas"
        action={
          <IconButton
            name="time-outline"
            accessibilityLabel="Ver historial de reservas"
            onPress={() => router.push('/(owner)/bookings/history')}
          />
        }
      />

      {visibleError ? <Banner message={visibleError} /> : null}
      {infoMessage ? <Banner message={infoMessage} variant="success" /> : null}

      {!isLoading && sections.length === 0 && !visibleError ? (
        <EmptyState
          icon="calendar-outline"
          title="No tenés reservas activas"
          description="Acá vas a ver las reservas en curso y las próximas. Las finalizadas están en el historial."
        />
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={() => {
          setErrorMessage(null);
          refetch();
        }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text
              style={[
                typography.label,
                styles.sectionTitle,
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
              item.status === 'confirmed' ? (
                <>
                  {/* Finalizar solo tiene sentido con el conductor ya adentro. Si todavía no
                      llegó, lo que corresponde es cancelar, no cerrar una sesión que no
                      empezó (y que dispararía el cobro del excedente). */}
                  {item.actualStartAt ? (
                    <Button
                      label="Finalizar"
                      size="compact"
                      onPress={() => {
                        setErrorMessage(null);
                        setInfoMessage(null);
                        complete.mutate(item);
                      }}
                      loading={busyId === item.id}
                      disabled={busyId !== null}
                    />
                  ) : null}
                  <Button
                    label="Cancelar"
                    size="compact"
                    variant="outlined"
                    onPress={() => setCancelTarget(item)}
                    disabled={busyId !== null}
                  />
                </>
              ) : undefined
            }
          />
        )}
      />

      <ConfirmDialog
        visible={cancelTarget !== null}
        title="Cancelar reserva"
        message="¿Seguro que querés cancelar esta reserva? Se reintegrará el monto al cliente."
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        loading={cancel.isPending}
        onConfirm={() => {
          if (!cancelTarget) return;
          setErrorMessage(null);
          cancel.mutate(cancelTarget);
        }}
        onCancel={() => setCancelTarget(null)}
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
