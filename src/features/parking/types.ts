// ApprovalStatus y ModerationState viven en shared/domain.ts (lo comparte con
// admin-panel/src/domain.ts): ver ese archivo para el porqué.
export type {
  Amenity,
  ApprovalStatus,
  DocumentKind,
  DocumentRequirement,
  HolderRole,
  ListingChangeField,
  LotType,
  ModerationState,
} from '../../../shared/domain';
export {
  AMENITIES,
  AMENITY_LABELS,
  DOCUMENT_KIND_LABELS,
  HOLDER_ROLES,
  HOLDER_ROLE_LABELS,
  LISTING_CHANGE_FIELD_LABELS,
  LOT_TYPES,
  LOT_TYPE_DESCRIPTIONS,
  LOT_TYPE_LABELS,
  documentRequirements,
  missingDocumentRequirements,
} from '../../../shared/domain';

import type {
  Amenity,
  ApprovalStatus,
  DocumentKind,
  HolderRole,
  ListingChangeField,
  LotType,
  ModerationState,
} from '../../../shared/domain';

export type ParkingLot = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  /** Cuántos autos pueden estar reservados en el mismo horario (0064). */
  capacity: number;
  /** Servicios que ofrece (0065). Puede estar vacío. */
  amenities: Amenity[];
  /** Cochera de casa o estacionamiento (0075). */
  lotType: LotType;
  /** Relación de quien publica con el lugar; define qué documentos se le piden (0078). */
  holderRole: HolderRole;
  /** Cuándo el equipo verificó la titularidad (0079). Los documentos se borran al verificar. */
  ownershipVerifiedAt: string | null;
  ratingAvg: number;
  isActive: boolean;
  createdAt: string;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  /** Qué pidió cambiar el equipo (0072); vacío si no hay un pedido de cambios. */
  requestedChanges: ListingChangeField[];
  moderationState: ModerationState;
};

export type ParkingLotWithDistance = ParkingLot & { distanceKm: number };

/**
 * Estado que ve el propietario en "Mis publicaciones". Combina las tres dimensiones
 * (publicada por el dueño / aprobada por el equipo / frenada por el admin) en una sola
 * etiqueta, porque para el dueño son un único "¿por qué no me entran reservas?".
 */
export type ListingStatus =
  | 'active'
  | 'paused'
  | 'pending'
  | 'changes_requested'
  | 'rejected'
  | 'paused_by_admin'
  | 'suspended';

export function getListingStatus(lot: ParkingLot): ListingStatus {
  if (lot.approvalStatus === 'rejected') return 'rejected';
  if (lot.approvalStatus === 'changes_requested') return 'changes_requested';
  if (lot.approvalStatus === 'pending') return 'pending';
  // approved: manda lo que haya hecho el admin, y si no, lo que decidió el dueño.
  if (lot.moderationState === 'suspended') return 'suspended';
  if (lot.moderationState === 'paused_by_admin') return 'paused_by_admin';
  return lot.isActive ? 'active' : 'paused';
}

export const MAX_PARKING_IMAGES = 3;

export type ParkingImage = {
  id: string;
  parkingLotId: string;
  storagePath: string;
  publicUrl: string;
  position: number;
};

export type RecurringAvailability = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AvailabilityException = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  isAvailable: boolean;
};

export const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** Documento de titularidad ya subido (0078). El archivo está en un bucket privado. */
export type LotDocument = {
  id: string;
  kind: DocumentKind;
  storagePath: string;
};
