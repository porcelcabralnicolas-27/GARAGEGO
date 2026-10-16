import { useEffect, useMemo, useState } from 'react';

import { formatDate, formatMoney, formatRelative, fullName } from '../../lib/format';
import {
  AMENITY_LABELS,
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
  type ListingChangeField,
  type LotRow,
} from '../../domain';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, KeyValue, StarRating } from '../../ui/primitives';

/** Los cinco puntos que el revisor tiene que chequear antes de publicar. Vacía el checklist
 *  cada vez que cambia la publicación: son decisiones sobre ESA cochera, no un estado global. */
const CHECKLIST = [
  'Las fotos muestran la cochera y son legibles',
  'La dirección es coherente con las coordenadas',
  'El precio está dentro de un rango razonable',
  'La descripción no incluye datos de contacto',
  'El DNI coincide con el propietario y los documentos acreditan su vínculo con esta dirección',
] as const;

type Props = {
  row: LotRow;
  now: number;
  /** Historial de moderación de esta cochera, más nuevo primero. */
  events: Array<{ id: string; label: string; detail: string | null; at: string }>;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onRequestChanges: (note: string, fields: ListingChangeField[]) => void;
  /** En modo lectura (pestaña de cocheras activas) se ocultan las acciones de moderación. */
  readOnly?: boolean;
};

export function ListingReviewPanel({
  row,
  now,
  events,
  onApprove,
  onReject,
  onRequestChanges,
  readOnly,
}: Props) {
  const { lot, owner, images, documents } = row;

  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [docLightbox, setDocLightbox] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  // Al cambiar de publicación se reinicia todo: si no, el tilde de la anterior habilitaría
  // aprobar una que el revisor ni miró.
  useEffect(() => {
    setChecked(CHECKLIST.map(() => false));
    setLightbox(null);
    setDocLightbox(null);
  }, [lot.id]);

  const contactHits = useMemo(() => findContactInfo(lot.description), [lot.description]);
  const allChecked = checked.every(Boolean);
  const isPending = lot.approvalStatus === 'pending' || lot.approvalStatus === 'changes_requested';
  // Sin los documentos completos el servidor no deja aprobar (migración 0078): se avisa antes.
  const missingDocs = missingDocumentRequirements(
    lot.holderRole,
    documents.map((d) => d.kind)
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
                {images.length < 3 ? (
                  <span style={{ marginLeft: 'var(--gg-s2)' }}>
                    <Badge tone="warn">Solo {images.length} de 3 fotos</Badge>
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
                lot.amenities.length > 0 ? lot.amenities.map((a) => AMENITY_LABELS[a]).join(' · ') : 'Ninguno indicado',
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
                <p style={{ marginTop: 4 }}>
                  El propietario cambió los datos del lugar, la tarifa y los servicios o las fotos. Revisá lo
                  que se modificó antes de volver a aprobarla. Los horarios no se revisan.
                </p>
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
                  La titularidad ya se verificó el {formatDate(lot.ownershipVerifiedAt)}.
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
              <p style={{ marginTop: 'var(--gg-s2)', color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                Por seguridad, los documentos se borran solos cuando aprobás o rechazás. Con "Pedir
                cambios" se conservan.
              </p>
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
            <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
              {CHECKLIST.map((item, i) => (
                <label key={item} className="gg-row" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={checked[i]}
                    onChange={(e) =>
                      setChecked((current) =>
                        current.map((c, idx) => (idx === i ? e.target.checked : c))
                      )
                    }
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
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
            onClick={onApprove}
            title={
              canApprove
                ? undefined
                : !hasPhotos
                  ? 'La publicación no tiene ninguna foto'
                  : missingDocs.length > 0
                    ? 'Faltan los documentos de titularidad'
                    : 'Completá la checklist para poder aprobar'
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
                  : 'Completá la checklist para habilitar la aprobación'}
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

/* ---------------------------------------------------------------- Rechazo */

const REJECT_REASONS = [
  'Fotos insuficientes o poco claras',
  'La dirección no se puede verificar',
  'No se pudo verificar la titularidad',
  'Precio fuera de rango',
  'Incluye datos de contacto en la descripción',
  'Contenido inapropiado',
  'Otro',
];

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
  const [reason, setReason] = useState(REJECT_REASONS[0]);
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
          {REJECT_REASONS.map((r) => (
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

function ChangesDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string, fields: ListingChangeField[]) => void;
}) {
  const [note, setNote] = useState('');
  const [fields, setFields] = useState<ListingChangeField[]>([]);

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
          {LISTING_CHANGE_FIELDS.map((field) => (
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
