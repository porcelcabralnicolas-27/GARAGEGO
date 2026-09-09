export type TicketCategory = 'access' | 'payment' | 'listing' | 'behavior' | 'other';
export type TicketStatus = 'open' | 'resolved';

/** Rol de quien abre el ticket. Define contra qué se vincula: reserva (conductor) o cochera. */
export type ReporterRole = 'client' | 'owner';

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  access: 'Acceso a la cochera',
  payment: 'Pagos y saldo',
  listing: 'Publicación',
  behavior: 'Conducta',
  other: 'Otro',
};

/** Categorías que tienen sentido para cada rol. */
export const TICKET_CATEGORIES_BY_ROLE: Record<ReporterRole, TicketCategory[]> = {
  client: ['access', 'payment', 'behavior', 'other'],
  owner: ['listing', 'payment', 'behavior', 'other'],
};

export type SupportTicket = {
  id: string;
  code: string;
  reporterId: string;
  reporterRole: ReporterRole;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  relatedBookingId: string | null;
  relatedParkingLotId: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
};

/** Un ticket en la lista, con la etiqueta de contexto ya resuelta (nombre de la cochera). */
export type SupportTicketListItem = SupportTicket & {
  contextLabel: string | null;
  lastMessagePreview: string | null;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: 'user' | 'admin';
  body: string;
  createdAt: string;
};

/** Opción para el selector de "¿sobre qué es?" al abrir un ticket. */
export type TicketTargetOption = {
  /** `booking:<id>` o `lot:<id>`. */
  key: string;
  label: string;
  sublabel: string | null;
  bookingId: string | null;
  parkingLotId: string | null;
};
