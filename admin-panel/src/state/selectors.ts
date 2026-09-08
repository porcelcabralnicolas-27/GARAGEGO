import type {
  AdminBooking,
  AdminParkingLot,
  AdminProfile,
  AdminRating,
  AdminTransaction,
  MockState,
} from '../mocks/types';

/**
 * Todo lo derivado del mock vive acá.
 *
 * Es a propósito: esta es exactamente la capa que mañana se reemplaza por queries a Supabase sin
 * tocar una sola vista. Cada selector de acá tiene su equivalente en SQL comentado arriba cuando
 * no es obvio.
 */

// ---------------------------------------------------------------- ocupación y sesiones

/** Una reserva está "en curso" si está confirmada, ya arrancó y todavía no cerró.
 *  Es la misma definición que usa la app (`src/features/stats/api.ts`). */
export function isActiveSession(b: AdminBooking): boolean {
  return b.status === 'confirmed' && b.actualStartAt !== null && b.actualEndAt === null;
}

export type ActiveSession = {
  booking: AdminBooking;
  lot: AdminParkingLot;
  driver: AdminProfile | undefined;
  owner: AdminProfile | undefined;
  plate: string | null;
  elapsedMs: number;
  /** Milisegundos pasados del horario reservado. Negativo = todavía le queda tiempo. */
  overMs: number;
};

export function selectActiveSessions(state: MockState): ActiveSession[] {
  return state.bookings
    .filter(isActiveSession)
    .map((booking) => {
      const lot = state.parkingLots.find((l) => l.id === booking.parkingLotId);
      if (!lot) return null;
      const vehicle = state.vehicles.find((v) => v.id === booking.vehicleId);
      const scheduledEnd = new Date(`${booking.date}T${booking.endTime}`).getTime();

      return {
        booking,
        lot,
        driver: state.profiles.find((p) => p.id === booking.userId),
        owner: state.profiles.find((p) => p.id === lot.ownerId),
        plate: vehicle?.plate ?? null,
        elapsedMs: state.now - new Date(booking.actualStartAt as string).getTime(),
        overMs: state.now - scheduledEnd,
      } satisfies ActiveSession;
    })
    .filter((s): s is ActiveSession => s !== null)
    .sort((a, b) => b.elapsedMs - a.elapsedMs);
}

/** Cocheras publicables (aprobadas y no pausadas) vs. cuántas están ocupadas ahora mismo. */
export function selectOccupancy(state: MockState) {
  const publishable = state.parkingLots.filter(
    (l) => l.approvalStatus === 'approved' && l.moderationState === 'live'
  );
  const busyIds = new Set(state.bookings.filter(isActiveSession).map((b) => b.parkingLotId));
  const busy = publishable.filter((l) => busyIds.has(l.id)).length;

  return {
    total: publishable.length,
    busy,
    free: publishable.length - busy,
    ratio: publishable.length ? busy / publishable.length : 0,
  };
}

export function selectOnlineUsers(state: MockState) {
  const online = state.profiles.filter((p) => state.onlineUserIds.includes(p.id));
  return {
    all: online,
    drivers: online.filter((p) => !p.isOwnerEnabled || p.activeRole === 'client'),
    owners: online.filter((p) => p.isOwnerEnabled && p.activeRole === 'owner'),
  };
}

// ---------------------------------------------------------------- crecimiento

export type GrowthRange = '30d' | '6m' | '12m';

export type GrowthPoint = { label: string; at: number; drivers: number; owners: number };

const RANGE_CONFIG: Record<GrowthRange, { days: number; buckets: number; unit: 'day' | 'week' | 'month' }> = {
  '30d': { days: 30, buckets: 30, unit: 'day' },
  '6m': { days: 182, buckets: 26, unit: 'week' },
  '12m': { days: 365, buckets: 12, unit: 'month' },
};

/**
 * Serie de altas por período.
 *
 * La serie "Conductores" agrupa `profiles.created_at`. La de "Propietarios" agrupa la fecha de la
 * PRIMERA cochera de cada owner (`min(parking_lots.created_at) group by owner_id`): no existe un
 * `owner_enabled_at` en la base, pero esto se calcula con datos que ya están, así que al conectar
 * de verdad sigue siendo una query real y no hace falta una columna nueva.
 */
