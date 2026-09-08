import { useMemo, useState } from 'react';

import { formatDate, formatMoney, formatRelative, fullName } from '../../lib/format';
import type { AdminProfile } from '../../mocks/types';
import { useMock } from '../../state/MockDataProvider';
import {
  selectDrivers,
  selectOwners,
  selectRatingRows,
  selectRatingStats,
  type DriverRow,
  type OwnerRow,
  type RatingRow,
} from '../../state/selectors';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Drawer, DrawerSection, Modal } from '../../ui/overlays';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../../ui/controls';
import { MetricCard } from '../../ui/MetricCard';
import {
  Badge,
  Button,
  Callout,
  KeyValue,
  SchemaNote,
  StarRating,
  UserCell,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

type Tab = 'drivers' | 'owners' | 'reviews';
type AgeFilter = 'all' | '7' | '30' | '90';

export function UsersPage() {
  const [tab, setTab] = useState<Tab>('drivers');
  const [detail, setDetail] = useState<AdminProfile | null>(null);

  return (
    <>
      <PageHeader
        title="Gestión de usuarios"
        description="Perfiles de conductores y propietarios, y moderación de las reseñas que dejan."
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'drivers', label: 'Conductores' },
          { value: 'owners', label: 'Propietarios' },
          { value: 'reviews', label: 'Calificaciones y reseñas' },
        ]}
      />

      {tab === 'drivers' ? <DriversTable onOpen={setDetail} /> : null}
      {tab === 'owners' ? <OwnersTable onOpen={setDetail} /> : null}
      {tab === 'reviews' ? <ReviewsAudit /> : null}

      <UserDetailDrawer profile={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/** Filtra por texto y antigüedad de alta. Lo comparten las dos tablas de usuarios. */
function useUserFilters<T extends { profile: AdminProfile }>(rows: T[], now: number) {
  const [search, setSearch] = useState('');
  const [age, setAge] = useState<AgeFilter>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const maxAgeMs = age === 'all' ? Infinity : Number(age) * 86_400_000;

    return rows.filter((row) => {
      const p = row.profile;
      const matchesTerm =
        !term ||
        fullName(p).toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term) ||
        (p.phone ?? '').toLowerCase().includes(term);
      const matchesAge = now - new Date(p.createdAt).getTime() <= maxAgeMs;
      return matchesTerm && matchesAge;
    });
  }, [rows, search, age, now]);

  const toolbar = (
    <>
      <SearchInput value={search} onChange={setSearch} placeholder="Nombre, email o teléfono" />
      <FilterSelect
        label="Antigüedad"
        value={age}
        onChange={setAge}
        options={[
          { value: 'all', label: 'Todas las altas' },
          { value: '7', label: 'Últimos 7 días' },
          { value: '30', label: 'Últimos 30 días' },
          { value: '90', label: 'Últimos 90 días' },
        ]}
      />
    </>
  );

  return { filtered, toolbar };
}

/* ---------------------------------------------------------------- Conductores */

