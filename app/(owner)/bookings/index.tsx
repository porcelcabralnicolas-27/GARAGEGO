import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { BookingCard } from '@/components/booking/BookingCard';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import {
  cancelBooking,
  completeBooking,
  confirmBooking,
  getBookingErrorMessage,
  listReceivedBookings,
} from '@/features/booking/api';
import type { OwnerBookingItem } from '@/features/booking/types';
import { formatMoney } from '@/lib/money';
import { useAuthStore } from '@/store/useAuthStore';
import { spacing, useTheme } from '@/theme';

/** Cuántas reservas se ven por sección antes de tener que tocar "Ver todo". */
const COLLAPSED_LIMIT = 3;

/**
 * Secciones de la pantalla, en orden de urgencia para el propietario. Cada reserva cae en
 * exactamente una: "Pendientes" es lo que espera su acción (confirmar), y va destacada.
 *
 *   Pendientes   pending (esperando que el propietario confirme)
 *   En curso     confirmed (acordada — próxima o ya iniciada por el cliente)
 *   Finalizadas  completed
 *   Canceladas   cancelled
 */
const SECTION_DEFS = [
  { key: 'pending', title: 'Pendientes', highlight: true, match: (b: OwnerBookingItem) => b.status === 'pending' },
  { key: 'active', title: 'En curso', highlight: false, match: (b: OwnerBookingItem) => b.status === 'confirmed' },
  { key: 'done', title: 'Finalizadas', highlight: false, match: (b: OwnerBookingItem) => b.status === 'completed' },
  { key: 'cancelled', title: 'Canceladas', highlight: false, match: (b: OwnerBookingItem) => b.status === 'cancelled' },
] as const;

export default function OwnerBookingsScreen() {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);

  const [bookings, setBookings] = useState<OwnerBookingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OwnerBookingItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listReceivedBookings(profile.id)
      .then(setBookings)
      .catch(() => setErrorMessage('No se pudieron cargar las reservas.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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

  const handleConfirm = async (booking: OwnerBookingItem) => {
    setBusyId(booking.id);
    setErrorMessage(null);
    try {
      await confirmBooking(booking.id);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (booking: OwnerBookingItem) => {
    setBusyId(booking.id);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const { overtimeMinutes, overtimeCharge } = await completeBooking(booking.id);
      if (overtimeCharge > 0) {
        setInfoMessage(`El cliente se quedó ${overtimeMinutes} min de más. Se le cobraron ${formatMoney(overtimeCharge)}.`);
      }
      reloadProfile();
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelBooking(cancelTarget.id);
      setCancelTarget(null);
      load();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
      setCancelTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Reservas recibidas" />

      {errorMessage ? <Banner message={errorMessage} /> : null}
      {infoMessage ? <Banner message={infoMessage} variant="success" /> : null}

      {!isLoading && bookings.length === 0 && !errorMessage ? (
        <EmptyState
          icon="calendar-outline"
          title="Todavía no recibiste ninguna reserva"
          description="Cuando alguien reserve en uno de tus estacionamientos, va a aparecer acá para que la confirmes."
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
              <>
                {item.status === 'pending' ? (
                  <Button
                    label="Confirmar"
                    size="compact"
                    onPress={() => handleConfirm(item)}
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                  />
                ) : null}
                {item.status === 'confirmed' ? (
                  <Button
                    label="Finalizar"
                    size="compact"
                    onPress={() => handleComplete(item)}
                    loading={busyId === item.id}
                    disabled={busyId !== null}
                  />
                ) : null}
                {item.status === 'pending' || item.status === 'confirmed' ? (
                  <Button
                    label="Cancelar"
                    size="compact"
                    variant="outlined"
                    onPress={() => setCancelTarget(item)}
                    disabled={busyId !== null}
                  />
                ) : null}
              </>
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
        loading={busyId === cancelTarget?.id}
        onConfirm={handleConfirmCancel}
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