export function selectGrowthSeries(
  state: MockState,
  range: GrowthRange,
  cumulative: boolean
): GrowthPoint[] {
  const { days, buckets } = RANGE_CONFIG[range];
  const spanMs = days * 86_400_000;
  const bucketMs = spanMs / buckets;
  const start = state.now - spanMs;

  const firstLotByOwner = new Map<string, number>();
  state.parkingLots.forEach((lot) => {
    const at = new Date(lot.createdAt).getTime();
    const prev = firstLotByOwner.get(lot.ownerId);
    if (prev === undefined || at < prev) firstLotByOwner.set(lot.ownerId, at);
  });

  const driverDates = state.profiles.map((p) => new Date(p.createdAt).getTime());
  const ownerDates = [...firstLotByOwner.values()];

  const points: GrowthPoint[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const from = start + i * bucketMs;
    const to = from + bucketMs;
    const inRange = (dates: number[]) => dates.filter((d) => d >= from && d < to).length;

    points.push({
      label: bucketLabel(new Date(to - 1), range),
      at: to,
      drivers: inRange(driverDates),
      owners: inRange(ownerDates),
    });
  }

  if (!cumulative) return points;

  // Acumulado: arranca desde lo que ya existía antes del inicio del rango.
  let d = driverDates.filter((x) => x < start).length;
  let o = ownerDates.filter((x) => x < start).length;
  return points.map((p) => {
    d += p.drivers;
    o += p.owners;
    return { ...p, drivers: d, owners: o };
  });
}

function bucketLabel(date: Date, range: GrowthRange): string {
  if (range === '12m') {
    return date.toLocaleDateString('es-AR', { month: 'short' });
  }
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// ---------------------------------------------------------------- usuarios

export type DriverRow = {
  profile: AdminProfile;
  vehicles: number;
  bookings: number;
  isOnline: boolean;
};

export function selectDrivers(state: MockState): DriverRow[] {
  return state.profiles.map((profile) => ({
    profile,
    vehicles: state.vehicles.filter((v) => v.userId === profile.id).length,
    bookings: state.bookings.filter((b) => b.userId === profile.id).length,
    isOnline: state.onlineUserIds.includes(profile.id),
  }));
}

export type OwnerRow = {
  profile: AdminProfile;
  lotsTotal: number;
  lotsLive: number;
  lotsPending: number;
  ratingAvg: number | null;
  bookingsReceived: number;
  earnings: number;
  isOnline: boolean;
};

export function selectOwners(state: MockState): OwnerRow[] {
  return state.profiles
    .filter((p) => p.isOwnerEnabled)
    .map((profile) => {
      const lots = state.parkingLots.filter((l) => l.ownerId === profile.id);
      const lotIds = new Set(lots.map((l) => l.id));
      const rated = lots.filter((l) => l.ratingAvg > 0);

      return {
        profile,
        lotsTotal: lots.length,
        lotsLive: lots.filter((l) => l.approvalStatus === 'approved' && l.moderationState === 'live').length,
        lotsPending: lots.filter((l) => l.approvalStatus === 'pending').length,
        ratingAvg: rated.length
          ? rated.reduce((sum, l) => sum + l.ratingAvg, 0) / rated.length
          : null,
        bookingsReceived: state.bookings.filter((b) => lotIds.has(b.parkingLotId)).length,
        earnings: state.transactions
          .filter((t) => t.userId === profile.id && t.type === 'earning' && t.status === 'completed')
          .reduce((sum, t) => sum + t.amount, 0),
        isOnline: state.onlineUserIds.includes(profile.id),
      } satisfies OwnerRow;
    });
}

// ---------------------------------------------------------------- reseñas

export type RatingRow = {
  rating: AdminRating;
  author: AdminProfile | undefined;
  lot: AdminParkingLot | undefined;
  owner: AdminProfile | undefined;
};

export function selectRatingRows(state: MockState): RatingRow[] {
  return state.ratings
    .map((rating) => {
      const lot = state.parkingLots.find((l) => l.id === rating.parkingLotId);
      return {
        rating,
        author: state.profiles.find((p) => p.id === rating.userId),
        lot,
        owner: lot ? state.profiles.find((p) => p.id === lot.ownerId) : undefined,
      };
    })
    .sort((a, b) => b.rating.createdAt.localeCompare(a.rating.createdAt));
}

export function selectRatingStats(state: MockState) {
  const visible = state.ratings.filter((r) => !r.isHidden);
  const last30 = visible.filter(
    (r) => new Date(r.createdAt).getTime() > state.now - 30 * 86_400_000
  );
  const low = last30.filter((r) => r.score <= 2).length;

  return {
    average: visible.length ? visible.reduce((s, r) => s + r.score, 0) / visible.length : 0,
    total: state.ratings.length,
    lowRatePct: last30.length ? Math.round((low / last30.length) * 100) : 0,
    hidden: state.ratings.filter((r) => r.isHidden).length,
  };
}

// ---------------------------------------------------------------- inventario

export type LotRow = {
  lot: AdminParkingLot;
  owner: AdminProfile | undefined;
  images: string[];
  /** Horas desde que se envió a revisión. Alimenta el semáforo de SLA de la cola. */
  ageHours: number;
  hasActiveSession: boolean;
  upcomingBookings: number;
  bookings30d: number;
};

export function selectLotRows(state: MockState): LotRow[] {
  const activeLotIds = new Set(state.bookings.filter(isActiveSession).map((b) => b.parkingLotId));
  const in7Days = state.now + 7 * 86_400_000;
  const ago30 = state.now - 30 * 86_400_000;

  return state.parkingLots.map((lot) => {
    const lotBookings = state.bookings.filter((b) => b.parkingLotId === lot.id);

    return {
      lot,
      owner: state.profiles.find((p) => p.id === lot.ownerId),
      images: state.parkingImages
        .filter((img) => img.parkingLotId === lot.id)
        .sort((a, b) => a.position - b.position)
        .map((img) => img.url),
      ageHours: (state.now - new Date(lot.submittedAt).getTime()) / 3_600_000,
      hasActiveSession: activeLotIds.has(lot.id),
      upcomingBookings: lotBookings.filter((b) => {
        if (b.status !== 'confirmed' || b.actualStartAt) return false;
        const at = new Date(`${b.date}T${b.startTime}`).getTime();
        return at > state.now && at < in7Days;
      }).length,
      bookings30d: lotBookings.filter((b) => new Date(b.createdAt).getTime() > ago30).length,
    } satisfies LotRow;
  });
}

/** Nivel de urgencia de una publicación en la cola, según cuánto lleva esperando. */
export function slaLevel(ageHours: number): 'ok' | 'info' | 'warn' | 'danger' {
  if (ageHours < 24) return 'ok';
  if (ageHours < 48) return 'info';
  if (ageHours < 72) return 'warn';
  return 'danger';
}

/** Marca datos de contacto en la descripción: es una violación de política habitual (intentar
 *  cerrar el trato por fuera de la app) y el revisor tiene que verla sin leer todo el texto. */
export function findContactInfo(text: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g);
  const phone = text.match(/\d[\d\s-]{7,}\d/g);
  if (email) found.push(...email);
  if (phone) found.push(...phone.map((p) => p.trim()));
  return found;
}

