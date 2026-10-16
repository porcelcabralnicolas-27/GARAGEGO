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

/**
 * Qué puede pedir el equipo que se cambie en una publicación ("Pedir cambios", migración 0072).
 * `parking_lots.requested_changes` guarda estos códigos; al reenviar, el servidor verifica que
 * cada uno haya cambiado. `other` es "algo que no entra en la lista": exige al menos un cambio.
 */
export const LISTING_CHANGE_FIELDS = [
  'name',
  'description',
  'address',
  'price',
  'capacity',
  'amenities',
  'photos',
  'availability',
  'documents',
  'other',
] as const;

export type ListingChangeField = (typeof LISTING_CHANGE_FIELDS)[number];

export const LISTING_CHANGE_FIELD_LABELS: Record<ListingChangeField, string> = {
  name: 'Nombre',
  description: 'Descripción',
  address: 'Dirección y ubicación',
  price: 'Tarifa por hora',
  capacity: 'Capacidad',
  amenities: 'Servicios',
  photos: 'Fotos',
  availability: 'Disponibilidad (días y horarios)',
  documents: 'Documentos de titularidad',
  other: 'Otro (según el detalle)',
};

/**
 * Tipo de publicación. `parking_lots.lot_type` (migración 0075):
 *   - `house`: cochera de casa (un particular que alquila el espacio de su casa);
 *   - `lot`: estacionamiento (un predio o playa de estacionamiento).
 * El mapa dibuja un ícono distinto para cada tipo.
 */
export const LOT_TYPES = ['house', 'lot'] as const;

export type LotType = (typeof LOT_TYPES)[number];

export const LOT_TYPE_LABELS: Record<LotType, string> = {
  house: 'Cochera de casa',
  lot: 'Estacionamiento',
};

export const LOT_TYPE_DESCRIPTIONS: Record<LotType, string> = {
  house: 'El espacio de tu casa: garaje o entrada.',
  lot: 'Un predio o playa de estacionamiento.',
};

// ── Verificación de titularidad (migración 0078) ──────────────────────────────────────────────
// Para publicar, el propietario sube documentos que acreditan que es el dueño del lugar o que
// tiene permiso para ofrecerlo. El equipo los revisa antes de aprobar. Las reglas de abajo se
// repiten en SQL (`lot_missing_documents`, 0078): el servidor es el que las hace cumplir, esto
// solo le dice a la pantalla qué pedir y qué falta.

/** Relación de quien publica con el lugar. `parking_lots.holder_role` (migración 0078). */
export const HOLDER_ROLES = ['owner', 'tenant', 'manager'] as const;

export type HolderRole = (typeof HOLDER_ROLES)[number];

export const HOLDER_ROLE_LABELS: Record<HolderRole, string> = {
  owner: 'Soy el titular (dueño)',
  tenant: 'Soy inquilino',
  manager: 'Administro el lugar para el dueño',
};

/** Tipo de documento. `parking_lot_documents.kind` (migración 0078). */
export const DOCUMENT_KINDS = [
  'dni',
  'ownership_deed',
  'tax_bill',
  'rental_contract',
  'owner_authorization',
  'commercial_license',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  dni: 'DNI (frente)',
  ownership_deed: 'Escritura o título de propiedad',
  tax_bill: 'Boleta de impuesto inmobiliario o ABL',
  rental_contract: 'Contrato de alquiler',
  owner_authorization: 'Autorización firmada del dueño',
  commercial_license: 'Habilitación municipal',
};

/** Un renglón de lo que se pide. Se cumple con UNO de sus `kinds`. */
export type DocumentRequirement = {
  id: string;
  label: string;
  hint: string;
  kinds: DocumentKind[];
  /** Un requisito opcional no bloquea la publicación. */
  optional?: boolean;
};

const DNI_REQUIREMENT: DocumentRequirement = {
  id: 'dni',
  label: 'DNI (frente)',
  hint: 'Tiene que coincidir con el nombre de tu cuenta. Tapá el número de trámite.',
  kinds: ['dni'],
};

const OWNER_AUTHORIZATION_REQUIREMENT: DocumentRequirement = {
  id: 'owner_authorization',
  label: 'Autorización firmada del dueño',
  hint: 'Con su firma, la fecha y una copia de su DNI, para que ofrezcas el lugar.',
  kinds: ['owner_authorization'],
};

/** Qué documentos pide cada relación con el lugar. */
export function documentRequirements(role: HolderRole, lotType?: 'house' | 'lot'): DocumentRequirement[] {
  const requirements: DocumentRequirement[] = [DNI_REQUIREMENT];

  if (role === 'owner') {
    requirements.push({
      id: 'property_proof',
      label: 'Documento que acredite que sos el dueño',
      hint: 'Escritura, título de propiedad o una boleta reciente (últimos 6 meses) del impuesto inmobiliario o ABL, a tu nombre y con la dirección del lugar.',
      kinds: ['ownership_deed', 'tax_bill'],
    });
  } else if (role === 'tenant') {
    requirements.push({
      id: 'rental_contract',
      label: 'Contrato de alquiler',
      hint: 'Vigente y con la dirección del lugar.',
      kinds: ['rental_contract'],
    });
    requirements.push(OWNER_AUTHORIZATION_REQUIREMENT);
  } else {
    requirements.push(OWNER_AUTHORIZATION_REQUIREMENT);
  }

  if (lotType === 'lot') {
    requirements.push({
      id: 'commercial_license',
      label: 'Habilitación municipal (opcional)',
      hint: 'Si el predio tiene habilitación como estacionamiento, sumala: acelera la revisión.',
      kinds: ['commercial_license'],
      optional: true,
    });
  }

  return requirements;
}

/** Los requisitos obligatorios que todavía no se cumplen con los documentos cargados. */
export function missingDocumentRequirements(
  role: HolderRole,
  have: Iterable<DocumentKind>
): DocumentRequirement[] {
  const owned = new Set(have);
  return documentRequirements(role).filter(
    (requirement) => !requirement.optional && !requirement.kinds.some((kind) => owned.has(kind))
  );
}
