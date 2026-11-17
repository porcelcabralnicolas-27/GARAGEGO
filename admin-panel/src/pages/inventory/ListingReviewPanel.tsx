import { useEffect, useMemo, useState } from 'react';

import { formatDate, formatMoney, formatRelative, fullName } from '../../lib/format';
import {
  APPROVAL_STATUS_LABELS,
  DOCUMENT_KIND_LABELS,
  HOLDER_ROLE_LABELS,
  LISTING_CHANGE_FIELDS,
  LISTING_CHANGE_FIELD_LABELS,
  LOT_TYPE_LABELS,
  OPERATIONAL_STATE_LABELS,
  findContactInfo,
  missingDocumentRequirements,
  operationalStateOf,
  type ListingChange,
  type ListingChangeField,
  type LotRow,
} from '../../domain';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, KeyValue, StarRating } from '../../ui/primitives';
import { itemsForLot, type ChecklistItem } from '../settings/checklistApi';
import { amenityLabel, useCatalogLabels } from '../settings/useCatalogLabels';
import { useModerationConfig } from '../settings/useModerationConfig';
import { useDocumentRules } from '../settings/useDocumentRules';
import { usePanelLimits } from '../settings/usePanelLimits';
import { priceReference, runAutoCheck, type AutoCheckResult } from './autoChecks';

type Props = {
  row: LotRow;
  now: number;
  /** Historial de moderación de esta cochera, más nuevo primero. */
  events: Array<{ id: string; label: string; detail: string | null; at: string }>;
  /** Todos los puntos del checklist (0092); acá se filtran los que corresponden a esta cochera. */
  checklistItems: ChecklistItem[];
  /** Todas las cocheras de la cola: el control de tarifa compara con las aprobadas parecidas (0096). */
  allRows: LotRow[];
  /** Aprobar con los puntos del checklist que el revisor tildó (ids). */
  onApprove: (checkedItems: string[]) => void;
  onReject: (reason: string) => void;
  onRequestChanges: (note: string, fields: ListingChangeField[]) => void;
  /** En modo lectura (pestaña de cocheras activas) se ocultan las acciones de moderación. */
  readOnly?: boolean;
};

