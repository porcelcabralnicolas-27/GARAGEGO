/**
 * Contratos de dominio compartidos entre la app (Expo, en `src/`) y el panel de administración
 * (Vite, en `admin-panel/src/`) — dos proyectos npm separados, sin build compartido entre
 * ellos, así que esto es una carpeta de solo-tipos que los dos importan por ruta relativa.
 *
 * Auditoría técnica 2026-09-13, hallazgo 4.7: estos mismos union types y el mapa de etiquetas
 * de tickets estaban copiados a mano en `admin-panel/src/domain.ts`, sin nada que avisara si se
 * desincronizaban. Por ejemplo, agregar una categoría de ticket nueva en la migración de
 * soporte requeriría acordarse de tocar los dos lados a la vez.
 *
 * ── Qué SÍ va acá ────────────────────────────────────────────────────────────────────────
 * Solo los enums/uniones que reflejan un `check` constraint de la base (o un mapa de
 * etiquetas derivado 1 a 1 de ellos) Y que los dos proyectos necesitan. Nada de componentes,
 * nada de lógica de negocio, nada que dependa de React Native o del DOM.
 *
 * ── Qué NO va acá ────────────────────────────────────────────────────────────────────────
 * Los tipos de fila completos (`Profile`, `ParkingLot`, `AdminParkingLot`...) siguen en cada
 * proyecto: la app y el panel exponen columnas distintas de las mismas tablas (el panel ve
 * `phone`/`is_admin`, por ejemplo, que la app no necesita para su propio perfil), y forzar una
 * forma común ahí sería peor que la duplicación que evita esto.
 *
 * Si se agrega una categoría de ticket, un estado de moderación, etc. en una migración nueva,
 * se actualiza acá — los dos proyectos lo reciben con un solo cambio.
 */

/** Rol de un usuario. Columna `profiles.active_role` (migración 0001) y `reporter_role` de un
 *  ticket de soporte (migración 0041). */
export type UserRole = 'client' | 'owner';

/** Revisión de alta de una cochera por el equipo. `parking_lots.approval_status`
 *  (migración 0034). */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

/** Palanca operativa del admin sobre una cochera ya aprobada. `parking_lots.moderation_state`
 *  (migración 0034). */
export type ModerationState = 'live' | 'paused_by_admin' | 'suspended';

/** `support_tickets.status` (migración 0041). */
export type TicketStatus = 'open' | 'resolved';

/** `support_tickets.category` (migración 0041). */
export type TicketCategory = 'access' | 'payment' | 'listing' | 'behavior' | 'other';

/** Servicios de una cochera. `parking_lots.amenities` (migración 0065), en este orden. */
export const AMENITIES = ['cameras', 'security_staff', 'lighting', 'ev_charger', 'restrooms'] as const;

export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  cameras: 'Cámaras de seguridad',
  security_staff: 'Personal de vigilancia',
  lighting: 'Iluminación y señalización',
  ev_charger: 'Cargador para eléctricos',
  restrooms: 'Sanitarios',
};

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  access: 'Acceso a la cochera',
  payment: 'Pagos y saldo',
  listing: 'Publicación',
  behavior: 'Conducta',
  other: 'Otro',
};