function DriversTable({ onOpen }: { onOpen: (p: AdminProfile) => void }) {
  const { state } = useMock();
  const rows = useMemo(() => selectDrivers(state), [state]);
  const { filtered, toolbar } = useUserFilters(rows, state.now);

  const columns: Column<DriverRow>[] = [
    {
      key: 'name',
      header: 'Conductor',
      render: (r) => <UserCell person={r.profile} online={r.isOnline} sub={r.profile.email} />,
      sortValue: (r) => fullName(r.profile),
    },
    { key: 'phone', header: 'Teléfono', render: (r) => r.profile.phone ?? '—' },
    {
      key: 'role',
      header: 'Rol activo',
      render: (r) => (
        <Badge tone={r.profile.activeRole === 'owner' ? 'accent' : 'neutral'}>
          {r.profile.activeRole === 'owner' ? 'Propietario' : 'Conductor'}
        </Badge>
      ),
      sortValue: (r) => r.profile.activeRole,
    },
    { key: 'vehicles', header: 'Vehículos', align: 'num', render: (r) => r.vehicles, sortValue: (r) => r.vehicles },
    { key: 'bookings', header: 'Reservas', align: 'num', render: (r) => r.bookings, sortValue: (r) => r.bookings },
    {
      key: 'seen',
      header: 'Última actividad',
      render: (r) => (r.profile.lastSeenAt ? formatRelative(r.profile.lastSeenAt, state.now) : '—'),
      sortValue: (r) => r.profile.lastSeenAt ?? '',
    },
    {
      key: 'created',
      header: 'Alta',
      render: (r) => formatDate(r.profile.createdAt),
      sortValue: (r) => r.profile.createdAt,
    },
  ];

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length}`}>{toolbar}</Toolbar>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.profile.id}
        onRowClick={(r) => onOpen(r.profile)}
      />
      <div style={{ marginTop: 'var(--gg-s3)' }}>
        <SchemaNote>
          El email no está en `profiles` (vive en `auth.users`, ilegible con la anon key) y la
          última actividad tampoco existe. Ambos son datos simulados.
        </SchemaNote>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Propietarios */

function OwnersTable({ onOpen }: { onOpen: (p: AdminProfile) => void }) {
  const { state } = useMock();
  const rows = useMemo(() => selectOwners(state), [state]);
  const { filtered, toolbar } = useUserFilters(rows, state.now);

  const columns: Column<OwnerRow>[] = [
    {
      key: 'name',
      header: 'Propietario',
      render: (r) => (
        <div className="gg-row">
          <UserCell person={r.profile} online={r.isOnline} sub={r.profile.email} />
          {r.lotsPending > 0 ? <Badge tone="warn">{r.lotsPending} por aprobar</Badge> : null}
        </div>
      ),
      sortValue: (r) => fullName(r.profile),
    },
    {
      key: 'lots',
      header: 'Cocheras',
      render: (r) => `${r.lotsLive} en vivo / ${r.lotsTotal}`,
      sortValue: (r) => r.lotsTotal,
    },
    {
      key: 'rating',
      header: 'Rating',
      render: (r) =>
        r.ratingAvg === null ? (
          <span style={{ color: 'var(--gg-text-faint)' }}>Sin calificar</span>
        ) : (
          <span className="gg-row">
            <StarRating value={r.ratingAvg} /> {r.ratingAvg.toFixed(2)}
          </span>
        ),
      sortValue: (r) => r.ratingAvg ?? 0,
    },
    {
      key: 'bookings',
      header: 'Reservas recibidas',
      align: 'num',
      render: (r) => r.bookingsReceived,
      sortValue: (r) => r.bookingsReceived,
    },
    {
      key: 'earnings',
      header: 'Ingresos',
      align: 'num',
      render: (r) => formatMoney(r.earnings),
      sortValue: (r) => r.earnings,
    },
    {
      key: 'created',
      header: 'Alta',
      render: (r) => formatDate(r.profile.createdAt),
      sortValue: (r) => r.profile.createdAt,
    },
  ];

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length}`}>{toolbar}</Toolbar>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.profile.id}
        onRowClick={(r) => onOpen(r.profile)}
        defaultSort={{ key: 'earnings', dir: 'desc' }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Reseñas */

type ScoreFilter = 'all' | '1' | '2' | '3' | '4' | '5';
type VisibilityFilter = 'visible' | 'hidden' | 'all';

function ReviewsAudit() {
  const { state, dispatch } = useMock();
  const { show } = useToast();

  const rows = useMemo(() => selectRatingRows(state), [state]);
  const stats = useMemo(() => selectRatingStats(state), [state]);

  const [score, setScore] = useState<ScoreFilter>('all');
  const [visibility, setVisibility] = useState<VisibilityFilter>('visible');
  const [search, setSearch] = useState('');
  const [hideTarget, setHideTarget] = useState<RatingRow | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (score !== 'all' && r.rating.score !== Number(score)) return false;
      if (visibility === 'visible' && r.rating.isHidden) return false;
      if (visibility === 'hidden' && !r.rating.isHidden) return false;
      if (!term) return true;
      return (
        (r.rating.comment ?? '').toLowerCase().includes(term) ||
        (r.author ? fullName(r.author).toLowerCase().includes(term) : false) ||
        (r.lot?.name ?? '').toLowerCase().includes(term)
      );
    });
  }, [rows, score, visibility, search]);

  return (
    <>
      <div style={{ marginBottom: 'var(--gg-s4)' }}>
        <Callout tone="info">
          Las calificaciones son <strong>unidireccionales</strong>: solo el conductor califica la
          cochera. Hoy no existe la calificación del propietario al conductor, así que la conducta
          de los conductores se modera por tickets, no por reseñas.
        </Callout>
      </div>

      <div className="gg-grid-4" style={{ marginBottom: 'var(--gg-s4)' }}>
        <MetricCard label="Promedio global" value={stats.average.toFixed(2)} hint="sobre 5" />
        <MetricCard label="Total de reseñas" value={stats.total} />
        <MetricCard
          label="1 y 2 estrellas"
          value={`${stats.lowRatePct} %`}
          hint="de los últimos 30 días"
          tone={stats.lowRatePct > 20 ? 'warn' : 'default'}
        />
        <MetricCard label="Ocultas" value={stats.hidden} />
      </div>

      <Toolbar count={`${filtered.length} de ${rows.length}`}>
        <SearchInput value={search} onChange={setSearch} placeholder="Comentario, autor o cochera" />
        <FilterSelect
          label="Puntaje"
          value={score}
          onChange={setScore}
          options={[
            { value: 'all', label: 'Todos los puntajes' },
            { value: '5', label: '5 estrellas' },
            { value: '4', label: '4 estrellas' },
            { value: '3', label: '3 estrellas' },
            { value: '2', label: '2 estrellas' },
            { value: '1', label: '1 estrella' },
          ]}
        />
        <FilterSelect
          label="Visibilidad"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'visible', label: 'Visibles' },
            { value: 'hidden', label: 'Ocultas' },
            { value: 'all', label: 'Todas' },
          ]}
        />
      </Toolbar>

      {/* Tarjetas y no tabla: el comentario necesita ancho para leerse completo, que es
          justamente lo que hay que evaluar para moderar. */}
      <div className="gg-stack">
        {filtered.map((row) => (
          <article key={row.rating.id} className="gg-card">
            <div className="gg-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 120 }}>
                <StarRating value={row.rating.score} size={16} />
                <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                  {formatRelative(row.rating.createdAt, state.now)}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="gg-row">
                  {row.author ? <UserCell person={row.author} /> : <span>Autor desconocido</span>}
                  <span style={{ color: 'var(--gg-text-soft)' }}>
                    sobre <strong>{row.lot?.name ?? 'cochera eliminada'}</strong>
                    {row.owner ? ` de ${fullName(row.owner)}` : ''}
                  </span>
                  {row.rating.isHidden ? <Badge tone="danger">Oculta</Badge> : null}
                </div>

                <p style={{ marginTop: 'var(--gg-s2)', lineHeight: 1.6 }}>
                  {row.rating.comment ?? (
                    <em style={{ color: 'var(--gg-text-faint)' }}>Sin comentario</em>
                  )}
                </p>

                {row.rating.hiddenReason ? (
                  <div style={{ marginTop: 'var(--gg-s2)' }}>
                    <Callout tone="neutral">Motivo: {row.rating.hiddenReason}</Callout>
                  </div>
                ) : null}
              </div>

              <div className="gg-row" style={{ flexShrink: 0 }}>
                {row.rating.isHidden ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      dispatch({
                        type: 'SET_RATING_HIDDEN',
                        ratingId: row.rating.id,
                        hidden: false,
                        reason: null,
                      });
                      show('Reseña restaurada');
                    }}
                  >
                    Restaurar
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setHideTarget(row)}>
                    Ocultar
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div style={{ marginTop: 'var(--gg-s4)' }}>
        <SchemaNote>
          Ocultar una reseña todavía no es posible en la base: `ratings` no tiene ningún campo de
          moderación, y tampoco hay policy de UPDATE ni DELETE, así que hoy nadie puede editarlas
          desde el cliente.
        </SchemaNote>
      </div>

      <HideReviewDialog
        row={hideTarget}
        onClose={() => setHideTarget(null)}
        onConfirm={(reason) => {
          if (!hideTarget) return;
          dispatch({
            type: 'SET_RATING_HIDDEN',
            ratingId: hideTarget.rating.id,
            hidden: true,
            reason,
          });
          show('Reseña ocultada', {
            onUndo: () =>
              dispatch({
                type: 'SET_RATING_HIDDEN',
                ratingId: hideTarget.rating.id,
                hidden: false,
                reason: null,
              }),
          });
          setHideTarget(null);
        }}
      />
    </>
  );
}

