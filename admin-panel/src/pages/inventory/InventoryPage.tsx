import { useMemo, useState } from 'react';

import { formatMoney, formatRelative, fullName } from '../../lib/format';
import { businessInstant } from '../../lib/time';
import {
  MODERATION_STATE_LABELS,
  slaLevel,
  type AdminParkingLot,
  type ApprovalStatus,
  type LotRow,
  type ModerationState,
} from '../../domain';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Modal } from '../../ui/overlays';
import { SearchInput, SubTabs, Tabs, Toolbar, FilterSelect } from '../../ui/controls';
import { Badge, Button, Callout, EmptyState, Toggle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { ListingReviewPanel } from './ListingReviewPanel';
import { type ReviewDecision } from './moderationApi';
import { useModerationQueue, type ModerationQueue } from './useModerationQueue';

type MainTab = 'approvals' | 'active';

export function InventoryPage() {
  const queue = useModerationQueue();
  const pendingCount = queue.rows.filter((r) => r.lot.approvalStatus === 'pending').length;

  const [tab, setTab] = useState<MainTab>('approvals');

  return (
    <>
      <PageHeader
        title="Control de inventario"
        description="Revisión de las publicaciones nuevas antes de que salgan en vivo, y control sobre las cocheras ya publicadas."
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'approvals', label: 'Aprobaciones', count: pendingCount, countTone: 'warn' },
          { value: 'active', label: 'Cocheras publicadas' },
        ]}
      />

      {queue.loading && queue.rows.length === 0 ? (
        <EmptyState icon="⏳" title="Cargando inventario" description="Un momento." />
      ) : queue.error ? (
        <div style={{ padding: 'var(--gg-s4)' }}>
          <Callout tone="danger">
            <div>
              <strong>No se pudo cargar el inventario.</strong>
              <p style={{ marginTop: 4 }}>{queue.error}</p>
              <div style={{ marginTop: 'var(--gg-s3)' }}>
                <Button onClick={queue.refetch}>Reintentar</Button>
              </div>
            </div>
          </Callout>
        </div>
      ) : tab === 'approvals' ? (
        <ApprovalQueue queue={queue} />
      ) : (
        <ActiveListings queue={queue} />
      )}
    </>
  );
}

/* ================================================================ Bandeja de aprobación */

type QueueTab = ApprovalStatus;

