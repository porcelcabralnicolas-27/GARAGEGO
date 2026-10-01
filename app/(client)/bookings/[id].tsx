import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BusinessTimeNote } from '@/components/booking/BusinessTimeNote';
import { DetailRow } from '@/components/booking/DetailRow';
import { ProgressRing } from '@/components/booking/ProgressRing';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import {
  completeBooking,
  getBookingErrorMessage,
  getClientBooking,
  startBooking,
} from '@/features/booking/api';
import { cancelBookingEndReminder, scheduleBookingEndReminder } from '@/features/booking/endReminder';
import type { ClientBookingItem } from '@/features/booking/types';
import { RateBookingDialog } from '@/features/rating/RateBookingDialog';
import { formatMoney } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { businessInstant, formatCalendarDate, formatDateTime } from '@/lib/time';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

/** Cuánto antes del horario reservado se habilita COMENZAR. Igual que en `start_booking`. */
const EARLY_WINDOW_MS = 15 * 60 * 1000;

/** Cada cuánto se refresca el contador y el anillo de progreso. */
const TICK_MS = 1000;

/**
 * `2d 20h 06m` / `5h 30m` / `12m 30s` / `45s`.
 *
 * Arranca por la unidad más grande que aplique y muestra dos: sin los días, una reserva para
 * dentro de tres días decía "68h 06m", que no se lee de un vistazo. Por debajo de un minuto
 * quedan los segundos solos.
 */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

