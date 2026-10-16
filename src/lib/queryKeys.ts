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
 */
export const queryKeys = {
  bookings: {
    all: ['bookings'] as const,
    myList: (userId: string) => ['bookings', 'myList', userId] as const,
    receivedList: (ownerId: string) => ['bookings', 'receivedList', ownerId] as const,
    myHistory: (userId: string) => ['bookings', 'myHistory', userId] as const,
    receivedHistory: (ownerId: string) => ['bookings', 'receivedHistory', ownerId] as const,
    detail: (bookingId: string) => ['bookings', 'detail', bookingId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (userId: string, audience: NotificationAudience) => ['notifications', 'list', userId, audience] as const,
    unreadMessages: (userId: string, audience: NotificationAudience) =>
      ['notifications', 'unreadMessages', userId, audience] as const,
    unread: (userId: string, audience: NotificationAudience) =>
      ['notifications', 'unread', userId, audience] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (userId: string) => ['vehicles', 'list', userId] as const,
    images: (vehicleIds: string[]) => ['vehicles', 'images', [...vehicleIds].sort()] as const,
    detail: (vehicleId: string) => ['vehicles', 'detail', vehicleId] as const,
  },
  parkingLots: {
    all: ['parkingLots'] as const,
    ownList: (ownerId: string) => ['parkingLots', 'ownList', ownerId] as const,
    coverImages: (lotIds: string[]) => ['parkingLots', 'coverImages', [...lotIds].sort()] as const,
    detail: (lotId: string) => ['parkingLots', 'detail', lotId] as const,
    publicDetail: (lotId: string) => ['parkingLots', 'publicDetail', lotId] as const,
    ratings: (lotId: string) => ['parkingLots', 'ratings', lotId] as const,
    search: (filters: { latitude: number; longitude: number; radiusKm: number; maxPrice: number | null; minRating: number | null }) =>
      ['parkingLots', 'search', filters] as const,
    nearby: (filters: { latitude: number; longitude: number; radiusKm: number; maxPrice: number | null; minRating: number | null }) =>
      ['parkingLots', 'nearby', filters] as const,
    availableNow: (lotIdsKey: string) => ['parkingLots', 'availableNow', lotIdsKey] as const,
    bookingAvailability: (lotId: string) => ['parkingLots', 'bookingAvailability', lotId] as const,
    images: (lotId: string) => ['parkingLots', 'images', lotId] as const,
    documents: (lotId: string) => ['parkingLots', 'documents', lotId] as const,
    availability: (lotId: string) => ['parkingLots', 'availability', lotId] as const,
  },
  tickets: {
    all: ['tickets'] as const,
    list: (userId: string, role: string) => ['tickets', 'list', userId, role] as const,
    thread: (ticketId: string) => ['tickets', 'thread', ticketId] as const,
    messages: (ticketId: string) => ['tickets', 'messages', ticketId] as const,
    targets: (userId: string, role: string) => ['tickets', 'targets', userId, role] as const,
  },
  stats: {
    all: ['stats'] as const,
    owner: (ownerId: string) => ['stats', 'owner', ownerId] as const,
  },
  settings: {
    demoTopup: ['settings', 'demoTopup'] as const,
  },
  wallet: {
    all: ['wallet'] as const,
    recentTransactions: (userId: string) => ['wallet', 'recentTransactions', userId] as const,
  },
  messaging: {
    all: ['messaging'] as const,
    clientThreads: (userId: string) => ['messaging', 'clientThreads', userId] as const,
    ownerThreads: (ownerId: string) => ['messaging', 'ownerThreads', ownerId] as const,
    thread: (userId: string, role: string, parkingLotId: string, peerId: string) =>
      ['messaging', 'thread', userId, role, parkingLotId, peerId] as const,
    threadMessages: (bookingIds: string[]) => ['messaging', 'threadMessages', [...bookingIds].sort()] as const,
  },
} as const;
