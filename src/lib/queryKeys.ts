import type { NotificationAudience } from '@/features/notifications/types';

/**
 * Claves de React Query, todas en un solo lugar.
 *
 * La regla: cada clave es un array que va de lo más general a lo más específico
 * (`['notifications', userId, audience]`). Así se puede invalidar un grupo entero con el
 * prefijo — `invalidateQueries({ queryKey: ['notifications'] })` alcanza a todas las
 * audiencias y usuarios — o una sola con la clave completa.
 *
 * Tenerlas acá y no escritas a mano en cada pantalla evita el error clásico de React Query:
 * invalidar con una clave que no coincide exactamente con la que usó el `useQuery`, y que la
 * pantalla se quede mostrando datos viejos sin que nadie se dé cuenta.
 *
 * Por ahora las usan las pantallas migradas en el piloto (notificaciones y vehículos). Las
 * demás siguen con `useEffect` manual: se van a ir migrando de a poco, con este mismo patrón.
 */
export const queryKeys = {
  bookings: {
    all: ['bookings'] as const,
    myList: (userId: string) => ['bookings', 'myList', userId] as const,
    receivedList: (ownerId: string) => ['bookings', 'receivedList', ownerId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (userId: string, audience: NotificationAudience) => ['notifications', 'list', userId, audience] as const,
    unreadMessages: (userId: string, audience: NotificationAudience) =>
      ['notifications', 'unreadMessages', userId, audience] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (userId: string) => ['vehicles', 'list', userId] as const,
    images: (vehicleIds: string[]) => ['vehicles', 'images', [...vehicleIds].sort()] as const,
  },
} as const;
