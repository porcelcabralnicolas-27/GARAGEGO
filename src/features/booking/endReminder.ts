import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Avisos en el celular de las reservas. Son notificaciones locales: las programa este
// dispositivo, así que suenan aunque la app esté cerrada. El servidor manda además las de la
// lista de Notificaciones (send_booking_end_reminders, 0066, y send_booking_day_before_reminders,
// 0068), que son las que llegan aunque se haya reinstalado la app.
//
//   fin de reserva    15 minutos antes del final de una sesión en curso
//   día antes         24 horas antes del inicio de una reserva futura

const END_LEAD_MS = 15 * 60 * 1000;
const DAY_BEFORE_LEAD_MS = 24 * 60 * 60 * 1000;
const CHANNEL_ID = 'booking-reminders';
const END_PREFIX = 'booking-end-';
const DAY_BEFORE_PREFIX = 'booking-start-';

export type ActiveBookingReminder = { bookingId: string; endsAt: Date };
export type UpcomingBookingReminder = { bookingId: string; startsAt: Date; placeName: string };

let setupDone = false;

async function ensureSetup(): Promise<boolean> {
  if (!setupDone) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    // En Android 13+ el pedido de permiso no aparece hasta que exista un canal.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Recordatorios de reservas',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    setupDone = true;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/** Programa (o reprograma) una notificación para `fireAt`. Si ese momento ya pasó, no hace nada. */
async function scheduleAt(
  identifier: string,
  fireAt: Date,
  content: { title: string; body: string; bookingId: string }
): Promise<void> {
  if (fireAt.getTime() <= Date.now()) return;
  if (!(await ensureSetup())) return;

  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: content.title, body: content.body, data: { bookingId: content.bookingId } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL_ID },
  });
}

/** Cancela los avisos programados con `prefix` cuya reserva ya no está en `keepIds`. */
async function cancelStale(prefix: string, keepIds: Set<string>): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix) && !keepIds.has(n.identifier.slice(prefix.length)))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// ── Fin de reserva ────────────────────────────────────────────────────────────────────────────

export async function cancelBookingEndReminder(bookingId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`${END_PREFIX}${bookingId}`);
}

export async function scheduleBookingEndReminder({ bookingId, endsAt }: ActiveBookingReminder): Promise<void> {
  await scheduleAt(`${END_PREFIX}${bookingId}`, new Date(endsAt.getTime() - END_LEAD_MS), {
    title: 'Tu reserva termina en 15 minutos',
    body: 'Si no la finalizás, se cierra sola 15 minutos después y se cobran como tiempo excedido.',
    bookingId,
  });
}

/**
 * Deja programados exactamente los avisos de las reservas en curso: programa los que falten y
 * cancela los de reservas que ya no lo están (por ejemplo, si las finalizó el propietario).
 */
export async function syncBookingEndReminders(active: ActiveBookingReminder[]): Promise<void> {
  await cancelStale(END_PREFIX, new Set(active.map((a) => a.bookingId)));
  await Promise.all(active.map(scheduleBookingEndReminder));
}

// ── Un día antes ──────────────────────────────────────────────────────────────────────────────

/**
 * Deja programados exactamente los recordatorios de las reservas futuras confirmadas. Una reserva
 * cancelada o ya iniciada deja de estar en la lista y su aviso se cancela. Si faltan menos de 24
 * horas para el inicio, el momento del aviso ya pasó y no se programa nada.
 */
export async function syncBookingDayBeforeReminders(upcoming: UpcomingBookingReminder[]): Promise<void> {
  await cancelStale(DAY_BEFORE_PREFIX, new Set(upcoming.map((b) => b.bookingId)));
  await Promise.all(
    upcoming.map(({ bookingId, startsAt, placeName }) =>
      scheduleAt(`${DAY_BEFORE_PREFIX}${bookingId}`, new Date(startsAt.getTime() - DAY_BEFORE_LEAD_MS), {
        title: 'Tenés una reserva mañana',
        body: `Tu reserva en ${placeName} es mañana. Revisá el horario en Mis reservas.`,
        bookingId,
      })
    )
  );
}
