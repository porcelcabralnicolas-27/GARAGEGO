// expo-notifications no tiene notificaciones locales en web: en la versión web los avisos llegan
// solo por la lista de Notificaciones (0066 y 0068).

export type ActiveBookingReminder = { bookingId: string; endsAt: Date };
export type UpcomingBookingReminder = { bookingId: string; startsAt: Date; placeName: string };

export async function cancelBookingEndReminder(_bookingId: string): Promise<void> {}

export async function scheduleBookingEndReminder(_reminder: ActiveBookingReminder): Promise<void> {}

export async function syncBookingEndReminders(_active: ActiveBookingReminder[]): Promise<void> {}

export async function syncBookingDayBeforeReminders(_upcoming: UpcomingBookingReminder[]): Promise<void> {}