const HIDE_REASONS = [
  'Contiene datos personales de terceros',
  'Lenguaje ofensivo',
  'No describe la experiencia real',
  'Sospecha de reseña falsa',
  'Otro',
];

function HideReviewDialog({
  row,
  onClose,
  onConfirm,
}: {
  row: RatingRow | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(HIDE_REASONS[0]);

  if (!row) return null;

  return (
    <Modal
      open
      title="Ocultar reseña"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" onClick={() => onConfirm(reason)}>
            Ocultar
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 'var(--gg-s3)', color: 'var(--gg-text-soft)' }}>
        Deja de verse en la ficha pública de la cochera, pero sigue contando para el promedio
        histórico y queda registrada con el motivo.
      </p>

      <blockquote
        style={{
          margin: '0 0 var(--gg-s3)',
          padding: 'var(--gg-s3)',
          background: 'var(--gg-surface-3)',
          borderRadius: 'var(--gg-r2)',
        }}
      >
        {row.rating.comment ?? 'Sin comentario'}
      </blockquote>

      <div className="gg-field">
        <label className="gg-field__label">Motivo</label>
        <select className="gg-select" value={reason} onChange={(e) => setReason(e.target.value)}>
          {HIDE_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- Detalle de usuario */

function UserDetailDrawer({
  profile,
  onClose,
}: {
  profile: AdminProfile | null;
  onClose: () => void;
}) {
  const { state } = useMock();
  const { show } = useToast();

  if (!profile) return null;

  const vehicles = state.vehicles.filter((v) => v.userId === profile.id);
  const lots = state.parkingLots.filter((l) => l.ownerId === profile.id);
  const bookings = state.bookings
    .filter((b) => b.userId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const txs = state.transactions.filter((t) => t.userId === profile.id).slice(0, 5);
  const balance = state.transactions
    .filter((t) => t.userId === profile.id && t.status === 'completed')
    .reduce((s, t) => s + t.amount, 0);

  return (
    <Drawer
      open
      title={fullName(profile)}
      subtitle={profile.email}
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(profile.id);
              show('ID copiado');
            }}
          >
            Copiar ID
          </Button>
        </>
      }
    >
      <DrawerSection title="Perfil">
        <KeyValue
          items={[
            ['Teléfono', profile.phone ?? '—'],
            ['Alta', formatDate(profile.createdAt)],
            [
              'Rol activo',
              <Badge key="r" tone={profile.activeRole === 'owner' ? 'accent' : 'neutral'}>
                {profile.activeRole === 'owner' ? 'Propietario' : 'Conductor'}
              </Badge>,
            ],
            ['Propietario habilitado', profile.isOwnerEnabled ? 'Sí' : 'No'],
            ['ID', <span key="id" className="gg-mono">{profile.id}</span>],
          ]}
        />
      </DrawerSection>

      {vehicles.length > 0 ? (
        <DrawerSection title={`Vehículos (${vehicles.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {vehicles.map((v) => (
              <li key={v.id} style={{ padding: '4px 0' }}>
                <span className="gg-mono">{v.plate}</span> · {v.brand} {v.model} · {v.color}
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}

      {lots.length > 0 ? (
        <DrawerSection title={`Cocheras (${lots.length})`}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {lots.map((l) => (
              <li key={l.id} className="gg-row" style={{ padding: '4px 0' }}>
                <span style={{ flex: 1, minWidth: 0 }}>{l.name}</span>
                <Badge tone={l.approvalStatus === 'approved' ? 'ok' : l.approvalStatus === 'pending' ? 'warn' : 'neutral'}>
                  {l.approvalStatus === 'approved'
                    ? 'Aprobada'
                    : l.approvalStatus === 'pending'
                      ? 'Pendiente'
                      : l.approvalStatus === 'rejected'
                        ? 'Rechazada'
                        : 'Cambios pedidos'}
                </Badge>
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}

      <DrawerSection title="Últimas reservas">
        {bookings.length === 0 ? (
          <p style={{ color: 'var(--gg-text-faint)' }}>Sin reservas.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {bookings.map((b) => {
              const lot = state.parkingLots.find((l) => l.id === b.parkingLotId);
              return (
                <li key={b.id} className="gg-row" style={{ padding: '4px 0' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{lot?.name ?? '—'}</span>
                  <span style={{ color: 'var(--gg-text-faint)' }}>{b.date}</span>
                  <span className="gg-mono">{formatMoney(b.totalPrice)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </DrawerSection>

      <DrawerSection title="Billetera">
        <p style={{ marginBottom: 'var(--gg-s2)' }}>
          Saldo calculado: <strong>{formatMoney(balance)}</strong>
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {txs.map((t) => (
            <li key={t.id} className="gg-row" style={{ padding: '3px 0', fontSize: 'var(--gg-fs-sm)' }}>
              <span style={{ flex: 1 }}>{t.type}</span>
              <span className={t.amount >= 0 ? 'gg-amount--pos' : 'gg-amount--neg'}>
                {formatMoney(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      </DrawerSection>

      <SchemaNote>
        Suspender o dar de baja una cuenta requeriría una migración: `profiles` no tiene ningún
        campo de estado.
      </SchemaNote>
    </Drawer>
  );
}
