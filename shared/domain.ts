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

/** Código de `support_tickets.category`. Desde la 0094 las categorías son un catálogo que edita el
 *  equipo (`ticket_categories`): puede haber otras además de las de TICKET_CATEGORY_LABELS. */
export type TicketCategory = string;

/** Servicios de una cochera (`parking_lots.amenities`). Desde la 0094 son un catálogo que edita el
 *  equipo (`parking_amenities`); estas son las de siempre, que quedan como respaldo si no se puede
 *  leer el catálogo. */
export const AMENITIES = ['cameras', 'security_staff', 'lighting', 'ev_charger', 'restrooms'] as const;

/** Código de un servicio: los de AMENITIES o cualquiera que agregue el equipo. */
export type Amenity = string;

export const AMENITY_LABELS: Record<string, string> = {
  cameras: 'Cámaras de seguridad',
  security_staff: 'Personal de vigilancia',
  lighting: 'Iluminación y señalización',
  ev_charger: 'Cargador para eléctricos',
  restrooms: 'Sanitarios',
};

/** Las categorías de siempre (respaldo si no se puede leer `ticket_categories`, 0094). */
export const TICKET_CATEGORY_LABELS: Record<string, string> = {
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
// tiene permiso para ofrecerlo. El equipo los revisa antes de aprobar. Desde la 0097 qué se pide
// lo configura el equipo (`document_requirements`); las reglas de abajo son el respaldo. El
// servidor (`lot_missing_documents`) es el que las hace cumplir; esto le dice a la pantalla qué
// pedir y qué falta.

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

/** Obligatorio, opcional o "no se pide" (Configuración → Aprobación y titularidad, 0097). */
export type DocumentPolicy = 'required' | 'optional' | 'off';

/** Una regla de `document_requirements` (0097): qué se pide, a quién y para qué tipo de lugar. */
export type DocumentRule = {
  code: string;
  label: string;
  hint: string;
  kinds: DocumentKind[];
  forOwner: boolean;
  forTenant: boolean;
  forManager: boolean;
  appliesLotType: 'all' | LotType;
  policy: DocumentPolicy;
};

/** Las reglas de antes de la 0097 (las mismas que carga la migración). Respaldo si no se puede
 *  leer la tabla. */
export const DEFAULT_DOCUMENT_RULES: DocumentRule[] = [
  {
    code: 'dni',
    label: 'DNI (frente)',
    hint: 'Tiene que coincidir con el nombre de tu cuenta. Tapá el número de trámite.',
    kinds: ['dni'],
    forOwner: true,
    forTenant: true,
    forManager: true,
    appliesLotType: 'all',
    policy: 'required',
  },
  {
    code: 'property_proof',
    label: 'Documento que acredite que sos el dueño',
    hint: 'Escritura, título de propiedad o una boleta reciente (últimos 6 meses) del impuesto inmobiliario o ABL, a tu nombre y con la dirección del lugar.',
    kinds: ['ownership_deed', 'tax_bill'],
    forOwner: true,
    forTenant: false,
    forManager: false,
    appliesLotType: 'all',
    policy: 'required',
  },
  {
    code: 'rental_contract',
    label: 'Contrato de alquiler',
    hint: 'Vigente y con la dirección del lugar.',
    kinds: ['rental_contract'],
    forOwner: false,
    forTenant: true,
    forManager: false,
    appliesLotType: 'all',
    policy: 'required',
  },
  {
    code: 'owner_authorization',
    label: 'Autorización firmada del dueño',
    hint: 'Con su firma, la fecha y una copia de su DNI, para que ofrezcas el lugar.',
    kinds: ['owner_authorization'],
    forOwner: false,
    forTenant: true,
    forManager: true,
    appliesLotType: 'all',
    policy: 'required',
  },
  {
    code: 'commercial_license',
    label: 'Habilitación municipal',
    hint: 'Si el predio tiene habilitación como estacionamiento, sumala: acelera la revisión.',
    kinds: ['commercial_license'],
    forOwner: true,
    forTenant: true,
    forManager: true,
    appliesLotType: 'lot',
    policy: 'optional',
  },
];

const ruleAppliesTo = (rule: DocumentRule, role: HolderRole) =>
  role === 'owner' ? rule.forOwner : role === 'tenant' ? rule.forTenant : rule.forManager;

/**
 * Qué documentos se le piden a esa relación con el lugar y ese tipo de lugar, según las reglas
 * (0097; por defecto, las de siempre). Sin tipo de lugar, solo las que valen para todos.
 * MISMA regla que `lot_missing_documents` en SQL: el servidor es el que la hace cumplir.
 */
export function documentRequirements(
  role: HolderRole,
  lotType?: LotType,
  rules: readonly DocumentRule[] = DEFAULT_DOCUMENT_RULES
): DocumentRequirement[] {
  return rules
    .filter(
      (rule) =>
        rule.policy !== 'off' &&
        ruleAppliesTo(rule, role) &&
        (rule.appliesLotType === 'all' || rule.appliesLotType === lotType)
    )
    .map((rule) => ({
      id: rule.code,
      label: rule.policy === 'optional' ? `${rule.label} (opcional)` : rule.label,
      hint: rule.hint,
      kinds: rule.kinds,
      ...(rule.policy === 'optional' ? { optional: true } : {}),
    }));
}

/** Los requisitos obligatorios que todavía no se cumplen con los documentos cargados. */
export function missingDocumentRequirements(
  role: HolderRole,
  have: Iterable<DocumentKind>,
  lotType?: LotType,
  rules: readonly DocumentRule[] = DEFAULT_DOCUMENT_RULES
): DocumentRequirement[] {
  const owned = new Set(have);
  return documentRequirements(role, lotType, rules).filter(
    (requirement) => !requirement.optional && !requirement.kinds.some((kind) => owned.has(kind))
  );
}

/** Convierte lo que devuelve `public_document_requirements()` (0097). Filas raras se descartan;
 *  si no queda ninguna, las reglas de siempre. */
export function parseDocumentRules(raw: unknown): DocumentRule[] {
  if (!Array.isArray(raw)) return DEFAULT_DOCUMENT_RULES;
  const rules: DocumentRule[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const kinds = Array.isArray(r.kinds)
      ? (r.kinds.filter((k) => (DOCUMENT_KINDS as readonly string[]).includes(k as string)) as DocumentKind[])
      : [];
    if (typeof r.code !== 'string' || typeof r.label !== 'string' || kinds.length === 0) continue;
    rules.push({
      code: r.code,
      label: r.label,
      hint: typeof r.hint === 'string' ? r.hint : '',
      kinds,
      forOwner: r.for_owner === true,
      forTenant: r.for_tenant === true,
      forManager: r.for_manager === true,
      appliesLotType: r.applies_lot_type === 'house' || r.applies_lot_type === 'lot' ? r.applies_lot_type : 'all',
      policy: r.policy === 'optional' || r.policy === 'off' ? r.policy : 'required',
    });
  }
  return rules.length > 0 ? rules : DEFAULT_DOCUMENT_RULES;
}

// ── Qué cambió desde la última aprobación (migración 0089) ────────────────────────────────────
// Al aprobar, la base guarda una foto de la publicación (`parking_lots.approved_snapshot`). Si el
// propietario la edita, el panel la compara con el estado actual y muestra solo lo que cambió.
// Los horarios no se comparan: no pasan por revisión (0081).

/** Lo que guarda `approved_snapshot`: `lot_review_snapshot` más el tipo de lugar y el punto. */
export type ApprovedSnapshot = {
  name?: string;
  description?: string;
  address?: { address?: string; lat?: number; lng?: number };
  price?: number;
  capacity?: number;
  amenities?: string[];
  photos?: string[];
  lot_type?: LotType;
};

export type ListingCurrentState = {
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  capacity: number;
  amenities: string[];
  lotType: LotType;
  /** Rutas en el bucket de las fotos actuales (no URLs). */
  photoPaths: string[];
};

export type ListingChange =
  | { field: 'name' | 'description' | 'address'; before: string; after: string }
  | { field: 'location'; before: { lat: number; lng: number }; after: { lat: number; lng: number } }
  | { field: 'price' | 'capacity'; before: number; after: number }
  | { field: 'lot_type'; before: LotType; after: LotType }
  | { field: 'amenities'; added: string[]; removed: string[] }
  | { field: 'photos'; added: number; removed: number };

/** Diferencias entre lo aprobado y lo actual, en el orden en que se muestran. Vacío = sin cambios. */
export function listingChangesSince(snapshot: ApprovedSnapshot, current: ListingCurrentState): ListingChange[] {
  const changes: ListingChange[] = [];
  const text = (value: string | null | undefined) => (value ?? '').trim();

  const name = { before: text(snapshot.name), after: text(current.name) };
  if (name.before !== name.after) changes.push({ field: 'name', ...name });

  const description = { before: text(snapshot.description), after: text(current.description) };
  if (description.before !== description.after) changes.push({ field: 'description', ...description });

  const address = { before: text(snapshot.address?.address), after: text(current.address) };
  if (address.before !== address.after) changes.push({ field: 'address', ...address });

  const before = { lat: Number(snapshot.address?.lat), lng: Number(snapshot.address?.lng) };
  if (before.lat !== current.latitude || before.lng !== current.longitude) {
    changes.push({ field: 'location', before, after: { lat: current.latitude, lng: current.longitude } });
  }

  if (snapshot.lot_type && snapshot.lot_type !== current.lotType) {
    changes.push({ field: 'lot_type', before: snapshot.lot_type, after: current.lotType });
  }

  if (Number(snapshot.price) !== Number(current.pricePerHour)) {
    changes.push({ field: 'price', before: Number(snapshot.price), after: Number(current.pricePerHour) });
  }

  if (Number(snapshot.capacity) !== Number(current.capacity)) {
    changes.push({ field: 'capacity', before: Number(snapshot.capacity), after: Number(current.capacity) });
  }

  const approvedAmenities = snapshot.amenities ?? [];
  const addedAmenities = current.amenities.filter((a) => !approvedAmenities.includes(a));
  const removedAmenities = approvedAmenities.filter((a) => !current.amenities.includes(a));
  if (addedAmenities.length > 0 || removedAmenities.length > 0) {
    changes.push({ field: 'amenities', added: addedAmenities, removed: removedAmenities });
  }

  const approvedPhotos = snapshot.photos ?? [];
  const addedPhotos = current.photoPaths.filter((p) => !approvedPhotos.includes(p)).length;
  const removedPhotos = approvedPhotos.filter((p) => !current.photoPaths.includes(p)).length;
  if (addedPhotos > 0 || removedPhotos > 0) {
    changes.push({ field: 'photos', added: addedPhotos, removed: removedPhotos });
  }

  return changes;
}