// ---------------------------------------------------------------- transacciones

export type TransactionRow = {
  tx: AdminTransaction;
  user: AdminProfile | undefined;
  booking: AdminBooking | undefined;
  lot: AdminParkingLot | undefined;
};

export function selectTransactionRows(state: MockState): TransactionRow[] {
  return state.transactions.map((tx) => {
    const booking = tx.relatedBookingId
      ? state.bookings.find((b) => b.id === tx.relatedBookingId)
      : undefined;
    return {
      tx,
      user: state.profiles.find((p) => p.id === tx.userId),
      booking,
      lot: booking ? state.parkingLots.find((l) => l.id === booking.parkingLotId) : undefined,
    };
  });
}

/** Totales de los últimos 30 días, solo movimientos completados. */
export function selectTransactionStats(state: MockState) {
  const since = state.now - 30 * 86_400_000;
  const recent = state.transactions.filter(
    (t) => t.status === 'completed' && new Date(t.createdAt).getTime() > since
  );
  const sumOf = (type: AdminTransaction['type']) =>
    recent.filter((t) => t.type === type).reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    volume: recent.reduce((s, t) => s + Math.abs(t.amount), 0),
    topups: sumOf('topup'),
    payments: sumOf('booking_payment'),
    refunds: sumOf('refund'),
    overtime: sumOf('overtime_charge'),
    earnings: sumOf('earning'),
  };
}

// ---------------------------------------------------------------- tickets

export function selectTicketRows(state: MockState) {
  return state.tickets
    .map((ticket) => ({
      ticket,
      reporter: state.profiles.find((p) => p.id === ticket.reporterId),
      lot: ticket.relatedParkingLotId
        ? state.parkingLots.find((l) => l.id === ticket.relatedParkingLotId)
        : undefined,
      booking: ticket.relatedBookingId
        ? state.bookings.find((b) => b.id === ticket.relatedBookingId)
        : undefined,
    }))
    .sort((a, b) => b.ticket.updatedAt.localeCompare(a.ticket.updatedAt));
}

/** Contadores para los badges de la sidebar. */
export function selectPendingCounts(state: MockState) {
  return {
    pendingLots: state.parkingLots.filter((l) => l.approvalStatus === 'pending').length,
    openTickets: state.tickets.filter((t) => t.status === 'open').length,
  };
}