function ApprovalQueue({ queue }: { queue: ModerationQueue }) {
  const { rows, review } = queue;
  const { show } = useToast();

  const [queueTab, setQueueTab] = useState<QueueTab>('pending');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = Date.now();

  const countOf = (status: ApprovalStatus) =>
    rows.filter((r) => r.lot.approvalStatus === status).length;

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => r.lot.approvalStatus === queueTab)
      .filter(
        (r) =>
          !term ||
          r.lot.name.toLowerCase().includes(term) ||
          r.lot.address.toLowerCase().includes(term) ||
          (r.owner ? fullName(r.owner).toLowerCase().includes(term) : false)
      )
      // Es una cola, no un feed: primero lo que más tiempo lleva esperando.
      .sort((a, b) => b.ageHours - a.ageHours);
  }, [rows, queueTab, search]);

  // Si no hay nada seleccionado (o lo que estaba salió de la cola), se toma el primero.
  const selected = visible.find((r) => r.lot.id === selectedId) ?? visible[0] ?? null;

  /** Tras moderar, se pasa a la siguiente de la cola en vez de dejar el panel vacío: el revisor
   *  está procesando una fila atrás de otra, no volviendo a la lista cada vez. */
  const advance = (currentId: string) => {
    const index = visible.findIndex((r) => r.lot.id === currentId);
    const next = visible[index + 1] ?? visible[index - 1] ?? null;
    setSelectedId(next?.lot.id ?? null);
  };

  /** Ejecuta la decisión contra la base. Ya no hay "deshacer": `admin_review_parking_lot` no
   *  tiene reverso y un rechazo se corrige volviendo a aprobar. */
  const runReview = async (
    lot: AdminParkingLot,
    decision: ReviewDecision,
    reason: string | null,
    okMessage: string
  ) => {
    advance(lot.id);
    try {
      await review(lot.id, decision, reason);
      show(okMessage);
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo completar la acción'}`);
    }
  };

  return (
    <div className="gg-split">
      <div className="gg-split__list">
        <SubTabs
          value={queueTab}
          onChange={setQueueTab}
          items={[
            { value: 'pending', label: 'Pendientes', count: countOf('pending') },
            { value: 'changes_requested', label: 'Cambios pedidos', count: countOf('changes_requested') },
            { value: 'approved', label: 'Aprobadas', count: countOf('approved') },
            { value: 'rejected', label: 'Rechazadas', count: countOf('rejected') },
          ]}
        />

        <div style={{ padding: 'var(--gg-s3)', borderBottom: '1px solid var(--gg-border)' }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cochera, dirección o propietario"
            width={320}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon="✓"
            title={queueTab === 'pending' ? 'Bandeja al día' : 'Nada por acá'}
            description={
              queueTab === 'pending'
                ? 'No hay publicaciones esperando revisión.'
                : 'No hay publicaciones en este estado.'
            }
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {visible.map((row) => (
              <ApprovalListItem
                key={row.lot.id}
                row={row}
                now={now}
                isSelected={selected?.lot.id === row.lot.id}
                onSelect={() => setSelectedId(row.lot.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="gg-split__detail">
        {selected ? (
          <ListingReviewPanel
            row={selected}
            now={now}
            events={historyOf(selected.lot)}
            onApprove={() =>
              runReview(selected.lot, 'approved', null, `"${selected.lot.name}" aprobada y publicada`)
            }
            onReject={(reason) =>
              runReview(selected.lot, 'rejected', reason, `"${selected.lot.name}" rechazada`)
            }
            onRequestChanges={(note) =>
              runReview(
                selected.lot,
                'changes_requested',
                note,
                `Se pidieron cambios en "${selected.lot.name}"`
              )
            }
          />
        ) : (
          <EmptyState
            icon="◫"
            title="Elegí una publicación"
            description="Seleccioná una de la lista para revisarla."
          />
        )}
      </div>
    </div>
  );
}

/** Historial de moderación derivado de la fila: el envío a revisión y la última decisión, si
 *  la hubo. Cuando exista una tabla `listing_moderation_events` se reemplaza por su query. */
function historyOf(
  lot: AdminParkingLot
): Array<{ id: string; label: string; detail: string | null; at: string }> {
  const events: Array<{ id: string; label: string; detail: string | null; at: string }> = [
    { id: `${lot.id}-submit`, label: 'Enviada a revisión', detail: null, at: lot.submittedAt },
  ];
  if (lot.reviewedAt) {
    const label =
      lot.approvalStatus === 'approved'
        ? 'Aprobada por el equipo'
        : lot.approvalStatus === 'rejected'
          ? 'Rechazada por el equipo'
          : lot.approvalStatus === 'changes_requested'
            ? 'Se pidieron cambios'
            : 'Revisada';
    events.push({ id: `${lot.id}-review`, label, detail: lot.rejectionReason, at: lot.reviewedAt });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

const SLA_TONE = {
  ok: 'var(--gg-border-strong)',
  info: 'var(--gg-info)',
  warn: 'var(--gg-warn)',
  danger: 'var(--gg-danger)',
} as const;

function ApprovalListItem({
  row,
  now,
  isSelected,
  onSelect,
}: {
  row: LotRow;
  now: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const level = slaLevel(row.ageHours);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        style={{
          display: 'flex',
          gap: 'var(--gg-s3)',
          width: '100%',
          textAlign: 'left',
          padding: 'var(--gg-s3)',
          border: 0,
          borderBottom: '1px solid var(--gg-border)',
          borderLeft: `3px solid ${SLA_TONE[level]}`,
          background: isSelected ? 'var(--gg-surface-3)' : 'transparent',
        }}
      >
        {row.images[0] ? (
          <img
            src={row.images[0]}
            alt=""
            style={{
              width: 56,
              height: 56,
              objectFit: 'cover',
              borderRadius: 'var(--gg-r2)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--gg-r2)',
              background: 'var(--gg-neutral-soft)',
              flexShrink: 0,
            }}
          />
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.lot.name}
          </div>
          <div
            style={{
              color: 'var(--gg-text-soft)',
              fontSize: 'var(--gg-fs-sm)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {row.lot.address}
          </div>
          <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', marginTop: 2 }}>
            {row.owner ? fullName(row.owner) : '—'} · {formatMoney(row.lot.pricePerHour)}/h
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span style={{ color: SLA_TONE[level], fontSize: 'var(--gg-fs-sm)', fontWeight: 600 }}>
            {formatRelative(row.lot.submittedAt, now)}
          </span>
        </div>
      </button>
    </li>
  );
}

/* ================================================================ Gestión forzada */

type StateFilter = ModerationState | 'all';

function ActiveListings({ queue }: { queue: ModerationQueue }) {
  const { rows, setModeration } = queue;
  const { show } = useToast();
  const now = Date.now();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [pauseTarget, setPauseTarget] = useState<LotRow | null>(null);
  const [detail, setDetail] = useState<LotRow | null>(null);

  const approvedCount = rows.filter((r) => r.lot.approvalStatus === 'approved').length;

  const published = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => r.lot.approvalStatus === 'approved')
      .filter((r) => stateFilter === 'all' || r.lot.moderationState === stateFilter)
      .filter(
        (r) =>
          !term ||
          r.lot.name.toLowerCase().includes(term) ||
          r.lot.address.toLowerCase().includes(term) ||
          (r.owner ? fullName(r.owner).toLowerCase().includes(term) : false)
      );
  }, [rows, search, stateFilter]);

  const runModeration = async (
    row: LotRow,
    state: ModerationState,
    reason: string | null,
    until: string | null,
    okMessage: string
  ) => {
    try {
      await setModeration(row.lot.id, state, reason, until);
      show(okMessage);
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo cambiar el estado'}`);
    }
  };

  const reactivate = (row: LotRow) =>
    runModeration(row, 'live', null, null, `"${row.lot.name}" volvió a estar en vivo`);

  const columns: Column<LotRow>[] = [
    {
      key: 'lot',
      header: 'Cochera',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500 }}>{r.lot.name}</div>
          <div className="gg-user-cell__sub">{r.lot.address}</div>
        </div>
      ),
      sortValue: (r) => r.lot.name,
    },
    {
      key: 'owner',
      header: 'Propietario',
      render: (r) => (r.owner ? fullName(r.owner) : '—'),
      sortValue: (r) => (r.owner ? fullName(r.owner) : ''),
    },
    {
      key: 'price',
      header: 'Precio/h',
      align: 'num',
      render: (r) => formatMoney(r.lot.pricePerHour),
      sortValue: (r) => r.lot.pricePerHour,
    },
    {
      key: 'bookings',
      header: 'Reservas 30 d',
      align: 'num',
      render: (r) => r.bookings30d,
      sortValue: (r) => r.bookings30d,
    },
    {
      key: 'inuse',
      header: 'En uso ahora',
      render: (r) =>
        r.hasActiveSession ? (
          <Badge tone="ok" dot>
            Sesión activa
          </Badge>
        ) : (
          <span style={{ color: 'var(--gg-text-faint)' }}>—</span>
        ),
      sortValue: (r) => (r.hasActiveSession ? 1 : 0),
    },
    {
      key: 'state',
      header: 'Estado',
      render: (r) =>
        r.lot.archivedAt ? (
          // El propietario la borró pero tenía historial: se conserva, pero ya no se publica.
          <Badge tone="neutral">Archivada</Badge>
        ) : (
          <Badge
            tone={
              r.lot.moderationState === 'live'
                ? 'ok'
                : r.lot.moderationState === 'suspended'
                  ? 'danger'
                  : 'warn'
            }
          >
            {MODERATION_STATE_LABELS[r.lot.moderationState]}
          </Badge>
        ),
      sortValue: (r) => (r.lot.archivedAt ? 'archived' : r.lot.moderationState),
    },
    {
      key: 'actions',
      header: 'En vivo',
      render: (r) => (
        <div className="gg-row" onClick={(e) => e.stopPropagation()}>
          <Toggle
            checked={r.lot.moderationState === 'live' && !r.lot.archivedAt}
            disabled={r.lot.archivedAt !== null}
            label={`Publicar ${r.lot.name}`}
            onChange={(next) => (next ? reactivate(r) : setPauseTarget(r))}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <Toolbar count={`${published.length} de ${approvedCount}`}>
        <SearchInput value={search} onChange={setSearch} placeholder="Cochera, dirección o propietario" />
        <FilterSelect
          label="Estado"
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'live', label: 'En vivo' },
            { value: 'paused_by_admin', label: 'Pausadas por admin' },
            { value: 'suspended', label: 'Suspendidas' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={published}
        rowKey={(r) => r.lot.id}
        onRowClick={setDetail}
        emptyTitle="Sin cocheras publicadas"
        emptyDescription="Cuando apruebes publicaciones van a aparecer acá."
      />

      <ForcePauseDialog
        row={pauseTarget}
        onClose={() => setPauseTarget(null)}
        onConfirm={(nextState, reason, until) => {
          if (!pauseTarget) return;
          const target = pauseTarget;
          setPauseTarget(null);
          void runModeration(
            target,
            nextState,
            reason,
            until,
            nextState === 'suspended'
              ? `"${target.lot.name}" suspendida`
              : `"${target.lot.name}" pausada`
          );
        }}
      />

      {detail ? (
        <Modal open title={detail.lot.name} onClose={() => setDetail(null)} wide>
          <ListingReviewPanel
            row={detail}
            now={now}
            events={historyOf(detail.lot)}
            onApprove={() => undefined}
            onReject={() => undefined}
            onRequestChanges={() => undefined}
            readOnly
          />
        </Modal>
      ) : null}
    </>
  );
}

const PAUSE_REASONS = [
  'Denuncias de acceso bloqueado',
  'Datos de la publicación no verificables',
  'Reclamos reiterados de conductores',
  'Verificación de titularidad pendiente',
  'Otro',
];

/**
 * El diálogo importante de la gestión forzada: antes de sacar una cochera de circulación hay que
 * mostrarle al operador qué está por romper. Las advertencias se calculan de los datos reales de
 * la fila, no son texto fijo.
 */
function ForcePauseDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: LotRow | null;
  onClose: () => void;
  onConfirm: (state: ModerationState, reason: string, until: string | null) => void;
}) {
  const [reason, setReason] = useState(PAUSE_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [until, setUntil] = useState('');

  if (!row) return null;

  const fullReason = detail.trim() ? `${reason}: ${detail.trim()}` : reason;

  return (
    <Modal
      open
      title={`Pausar "${row.lot.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() =>
              onConfirm(
                until ? 'suspended' : 'paused_by_admin',
                fullReason,
                // Medianoche de ese día en Argentina. `new Date('YYYY-MM-DD')` es medianoche UTC,
                // que en Argentina todavía es las 21:00 del día anterior.
                until ? businessInstant(until, '00:00').toISOString() : null
              )
            }
          >
            {until ? 'Suspender hasta esa fecha' : 'Pausar publicación'}
          </Button>
        </>
      }
    >
      {row.hasActiveSession ? (
        <div style={{ marginBottom: 'var(--gg-s3)' }}>
          <Callout tone="danger">
            <div>
              <strong>Hay una sesión en curso en esta cochera.</strong>
              <p style={{ marginTop: 4 }}>
                Pausar no la interrumpe: el conductor que ya está adentro termina normalmente.
              </p>
            </div>
          </Callout>
        </div>
      ) : null}

      {row.upcomingBookings > 0 ? (
        <div style={{ marginBottom: 'var(--gg-s3)' }}>
          <Callout tone="warn">
            <div>
              <strong>
                {row.upcomingBookings} reserva{row.upcomingBookings === 1 ? '' : 's'} confirmada
                {row.upcomingBookings === 1 ? '' : 's'} en los próximos 7 días.
              </strong>
              <p style={{ marginTop: 4 }}>
                Pausar no las cancela: solo saca la cochera de la búsqueda para reservas nuevas.
                Si hace falta cancelarlas, se hace una por una.
              </p>
            </div>
          </Callout>
        </div>
      ) : null}

      <div className="gg-field">
        <label className="gg-field__label">Motivo</label>
        <select className="gg-select" value={reason} onChange={(e) => setReason(e.target.value)}>
          {PAUSE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="gg-field">
        <label className="gg-field__label">Detalle (opcional)</label>
        <textarea
          className="gg-textarea"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Queda registrado en el historial de moderación de la cochera."
        />
      </div>

      <div className="gg-field">
        <label className="gg-field__label">
          Suspender hasta una fecha (opcional)
        </label>
        <input
          className="gg-input"
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
        <span style={{ fontSize: 'var(--gg-fs-sm)', color: 'var(--gg-text-faint)' }}>
          Sin fecha, la pausa es indefinida hasta que alguien la reactive.
        </span>
      </div>
    </Modal>
  );
}