// Pantallas 4-6 del Figma en una sola ruta. Son tres momentos de la misma reserva, no tres
// pantallas distintas: el estado sale de `status` + `actualStartAt`, así que separarlas en
// rutas obligaría a navegar entre ellas al tocar un botón en vez de simplemente recargar.
//
//   por iniciar   confirmed, sin actualStartAt  → COMENZAR + contador + "Cómo llegar"
//   en progreso   confirmed, con actualStartAt  → anillo de progreso + FINALIZAR
//   finalizada    completed                     → resumen + excedente + calificar
export default function BookingSessionScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAuthStore((s) => s.profile);
  const reloadProfile = useAuthStore((s) => s.reloadProfile);
  const queryClient = useQueryClient();

  const bookingQueryKey = queryKeys.bookings.detail(id);
  const {
    data: booking,
    isError: loadError,
    refetch: refetchBooking,
  } = useQuery({
    queryKey: bookingQueryKey,
    queryFn: () => getClientBooking(id),
  });

  const isRated = booking?.isRated ?? false;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // El reloj solo corre mientras hay algo que contar: una reserva ya finalizada o cancelada no
  // necesita repintarse cada segundo.
  const needsClock = booking?.status === 'confirmed';
  useEffect(() => {
    if (!needsClock) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [needsClock]);

  // Aviso en el celular 15 min antes del final: se programa mientras la reserva está en curso y
  // se cancela en cuanto deja de estarlo (finalizada por el conductor, el propietario o el cron).
  const reminderBookingId = booking?.id;
  const reminderActive = booking?.status === 'confirmed' && booking.actualStartAt !== null;
  const reminderEndsAt = booking ? businessInstant(booking.date, booking.endTime).getTime() : null;
  useEffect(() => {
    if (!reminderBookingId || reminderEndsAt === null) return;
    const task = reminderActive
      ? scheduleBookingEndReminder({ bookingId: reminderBookingId, endsAt: new Date(reminderEndsAt) })
      : cancelBookingEndReminder(reminderBookingId);
    task.catch(() => {});
  }, [reminderBookingId, reminderActive, reminderEndsAt]);

  const handleStart = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await startBooking(id);
      await refetchBooking();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinish = async () => {
    setShowFinishConfirm(false);
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const { overtimeMinutes, overtimeCharge } = await completeBooking(id);
      if (overtimeCharge > 0) {
        setErrorMessage(
          `Te pasaste ${overtimeMinutes} min del horario reservado. Se debitaron ${formatMoney(overtimeCharge)} de tu billetera.`
        );
      }
      reloadProfile();
      await refetchBooking();
    } catch (error) {
      setErrorMessage(getBookingErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader title="Reserva" backHref="/(client)/bookings" />
        <Banner message="No se pudo cargar esta reserva." />
      </Screen>
    );
  }

  if (!booking) {
    return (
      <Screen>
        <ScreenHeader title="Reserva" backHref="/(client)/bookings" />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  // La reserva está en hora de la cochera, igual que la valida `start_booking`: con la hora local
  // del teléfono, alguien en otra zona veía mal el contador y el botón se habilitaba a destiempo.
  const startsAt = businessInstant(booking.date, booking.startTime);
  const endsAt = businessInstant(booking.date, booking.endTime);
  const isStarted = booking.actualStartAt !== null;
  const isActive = booking.status === 'confirmed' && isStarted;
  const isPending = booking.status === 'confirmed' && !isStarted;
  const isFinished = booking.status === 'completed';

  const canStartAt = startsAt.getTime() - EARLY_WINDOW_MS;
  const canStartNow = now >= canStartAt && now <= endsAt.getTime();
  const startWindowOver = now > endsAt.getTime();

  // El progreso se mide sobre el horario reservado, no sobre la llegada real: lo que le
  // importa al conductor es cuánto le queda antes de que empiece a correr el excedente.
  const totalMs = endsAt.getTime() - startsAt.getTime();
  const elapsedMs = now - startsAt.getTime();
  const remainingMs = endsAt.getTime() - now;
  const progress = totalMs > 0 ? elapsedMs / totalMs : 0;
  const isOvertime = remainingMs < 0;

  const detailCard = (
    <Card>
      <DetailRow label="Lugar" value={booking.parkingLotName} />
      <DetailRow label="Dirección" value={booking.parkingLotAddress} />
      <DetailRow label="Fecha" value={formatCalendarDate(booking.date)} />
      <DetailRow label="Horario" value={`${booking.startTime.slice(0, 5)} – ${booking.endTime.slice(0, 5)}`} />
      <View style={[styles.divider, { backgroundColor: colors.outline }]} />
      <View style={styles.detailRow}>
        <Text style={[typography.titleMedium, { color: colors.onSurface }]}>Pagado</Text>
        <Text style={[typography.titleMedium, { color: colors.accent }]}>{formatMoney(booking.totalPrice)}</Text>
      </View>
    </Card>
  );

  return (
    <Screen>
      <ScrollView>
        <ScreenHeader title="Reserva" backHref="/(client)/bookings" />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <BusinessTimeNote />

        {/* ── Por iniciar ────────────────────────────────────────────────── */}
        {isPending ? (
          <>
            {detailCard}

            <View style={styles.centerBlock}>
              {startWindowOver ? (
                <Text style={[typography.bodyMedium, styles.centerText, { color: colors.error }]}>
                  El horario de esta reserva ya terminó.
                </Text>
              ) : canStartNow ? (
                <Text style={[typography.bodyMedium, styles.centerText, { color: colors.onSurfaceVariant }]}>
                  Ya podés comenzar tu estacionamiento.
                </Text>
              ) : (
                <>
                  <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>COMIENZA EN</Text>
                  <Text style={[typography.displayLarge, { color: colors.onSurface }]}>
                    {formatRemaining(startsAt.getTime() - now)}
                  </Text>
                  <Text style={[typography.bodyMedium, styles.centerText, { color: colors.onSurfaceVariant }]}>
                    El botón se habilita 15 minutos antes.
                  </Text>
                </>
              )}
            </View>

            <Button
              label="Comenzar"
              onPress={handleStart}
              loading={isBusy}
              disabled={isBusy || !canStartNow}
            />
            <View style={styles.buttonGap} />
            <Button
              label="Cómo llegar"
              variant="outlined"
              icon="navigate-outline"
              onPress={() =>
                router.push({
                  pathname: '/(client)/search/parking/[id]/route',
                  params: { id: booking.parkingLotId },
                })
              }
            />
          </>
        ) : null}

        {/* ── En progreso ────────────────────────────────────────────────── */}
        {isActive ? (
          <>
            <View style={styles.centerBlock}>
              <ProgressRing progress={progress}>
                <Ionicons name="car-sport" size={40} color={colors.accent} />
                <Text style={[typography.label, styles.ringLabel, { color: colors.onSurfaceVariant }]}>
                  {isOvertime ? 'TIEMPO EXCEDIDO' : 'TIEMPO RESTANTE'}
                </Text>
                <Text
                  style={[typography.displayLarge, { color: isOvertime ? colors.error : colors.onSurface }]}
                >
                  {formatRemaining(Math.abs(remainingMs))}
                </Text>
              </ProgressRing>

              {isOvertime ? (
                <Text style={[typography.bodyMedium, styles.centerText, { color: colors.error }]}>
                  Se está cobrando tiempo excedido. Finalizá para detener el cargo.
                </Text>
              ) : null}
            </View>

            {detailCard}

            <Button
              label="Finalizar estacionamiento"
              onPress={() => setShowFinishConfirm(true)}
              loading={isBusy}
              disabled={isBusy}
            />
          </>
        ) : null}

        {/* ── Finalizada ─────────────────────────────────────────────────── */}
        {isFinished ? (
          <>
            <View style={styles.centerBlock}>
              <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
                <Ionicons
                  name={isStarted ? 'checkmark-circle' : 'close-circle'}
                  size={20}
                  color={colors.onPrimaryContainer}
                />
                <Text style={[typography.label, { color: colors.onPrimaryContainer }]}>
                  {isStarted ? 'COMPLETADO' : 'NO SE PRESENTÓ'}
                </Text>
              </View>
              {!isStarted ? (
                <Text style={[typography.bodyMedium, styles.centerText, { color: colors.onSurfaceVariant }]}>
                  La reserva no se inició y se cerró automáticamente 15 minutos después del horario.
                </Text>
              ) : null}
            </View>

            {detailCard}

            {/* Registro de actividades del Figma. Sin descarga: Q11·A. */}
            <Card>
              <Text style={[typography.titleMedium, styles.cardHeading, { color: colors.onSurface }]}>
                Registro de actividades
              </Text>
              <DetailRow
                label="Entrada"
                value={booking.actualStartAt ? formatDateTime(booking.actualStartAt) : '—'}
              />
              <DetailRow
                label="Salida"
                value={booking.actualEndAt ? formatDateTime(booking.actualEndAt) : '—'}
              />
              {booking.overtimeCharge > 0 ? (
                <DetailRow
                  label="Tiempo excedido"
                  value={`${booking.overtimeMinutes} min · ${formatMoney(booking.overtimeCharge)}`}
                />
              ) : null}
            </Card>

            {/* Sin registro de entrada no se califica (lo exige también la 0066). */}
            {isStarted && !isRated ? (
              <>
                <Button label="Calificar" onPress={() => setShowRateDialog(true)} />
                <View style={styles.buttonGap} />
              </>
            ) : null}
            <Button
              label="Volver al inicio"
              variant="outlined"
              onPress={() => router.replace('/(client)')}
            />
          </>
        ) : null}

        {/* ── Cancelada / pendiente de aprobación (reservas viejas) ──────── */}
        {!isPending && !isActive && !isFinished ? (
          <>
            {detailCard}
            <Text style={[typography.bodyMedium, styles.centerText, { color: colors.onSurfaceVariant }]}>
              Esta reserva está {booking.status === 'cancelled' ? 'cancelada' : 'pendiente de aprobación'}.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={showFinishConfirm}
        title="Finalizar estacionamiento"
        message={
          isOvertime
            ? 'Te pasaste del horario reservado. Al finalizar se te va a cobrar el tiempo excedido.'
            : '¿Terminaste de usar el lugar? Una vez finalizada, la reserva se cierra.'
        }
        confirmLabel="Finalizar"
        cancelLabel="Volver"
        loading={isBusy}
        onConfirm={handleFinish}
        onCancel={() => setShowFinishConfirm(false)}
      />

      {profile ? (
        <RateBookingDialog
          visible={showRateDialog}
          bookingId={booking.id}
          parkingLotId={booking.parkingLotId}
          userId={profile.id}
          parkingLotName={booking.parkingLotName}
          onClose={() => setShowRateDialog(false)}
          onSuccess={() => {
            setShowRateDialog(false);
            queryClient.setQueryData<ClientBookingItem>(bookingQueryKey, (current) =>
              current ? { ...current, isRated: true } : current
            );
            // El historial y la ficha pública de la cochera también muestran la calificación.
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
            queryClient.invalidateQueries({ queryKey: queryKeys.parkingLots.all });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  cardHeading: {
    marginBottom: spacing.md,
  },
  centerBlock: {
    alignItems: 'center',
    marginVertical: spacing.xl,
    gap: spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  ringLabel: {
    marginTop: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  buttonGap: {
    height: spacing.md,
  },
});