export function ListingReviewPanel({
  row,
  now,
  events,
  checklistItems,
  allRows,
  onApprove,
  onReject,
  onRequestChanges,
  readOnly,
}: Props) {
  const { lot, owner, images, documents } = row;
  // Nombres de los servicios desde el catálogo (0094); re-renderiza cuando llegan.
  useCatalogLabels();

  // La titularidad se verifica una sola vez (0089): con el sello, no se vuelven a pedir ni a
  // revisar documentos, y los puntos del checklist marcados "solo con documentos" no aplican.
  const ownershipVerified = lot.ownershipVerifiedAt !== null;
  // El checklist lo configura el equipo (Configuración, 0092): acá van los puntos de ESTA cochera.
  // En una edición, solo los puntos de lo que cambió (0096); en un alta (sin foto de lo aprobado), todos.
  const changedFields = useMemo(
    () => (row.approvedChanges ? row.approvedChanges.map((change) => change.field) : null),
    [row.approvedChanges]
  );
  const checklist = useMemo(
    () =>
      itemsForLot(checklistItems, {
        lotType: lot.lotType,
        isEdit: row.wasApproved,
        ownershipVerified,
        hasDocuments: documents.length > 0,
        changedFields,
      }),
    [checklistItems, lot.lotType, row.wasApproved, ownershipVerified, documents.length, changedFields]
  );
  // Límite de fotos (Configuración → Límites) y factor del control de tarifa (Moderación).
  const { max_parking_images: maxPhotos } = usePanelLimits();
  const { priceFactor } = useModerationConfig();
  // Qué documentos se piden (Configuración → Aprobación y titularidad, 0097).
  const documentRules = useDocumentRules();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [docLightbox, setDocLightbox] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  // Al cambiar de publicación se reinicia todo: si no, el tilde de la anterior habilitaría
  // aprobar una que el revisor ni miró.
  useEffect(() => {
    setChecked({});
    setLightbox(null);
    setDocLightbox(null);
  }, [lot.id]);

  const contactHits = useMemo(() => findContactInfo(lot.description), [lot.description]);
  const priceRef = useMemo(() => priceReference(allRows, row), [allRows, row]);
  // Resultado de los controles automáticos de los puntos que los tienen (0096).
  const autoResults = useMemo(() => {
    const results: Record<string, AutoCheckResult> = {};
    for (const item of checklist) {
      if (!item.autoCheck) continue;
      results[item.id] = runAutoCheck(item.autoCheck, {
        photoCount: images.length,
        maxPhotos,
        changes: row.approvedChanges,
        contactHits,
        price: Number(lot.pricePerHour),
        priceRef,
        priceFactor,
      });
    }
    return results;
  }, [checklist, images.length, maxPhotos, row.approvedChanges, contactHits, lot.pricePerHour, priceRef, priceFactor]);
  const allChecked = checklist.every((item) => !item.required || checked[item.id]);
  const isPending = lot.approvalStatus === 'pending' || lot.approvalStatus === 'changes_requested';
  // Sin los documentos completos el servidor no deja aprobar (migración 0078): se avisa antes.
  // Con la titularidad ya verificada no falta nada (`lot_missing_documents` devuelve vacío).
  const missingDocs = ownershipVerified
    ? []
    : missingDocumentRequirements(
        lot.holderRole,
        documents.map((d) => d.kind),
        lot.lotType,
        documentRules
      );
  // Tampoco se aprueba sin ninguna foto: el servidor no lo deja (migración 0082).
  const hasPhotos = images.length > 0;
  const canApprove = allChecked && missingDocs.length === 0 && hasPhotos;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Cabecera fija */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          background: 'var(--gg-surface)',
          borderBottom: '1px solid var(--gg-border)',
          padding: 'var(--gg-s4)',
          zIndex: 2,
        }}
      >
        <div className="gg-row" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 'var(--gg-fs-lg)', fontWeight: 600 }}>{lot.name}</h2>
          <Badge
            tone={
              lot.approvalStatus === 'approved'
                ? 'ok'
                : lot.approvalStatus === 'rejected'
                  ? 'danger'
                  : lot.approvalStatus === 'changes_requested'
                    ? 'info'
                    : 'warn'
            }
          >
            {APPROVAL_STATUS_LABELS[lot.approvalStatus]}
          </Badge>
          {lot.approvalStatus === 'approved' && operationalStateOf(lot) === 'paused_by_owner' ? (
            <Badge tone="warn">{OPERATIONAL_STATE_LABELS.paused_by_owner}</Badge>
          ) : null}
        </div>
        <div style={{ color: 'var(--gg-text-soft)' }}>{lot.address}</div>
        <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', marginTop: 2 }}>
          Enviada {formatRelative(lot.submittedAt, now)}
          {owner ? ` por ${fullName(owner)}` : ''}
        </div>
      </header>

      <div style={{ padding: 'var(--gg-s4)', flex: 1 }}>
        {/* Galería */}
        <div style={{ marginBottom: 'var(--gg-s4)' }}>
          {images.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setLightbox(0)}
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  border: '1px solid var(--gg-border)',
                  borderRadius: 'var(--gg-r3)',
                  overflow: 'hidden',
                  padding: 0,
                  background: 'none',
                  display: 'block',
                }}
                aria-label="Ampliar foto"
              >
                <img
                  src={images[0]}
                  alt={`${lot.name}, foto principal`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </button>

              <div className="gg-row" style={{ marginTop: 'var(--gg-s2)' }}>
                {images.map((src, i) => (
                  <button
                    key={src.slice(0, 40) + i}
                    type="button"
                    onClick={() => setLightbox(i)}
                    style={{
                      width: 72,
                      height: 48,
                      border: '1px solid var(--gg-border)',
                      borderRadius: 'var(--gg-r2)',
                      overflow: 'hidden',
                      padding: 0,
                      background: 'none',
                    }}
                    aria-label={`Ver foto ${i + 1}`}
                  >
                    <img
                      src={src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                ))}
                {images.length < maxPhotos ? (
                  <span style={{ marginLeft: 'var(--gg-s2)' }}>
                    <Badge tone="warn">
                      Solo {images.length} de {maxPhotos} fotos
                    </Badge>
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <Callout tone="warn">Esta publicación no tiene ninguna foto cargada.</Callout>
          )}
        </div>

        {/* Datos */}
        <div style={{ marginBottom: 'var(--gg-s4)' }}>
          <KeyValue
            items={[
              ['Tipo', LOT_TYPE_LABELS[lot.lotType]],
              ['Precio por hora', <strong key="p">{formatMoney(lot.pricePerHour)}</strong>],
              ['Capacidad', `${lot.capacity} ${lot.capacity === 1 ? 'auto' : 'autos'} a la vez`],
              [
                'Servicios',
                lot.amenities.length > 0 ? lot.amenities.map(amenityLabel).join(' · ') : 'Ninguno indicado',
              ],
              ['Dirección', lot.address],
              [
                'Coordenadas',
                <span key="c" className="gg-row">
                  <span className="gg-mono">
                    {lot.latitude.toFixed(5)}, {lot.longitude.toFixed(5)}
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${lot.latitude},${lot.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir en Maps
                  </a>
                </span>,
              ],
              ['Creada', formatDate(lot.createdAt)],
              ['Enviada a revisión', formatDate(lot.submittedAt)],
            ]}
          />
        </div>

        {/* Descripción, con los datos de contacto resaltados */}
        <div style={{ marginBottom: 'var(--gg-s4)' }}>
          <h3 className="gg-drawer__section-title">Descripción</h3>
          <p style={{ lineHeight: 1.6 }}>{lot.description ?? '—'}</p>
          {contactHits.length > 0 ? (
            <div style={{ marginTop: 'var(--gg-s2)' }}>
              <Callout tone="warn">
                <div>
                  <strong>Parece incluir datos de contacto:</strong>{' '}
                  {contactHits.map((hit) => (
                    <code key={hit} style={{ marginRight: 6 }}>
                      {hit}
                    </code>
                  ))}
                  <div style={{ marginTop: 4 }}>
                    Puede ser un intento de cerrar el trato por fuera de la app.
                  </div>
                </div>
              </Callout>
            </div>
          ) : null}
        </div>

        {/* Propietario */}
        {owner ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <h3 className="gg-drawer__section-title">Propietario</h3>
            <div className="gg-card" style={{ padding: 'var(--gg-s3)' }}>
              <div className="gg-row">
                <strong>{fullName(owner)}</strong>
                <span style={{ color: 'var(--gg-text-faint)' }}>{owner.email}</span>
              </div>
              <div
                style={{
                  color: 'var(--gg-text-soft)',
                  fontSize: 'var(--gg-fs-sm)',
                  marginTop: 4,
                }}
              >
                Alta {formatDate(owner.createdAt)}
                {lot.ratingAvg > 0 ? (
                  <span className="gg-row" style={{ display: 'inline-flex', marginLeft: 8 }}>
                    <StarRating value={lot.ratingAvg} /> {lot.ratingAvg.toFixed(2)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Una pendiente con fecha de revisión es una publicación aprobada que el propietario editó */}
        {lot.approvalStatus === 'pending' && lot.reviewedAt ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <Callout tone="info">
              <div>
                <strong>Edición de una publicación ya aprobada</strong>
                {row.approvedChanges ? (
                  <>
                    <p style={{ marginTop: 4 }}>
                      Cambios desde la última aprobación. Aprobá si están bien: la titularidad ya se
                      verificó y no hace falta pedir documentos. Los horarios no se revisan.
                    </p>
                    {row.approvedChanges.length > 0 ? (
                      <ul style={{ margin: 'var(--gg-s2) 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                        {row.approvedChanges.map((change) => (
                          <li key={change.field}>
                            <ChangeLine change={change} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ marginTop: 4 }}>
                        Los datos coinciden con lo aprobado (el propietario cambió algo y lo volvió atrás).
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ marginTop: 4 }}>
                    El propietario cambió los datos del lugar, la tarifa y los servicios o las fotos. Esta
                    edición es anterior al registro de cambios, así que no se puede mostrar qué se modificó:
                    revisá la publicación completa. Los horarios no se revisan.
                  </p>
                )}
              </div>
            </Callout>
          </div>
        ) : null}

        {/* Titularidad: lo que el propietario subió para acreditar que puede publicar este lugar */}
        {isPending ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <h3 className="gg-drawer__section-title">Titularidad</h3>
            <div className="gg-card" style={{ padding: 'var(--gg-s3)' }}>
              <div>
                <strong>{HOLDER_ROLE_LABELS[lot.holderRole]}</strong>
              </div>
              {lot.ownershipVerifiedAt ? (
                <div style={{ marginTop: 'var(--gg-s2)', color: 'var(--gg-text-soft)' }}>
                  La titularidad ya se verificó el {formatDate(lot.ownershipVerifiedAt)}. No se vuelve a pedir.
                </div>
              ) : null}
              {documents.length > 0 ? (
                <div className="gg-row" style={{ marginTop: 'var(--gg-s2)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {documents.map((doc, i) => (
                    <button
                      key={doc.kind}
                      type="button"
                      onClick={() => setDocLightbox(i)}
                      style={{
                        width: 96,
                        padding: 0,
                        background: 'none',
                        border: '1px solid var(--gg-border)',
                        borderRadius: 'var(--gg-r2)',
                        overflow: 'hidden',
                        textAlign: 'left',
                      }}
                      aria-label={`Ver ${DOCUMENT_KIND_LABELS[doc.kind]}`}
                    >
                      <img
                        src={doc.url}
                        alt=""
                        style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }}
                      />
                      <span style={{ display: 'block', padding: 4, fontSize: 'var(--gg-fs-sm)' }}>
                        {DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {ownershipVerified ? null : (
                <p style={{ marginTop: 'var(--gg-s2)', color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                  Por seguridad, los documentos se borran solos cuando aprobás o rechazás. Con "Pedir
                  cambios" se conservan.
                </p>
              )}
              {missingDocs.length > 0 ? (
                <div style={{ marginTop: 'var(--gg-s2)' }}>
                  <Callout tone="warn">
                    <div>
                      <strong>Faltan documentos:</strong> {missingDocs.map((m) => m.label).join(', ')}.
                      <div style={{ marginTop: 4 }}>
                        No se puede aprobar hasta que estén. Usá "Pedir cambios" y marcá "Documentos de titularidad".
                      </div>
                    </div>
                  </Callout>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Ya aprobada: queda el sello de quién verificó la titularidad y cuándo, sin los documentos */}
        {!isPending && lot.approvalStatus === 'approved' && lot.ownershipVerifiedAt ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <Callout tone="info">
              Titularidad verificada el {formatDate(lot.ownershipVerifiedAt)}. Los documentos ya se borraron.
            </Callout>
          </div>
        ) : null}

        {/* Motivo previo, si ya fue revisada */}
        {lot.rejectionReason ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <Callout tone={lot.approvalStatus === 'rejected' ? 'danger' : 'info'}>
              <div>
                <strong>
                  {lot.approvalStatus === 'rejected' ? 'Motivo del rechazo' : 'Cambios pedidos'}
                </strong>
                <p style={{ marginTop: 4 }}>{lot.rejectionReason}</p>
              </div>
            </Callout>
          </div>
        ) : null}

        {/* Reenvío tras "Pedir cambios": qué se había pedido. El servidor ya verificó que cada
            uno de esos campos se modificó antes de dejar reenviar (migración 0072). */}
        {lot.approvalStatus === 'pending' && lot.requestedChanges.length > 0 ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <Callout tone="info">
              <div>
                <strong>Reenviada tras pedir cambios</strong>
                <p style={{ marginTop: 4 }}>
                  Se había pedido modificar:{' '}
                  {lot.requestedChanges.map((f) => LISTING_CHANGE_FIELD_LABELS[f]).join(', ')}. El sistema
                  verificó que el propietario modificó todo lo pedido antes de dejarla reenviar.
                </p>
              </div>
            </Callout>
          </div>
        ) : null}

        {/* Checklist: solo cuando hay algo que decidir */}
        {!readOnly && isPending ? (
          <div style={{ marginBottom: 'var(--gg-s4)' }}>
            <h3 className="gg-drawer__section-title">Checklist de revisión</h3>
            {changedFields ? (
              <p style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', margin: '0 0 var(--gg-s2)' }}>
                Es una edición: van los puntos de lo que cambió y los que se revisan siempre.
              </p>
            ) : null}
            {checklist.length === 0 ? (
              <p style={{ color: 'var(--gg-text-soft)' }}>
                No hay puntos del checklist para esta publicación. Se configuran en Configuración.
              </p>
            ) : (
              <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
                {checklist.map((item) => (
                  <label
                    key={item.id}
                    className="gg-row"
                    style={{ cursor: 'pointer', alignItems: 'flex-start', flexWrap: 'nowrap' }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checked[item.id])}
                      onChange={(e) => setChecked((current) => ({ ...current, [item.id]: e.target.checked }))}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      {item.label}
                      {item.required ? null : (
                        <span style={{ marginLeft: 6 }}>
                          <Badge>Opcional</Badge>
                        </span>
                      )}
                      {item.help ? (
                        <span
                          style={{
                            display: 'block',
                            color: 'var(--gg-text-faint)',
                            fontSize: 'var(--gg-fs-sm)',
                            marginTop: 2,
                          }}
                        >
                          {item.help}
                        </span>
                      ) : null}
                      {autoResults[item.id] ? <AutoCheckLine result={autoResults[item.id]} /> : null}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Historial */}
        <div>
          <h3 className="gg-drawer__section-title">Historial de moderación</h3>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {events.map((ev) => (
              <li
                key={ev.id}
                style={{
                  borderLeft: '2px solid var(--gg-border-strong)',
                  paddingLeft: 'var(--gg-s3)',
                  paddingBottom: 'var(--gg-s3)',
                }}
              >
                <div className="gg-row">
                  <strong style={{ fontSize: 'var(--gg-fs-md)' }}>{ev.label}</strong>
                  <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                    {formatRelative(ev.at, now)}
                  </span>
                </div>
                {ev.detail ? (
                  <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}>
                    {ev.detail}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Acciones fijas al pie */}
      {!readOnly && isPending ? (
        <footer
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--gg-surface)',
            borderTop: '1px solid var(--gg-border)',
            padding: 'var(--gg-s3) var(--gg-s4)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--gg-s2)',
          }}
        >
          <Button
            variant="primary"
            disabled={!canApprove}
            onClick={() => onApprove(checklist.filter((item) => checked[item.id]).map((item) => item.id))}
            title={
              canApprove
                ? undefined
                : !hasPhotos
                  ? 'La publicación no tiene ninguna foto'
                  : missingDocs.length > 0
                    ? 'Faltan los documentos de titularidad'
                    : 'Tildá los puntos obligatorios del checklist para poder aprobar'
            }
          >
            Aprobar y publicar
          </Button>
          <Button onClick={() => setChangesOpen(true)}>Pedir cambios</Button>
          <Button variant="danger" onClick={() => setRejectOpen(true)}>
            Rechazar
          </Button>
          {!canApprove ? (
            <span
              style={{
                alignSelf: 'center',
                color: 'var(--gg-text-faint)',
                fontSize: 'var(--gg-fs-sm)',
              }}
            >
              {!hasPhotos
                ? 'Sin ninguna foto no se puede aprobar'
                : missingDocs.length > 0
                  ? 'Faltan documentos de titularidad: no se puede aprobar'
                  : 'Tildá los puntos obligatorios del checklist para habilitar la aprobación'}
            </span>
          ) : null}
        </footer>
      ) : null}

      <LightboxModal
        images={images}
        index={lightbox}
        name={lot.name}
        onClose={() => setLightbox(null)}
        onIndex={setLightbox}
      />

      <LightboxModal
        images={documents.map((d) => d.url)}
        index={docLightbox}
        name="Documentos de titularidad"
        onClose={() => setDocLightbox(null)}
        onIndex={setDocLightbox}
      />

      <RejectDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        lotName={lot.name}
        ownerName={owner ? fullName(owner) : 'el propietario'}
        onConfirm={(reason) => {
          setRejectOpen(false);
          onReject(reason);
        }}
      />

      <ChangesDialog
        open={changesOpen}
        ownershipVerified={ownershipVerified}
        onClose={() => setChangesOpen(false)}
        onConfirm={(note, fields) => {
          setChangesOpen(false);
          onRequestChanges(note, fields);
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Lightbox */

function LightboxModal({
  images,
  index,
  name,
  onClose,
  onIndex,
}: {
  images: string[];
  index: number | null;
  name: string;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  if (index === null) return null;

  return (
    <Modal open title={`${name} · foto ${index + 1} de ${images.length}`} onClose={onClose} wide>
      <img src={images[index]} alt="" style={{ width: '100%', borderRadius: 'var(--gg-r3)' }} />
      <div className="gg-row" style={{ justifyContent: 'center', marginTop: 'var(--gg-s3)' }}>
        <Button
          size="sm"
          disabled={index === 0}
          onClick={() => onIndex(Math.max(0, index - 1))}
        >
          ← Anterior
        </Button>
        <Button
          size="sm"
          disabled={index >= images.length - 1}
          onClick={() => onIndex(Math.min(images.length - 1, index + 1))}
        >
          Siguiente →
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Controles automáticos */

const AUTO_CHECK_STYLE: Record<AutoCheckResult['tone'], { icon: string; color: string }> = {
  ok: { icon: '✓', color: 'var(--gg-ok)' },
  warn: { icon: '⚠', color: 'var(--gg-warn)' },
  neutral: { icon: 'ⓘ', color: 'var(--gg-text-soft)' },
};

/** Resultado de un control automático (0096), debajo del punto del checklist. */
function AutoCheckLine({ result }: { result: AutoCheckResult }) {
  const style = AUTO_CHECK_STYLE[result.tone];
  return (
    <span
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
        color: style.color,
        fontSize: 'var(--gg-fs-sm)',
        marginTop: 4,
        fontWeight: result.tone === 'warn' ? 600 : 400,
      }}
    >
      <span aria-hidden>{style.icon}</span>
      <span>{result.text}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- Rechazo */

function RejectDialog({
  open,
  onClose,
  onConfirm,
  lotName,
  ownerName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  lotName: string;
  ownerName: string;
}) {
  // Motivos de rechazo (Configuración → Moderación, 0095). Si el elegido se desactiva, el primero.
  const rejectReasons = useModerationConfig().reasons.reject;
  const [chosenReason, setReason] = useState<string | null>(null);
  const reason = chosenReason && rejectReasons.includes(chosenReason) ? chosenReason : rejectReasons[0];
  const [detail, setDetail] = useState('');

  const fullReason = `${reason}. ${detail}`.trim();
  const canConfirm = detail.trim().length >= 10;

  return (
    <Modal
      open={open}
      title="Rechazar publicación"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={!canConfirm} onClick={() => onConfirm(fullReason)}>
            Rechazar publicación
          </Button>
        </>
      }
    >
      <div className="gg-field">
        <label className="gg-field__label">Motivo</label>
        <select className="gg-select" value={reason} onChange={(e) => setReason(e.target.value)}>
          {rejectReasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="gg-field">
        <label className="gg-field__label">
          Detalle para el propietario (mínimo 10 caracteres)
        </label>
        <textarea
          className="gg-textarea"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Explicá qué tiene que corregir para poder volver a enviarla."
        />
      </div>

      <div>
        <h3 className="gg-drawer__section-title">Vista previa del mensaje</h3>
        <Callout tone="neutral">
          <div>
            Hola {ownerName}, revisamos tu publicación <strong>{lotName}</strong> y por ahora no la
            podemos aprobar.
            <p style={{ marginTop: 6 }}>{fullReason || '…'}</p>
          </div>
        </Callout>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Cambios desde la aprobación */

const CHANGE_LABELS: Record<ListingChange['field'], string> = {
  name: 'Nombre',
  description: 'Descripción',
  address: 'Dirección',
  location: 'Ubicación en el mapa',
  lot_type: 'Tipo',
  price: 'Precio por hora',
  capacity: 'Capacidad',
  amenities: 'Servicios',
  photos: 'Fotos',
};

const amenityList = (codes: string[]) => codes.map(amenityLabel).join(', ');

/** Una línea "Campo: antes → ahora". */
function ChangeLine({ change }: { change: ListingChange }) {
  const label = <strong>{CHANGE_LABELS[change.field]}:</strong>;
  const arrow = (before: string, after: string) => (
    <>
      {label} <s style={{ color: 'var(--gg-text-faint)' }}>{before || '(vacío)'}</s> → {after || '(vacío)'}
    </>
  );

  switch (change.field) {
    case 'name':
    case 'description':
    case 'address':
      return arrow(change.before, change.after);
    case 'location':
      return (
        <>
          {label}{' '}
          <span className="gg-mono">
            {change.before.lat.toFixed(5)}, {change.before.lng.toFixed(5)} → {change.after.lat.toFixed(5)},{' '}
            {change.after.lng.toFixed(5)}
          </span>{' '}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${change.after.lat},${change.after.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver la nueva
          </a>
        </>
      );
    case 'lot_type':
      return arrow(LOT_TYPE_LABELS[change.before], LOT_TYPE_LABELS[change.after]);
    case 'price':
      return arrow(formatMoney(change.before), formatMoney(change.after));
    case 'capacity':
      return arrow(String(change.before), String(change.after));
    case 'amenities':
      return (
        <>
          {label} {change.added.length > 0 ? `se agregó ${amenityList(change.added)}` : null}
          {change.added.length > 0 && change.removed.length > 0 ? '; ' : null}
          {change.removed.length > 0 ? `se quitó ${amenityList(change.removed)}` : null}
        </>
      );
    case 'photos':
      return (
        <>
          {label} {change.added > 0 ? `${change.added} nueva${change.added === 1 ? '' : 's'}` : null}
          {change.added > 0 && change.removed > 0 ? ', ' : null}
          {change.removed > 0 ? `${change.removed} quitada${change.removed === 1 ? '' : 's'}` : null}
        </>
      );
  }
}

/* ---------------------------------------------------------------- Pedir cambios */

function ChangesDialog({
  open,
  ownershipVerified,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Con la titularidad verificada no se pueden pedir documentos (0089). */
  ownershipVerified: boolean;
  onClose: () => void;
  onConfirm: (note: string, fields: ListingChangeField[]) => void;
}) {
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<ListingChangeField[]>([]);
  const availableFields = ownershipVerified
    ? LISTING_CHANGE_FIELDS.filter((field) => field !== 'documents')
    : LISTING_CHANGE_FIELDS;

  const toggle = (field: ListingChangeField) =>
    setFields((current) => (current.includes(field) ? current.filter((f) => f !== field) : [...current, field]));

  return (
    <Modal
      open={open}
      title="Pedir cambios"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={note.trim().length < 10 || fields.length === 0}
            onClick={() => {
              onConfirm(note.trim(), fields);
              setNote('');
              setFields([]);
            }}
          >
            Enviar pedido
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--gg-s3)', color: 'var(--gg-text-soft)' }}>
        La publicación queda en espera y el propietario puede corregirla y volver a enviarla, sin
        tener que crearla de nuevo.
      </p>

      <div className="gg-field">
        <label className="gg-field__label">¿Qué tiene que modificar el propietario?</label>
        <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
          {availableFields.map((field) => (
            <label key={field} className="gg-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={fields.includes(field)} onChange={() => toggle(field)} />
              <span>{LISTING_CHANGE_FIELD_LABELS[field]}</span>
            </label>
          ))}
        </div>
        <p style={{ marginTop: 'var(--gg-s2)', color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          No va a poder reenviarla a revisión hasta que haya modificado cada uno de los puntos marcados.
        </p>
      </div>

      <textarea
        className="gg-textarea"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ej.: falta una foto donde se vea el acceso desde la calle."
      />
    </Modal>
  );
}
