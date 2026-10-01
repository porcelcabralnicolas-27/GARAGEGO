import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Aviso en el celular 15 minutos antes del final de una reserva en curso. Es una notificación
// local: la programa este dispositivo, así que suena aunque la app esté cerrada. El servidor
// manda además la de la lista de Notificaciones (send_booking_end_reminders, 0066), que es la
// que llega aunque se haya reinstalado la app.

const LEAD_MS = 15 * 60 * 1000;
const CHANNEL_ID = 'booking-reminders';
const ID_PREFIX = 'booking-end-';

export type ActiveBookingReminder = { bookingId: string; endsAt: Date };

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
        name: 'Fin de reservas',
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

const identifierOf = (bookingId: string) => `${ID_PREFIX}${bookingId}`;

export async function cancelBookingEndReminder(bookingId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(identifierOf(bookingId));
}

/** Programa (o reprograma) el aviso. Si ya pasó el momento del aviso, no hace nada. */
export async function scheduleBookingEndReminder({ bookingId, endsAt }: ActiveBookingReminder): Promise<void> {
  const fireAt = new Date(endsAt.getTime() - LEAD_MS);
  if (fireAt.getTime() <= Date.now()) return;
  if (!(await ensureSetup())) return;

  await cancelBookingEndReminder(bookingId);
  await Notifications.scheduleNotificationAsync({
    identifier: identifierOf(bookingId),
    content: {
      title: 'Tu reserva termina en 15 minutos',
      body: 'Si no la finalizás, se cierra sola 15 minutos después y se cobran como tiempo excedido.',
      data: { bookingId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: CHANNEL_ID,
    },
  });
}

/**
 * Deja programados exactamente los avisos de las reservas en curso: programa los que falten y
 * cancela los de reservas que ya no lo están (por ejemplo, si las finalizó el propietario).
 */
export async function syncBookingEndReminders(active: ActiveBookingReminder[]): Promise<void> {
  const activeIds = new Set(active.map((a) => a.bookingId));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX) && !activeIds.has(n.identifier.slice(ID_PREFIX.length)))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  await Promise.all(active.map(scheduleBookingEndReminder));
}
