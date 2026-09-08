/**
 * Tipos del mock. Este archivo es el contrato entre la demo y el esquema real: si es fiel,
 * conectar la base después es mecánico.
 *
 * Los campos marcados NO EXISTE son invenciones necesarias para el panel; cada una está
 * documentada en `admin-panel/README.md` con la migración que haría falta.
 */

export type UserRole = 'client' | 'owner';

/** `public.profiles`. Ojo: la tabla real NO tiene email (vive en `auth.users`) ni presencia. */
export type AdminProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  activeRole: UserRole;
  isOwnerEnabled: boolean;
  createdAt: string;
  /** NO EXISTE en `profiles`: el email vive en `auth.users`, ilegible con la anon key. */
  email: string;
  /** NO EXISTE: no hay ningún campo de presencia. */
  lastSeenAt: string | null;
};

/** Estado de moderación de una publicación. NO EXISTE — hoy `parking_lots` solo tiene `is_active`,
 *  y ese campo ya está ocupado: el wizard crea la cochera con `is_active:false` como borrador. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

/** Estado operativo que controla el admin, independiente de la aprobación. NO EXISTE. */
export type ModerationState = 'live' | 'paused_by_admin' | 'suspended';

/** `public.parking_lots` + los campos de moderación inventados. */
export type AdminParkingLot = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  ratingAvg: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** NO EXISTE (ver ApprovalStatus). */
  approvalStatus: ApprovalStatus;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  moderationState: ModerationState;
  pauseReason: string | null;
  suspendedUntil: string | null;
};

/** `public.parking_images`. Máximo 3 por cochera (lo impone un trigger en la base). */
export type AdminParkingImage = {
  id: string;
  parkingLotId: string;
  /** En el mock es un data URI SVG, no un `storage_path`. */
  url: string;
  position: number;
};

/** `public.bookings`. En la práctica hoy solo existen confirmed | cancelled | completed:
 *  desde la migración 0024 `create_booking` inserta directo en 'confirmed'. */
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export type AdminBooking = {
  id: string;
  userId: string;
  parkingLotId: string;
  vehicleId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: number;
  actualStartAt: string | null;
  actualEndAt: string | null;
  overtimeMinutes: number;
  overtimeCharge: number;
  createdAt: string;
};

/** `public.vehicles`. Máximo 3 por usuario (trigger). */
export type AdminVehicle = {
  id: string;
  userId: string;
  plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  createdAt: string;
};

/** `public.ratings`. UNIDIRECCIONAL: solo el conductor califica la cochera. No existe
 *  calificación del propietario al conductor. */
export type AdminRating = {
  id: string;
  bookingId: string;
  userId: string;
  parkingLotId: string;
  score: number;
  comment: string | null;
  createdAt: string;
  /** NO EXISTE: `ratings` no tiene flag de moderación. */
  isHidden: boolean;
  hiddenReason: string | null;
};

/** Valores del constraint `wallet_transactions_type_check` en su estado final (migración 0024). */
export type TransactionType =
  | 'topup'
  | 'booking_payment'
  | 'refund'
  | 'overtime_charge'
  | 'earning'
  | 'adjustment';

export type TransactionStatus = 'pending' | 'completed' | 'failed';

/** `public.wallet_transactions`. `userId` no está en la tabla real (se llega por `wallets.user_id`),
 *  se desnormaliza acá para no tener que mantener una tabla `wallets` en el mock. */
export type AdminTransaction = {
  id: string;
  walletId: string;
  userId: string;
  type: TransactionType;
  /** Negativo = débito. */
  amount: number;
  relatedBookingId: string | null;
  status: TransactionStatus;
  paymentGatewayRef: string | null;
  createdAt: string;
};

/** Sistema de tickets: NO EXISTE nada en la base. El único canal es `messages`, atado a una
 *  reserva; no hay canal usuario ↔ plataforma. */
export type TicketStatus = 'open' | 'resolved';

export type TicketCategory =
  | 'access'
  | 'payment'
  | 'listing'
  | 'behavior'
  | 'other';

export type AdminTicketMessage = {
  id: string;
  ticketId: string;
  authorSide: 'user' | 'admin';
  authorName: string;
  body: string;
  createdAt: string;
};

export type AdminTicket = {
  id: string;
  code: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  reporterId: string;
  reporterSide: UserRole;
  relatedBookingId: string | null;
  relatedParkingLotId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AdminTicketMessage[];
};

/** Una entrada del historial de moderación de una cochera. Derivado, no una tabla. */
export type ModerationEvent = {
  id: string;
  parkingLotId: string;
  label: string;
  detail: string | null;
  at: string;
};

/** El snapshot completo del mock. Es lo que vive en el reducer. */
export type MockState = {
  profiles: AdminProfile[];
  vehicles: AdminVehicle[];
  parkingLots: AdminParkingLot[];
  parkingImages: AdminParkingImage[];
  bookings: AdminBooking[];
  ratings: AdminRating[];
  transactions: AdminTransaction[];
  tickets: AdminTicket[];
  moderationEvents: ModerationEvent[];
  /** Reloj de la demo. Lo avanza `useLiveTick` para que los cronómetros corran de verdad. */
  now: number;
  /** Ids de usuarios "en línea". Presencia simulada. */
  onlineUserIds: string[];
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  access: 'Acceso a la cochera',
  payment: 'Pagos y saldo',
  listing: 'Publicación',
  behavior: 'Conducta',
  other: 'Otro',
};

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

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Finalizada',
};
