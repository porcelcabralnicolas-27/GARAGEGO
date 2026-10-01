/**
 * Tipos y helpers de dominio del panel. Espejan lo que devuelven los RPCs / queries de
 * Supabase: el `email` de `AdminProfile` viene de `auth.users` vía RPC, y las columnas de
 * moderación de `AdminParkingLot` son las de las migraciones 0034+.
 *
 * UserRole, ApprovalStatus, ModerationState, TicketStatus, TicketCategory y
 * TICKET_CATEGORY_LABELS vienen de ../../shared/domain.ts, que también usa la app (src/). Antes
 * estaban copiados a mano acá; ver ese archivo para el porqué del cambio.
 */

export type {
  Amenity,
  ApprovalStatus,
  ModerationState,
  TicketCategory,
  TicketStatus,
  UserRole,
} from '../../shared/domain';
export { AMENITY_LABELS, TICKET_CATEGORY_LABELS } from '../../shared/domain';

import type { Amenity, ApprovalStatus, ModerationState, UserRole } from '../../shared/domain';

/** Fila de `profiles` + el email resuelto por RPC. */
export type AdminProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  activeRole: UserRole;
  isOwnerEnabled: boolean;
  createdAt: string;
  email: string;
};

/** Fila de `parking_lots`, con las columnas de moderación (migración 0034). */
export type AdminParkingLot = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  /** Autos a la vez (0064). */
  capacity: number;
  /** Servicios (0065). */
  amenities: Amenity[];
  ratingAvg: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  approvalStatus: ApprovalStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  moderationState: ModerationState;
  pauseReason: string | null;
  suspendedUntil: string | null;
  /** Borrada por el propietario pero conservada por tener historial de reservas (0053). */
  archivedAt: string | null;
};

/** Valores del constraint `wallet_transactions_type_check` (migración 0024). */
export type TransactionType =
  | 'topup'
  | 'booking_payment'
  | 'refund'
  | 'overtime_charge'
  | 'earning'
  | 'adjustment';

export type TransactionStatus = 'pending' | 'completed' | 'failed';

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  topup: 'Recarga',
  booking_payment: 'Pago de reserva',
  refund: 'Reintegro',
  overtime_charge: 'Cargo por exceso',
  earning: 'Cobro del propietario',
  adjustment: 'Ajuste manual',
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  changes_requested: 'Cambios pedidos',
};

export const MODERATION_STATE_LABELS: Record<ModerationState, string> = {
  live: 'En vivo',
  paused_by_admin: 'Pausada por admin',
  suspended: 'Suspendida',
};

// ---------------------------------------------------------------- inventario

/** Una cochera con lo derivado que muestran las tablas de Inventario. */
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

/** Nivel de urgencia de una publicación en la cola, según cuánto lleva esperando. */
export function slaLevel(ageHours: number): 'ok' | 'info' | 'warn' | 'danger' {
  if (ageHours < 24) return 'ok';
  if (ageHours < 48) return 'info';
  if (ageHours < 72) return 'warn';
  return 'danger';
}

/** Marca datos de contacto en la descripción de una cochera: es una violación de política
 *  habitual (cerrar el trato por fuera de la app) y el revisor tiene que verla de un vistazo. */
export function findContactInfo(text: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g);
  const phone = text.match(/\d[\d\s-]{7,}\d/g);
  if (email) found.push(...email);
  if (phone) found.push(...phone.map((p) => p.trim()));
  return found;
}
