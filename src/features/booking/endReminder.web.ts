// expo-notifications no tiene notificaciones locales en web: en la versión web el aviso llega
// solo por la lista de Notificaciones (send_booking_end_reminders, 0066).

export type ActiveBookingReminder = { bookingId: string; endsAt: Date };

export async function cancelBookingEndReminder(_bookingId: string): Promise<void> {}

export async function scheduleBookingEndReminder(_reminder: ActiveBookingReminder): Promise<void> {}

export async function syncBookingEndReminders(_active: ActiveBookingReminder[]): Promise<void> {}
