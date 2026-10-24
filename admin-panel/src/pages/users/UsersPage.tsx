import { useEffect, useMemo, useState } from 'react';

import { formatDate, formatMoney, formatRelative, fullName } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Drawer, DrawerSection, Modal } from '../../ui/overlays';
import { FilterSelect, SearchInput, Tabs, Toolbar } from '../../ui/controls';
import { MetricCard } from '../../ui/MetricCard';
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  KeyValue,
  SchemaNote,
  StarRating,
  UserCell,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { computeRatingStats, type PanelRating } from './ratingsApi';
import { useRatings } from './useRatings';
import { fetchUserDetail, type UserDetail, type UserDirectoryEntry } from './usersApi';
import { useUsers, type UsersState } from './useUsers';

type Tab = 'drivers' | 'owners' | 'reviews';
type AgeFilter = 'all' | '7' | '30' | '90';

export function UsersPage() {
  const [tab, setTab] = useState<Tab>('drivers');
  const [detail, setDetail] = useState<UserDirectoryEntry | null>(null);
  const users = useUsers();

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

      {tab === 'reviews' ? (
        <ReviewsAudit />
      ) : users.loading && users.users.length === 0 ? (
        <EmptyState icon="⏳" title="Cargando usuarios" description="Un momento." />
      ) : users.error ? (
        <div style={{ padding: 'var(--gg-s4)' }}>
          <Callout tone="danger">
            <div>
              <strong>No se pudo cargar el directorio.</strong>
              <p style={{ marginTop: 4 }}>{users.error}</p>
              <div style={{ marginTop: 'var(--gg-s3)' }}>
                <Button onClick={users.refetch}>Reintentar</Button>
              </div>
            </div>
          </Callout>
        </div>
      ) : tab === 'drivers' ? (
        <DriversTable users={users} onOpen={setDetail} />
      ) : (
        <OwnersTable users={users} onOpen={setDetail} />
      )}

      <UserDetailDrawer user={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/** Filtra por texto y antigüedad de alta. Lo comparten las dos tablas de usuarios. */
function useUserFilters(rows: UserDirectoryEntry[], now: number) {
  const [search, setSearch] = useState('');
  const [age, setAge] = useState<AgeFilter>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const maxAgeMs = age === 'all' ? Infinity : Number(age) * 86_400_000;

    return rows.filter((p) => {
      const matchesTerm =
        !term ||
        fullName(p).toLowerCase().includes(term) ||
        (p.email ?? '').toLowerCase().includes(term) ||
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

function DriversTable({
  users,
  onOpen,
}: {
  users: UsersState;
  onOpen: (u: UserDirectoryEntry) => void;
}) {
  const rows = users.users;
  const { filtered, toolbar } = useUserFilters(rows, Date.now());

  const columns: Column<UserDirectoryEntry>[] = [
    {
      key: 'name',
      header: 'Conductor',
      render: (r) => <UserCell person={r} sub={r.email ?? '—'} />,
      sortValue: (r) => fullName(r),
    },
    { key: 'phone', header: 'Teléfono', render: (r) => r.phone ?? '—' },
    {
      key: 'role',
      header: 'Rol activo',
      render: (r) => (
        <Badge tone={r.activeRole === 'owner' ? 'accent' : 'neutral'}>
          {r.activeRole === 'owner' ? 'Propietario' : 'Conductor'}
        </Badge>
      ),
      sortValue: (r) => r.activeRole,
    },
    {
      key: 'vehicles',
      header: 'Vehículos',
      align: 'num',
      render: (r) => r.vehiclesCount,
      sortValue: (r) => r.vehiclesCount,
    },
    {
      key: 'bookings',
      header: 'Reservas',
      align: 'num',
      render: (r) => r.bookingsMade,
      sortValue: (r) => r.bookingsMade,
    },
    {
      key: 'created',
      header: 'Alta',
      render: (r) => formatDate(r.createdAt),
      sortValue: (r) => r.createdAt,
    },
  ];

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length}`}>{toolbar}</Toolbar>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} onRowClick={onOpen} />
    </>
  );
}

/* ---------------------------------------------------------------- Propietarios */

function OwnersTable({
  users,
  onOpen,
}: {
  users: UsersState;
  onOpen: (u: UserDirectoryEntry) => void;
}) {
  const rows = useMemo(() => users.users.filter((u) => u.isOwnerEnabled), [users.users]);
  const { filtered, toolbar } = useUserFilters(rows, Date.now());

  const columns: Column<UserDirectoryEntry>[] = [
    {
      key: 'name',
      header: 'Propietario',
      render: (r) => (
        <div className="gg-row">
          <UserCell person={r} sub={r.email ?? '—'} />
          {r.lotsPending > 0 ? <Badge tone="warn">{r.lotsPending} por aprobar</Badge> : null}
        </div>
      ),
      sortValue: (r) => fullName(r),
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
      render: (r) => formatDate(r.createdAt),
      sortValue: (r) => r.createdAt,
    },
  ];

  return (
    <>
      <Toolbar count={`${filtered.length} de ${rows.length}`}>{toolbar}</Toolbar>
      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={onOpen}
        defaultSort={{ key: 'earnings', dir: 'desc' }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- Reseñas */

type ScoreFilter = 'all' | '1' | '2' | '3' | '4' | '5';
type VisibilityFilter = 'visible' | 'hidden' | 'all';

function ReviewsAudit() {
  const { show } = useToast();
  const { ratings, loading, error, refetch, setHidden } = useRatings();
  const now = Date.now();
  const stats = useMemo(() => computeRatingStats(ratings, now), [ratings, now]);

  const [score, setScore] = useState<ScoreFilter>('all');
  const [visibility, setVisibility] = useState<VisibilityFilter>('visible');
  const [search, setSearch] = useState('');
  const [hideTarget, setHideTarget] = useState<PanelRating | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ratings.filter((r) => {
      if (score !== 'all' && r.score !== Number(score)) return false;
      if (visibility === 'visible' && r.isHidden) return false;
      if (visibility === 'hidden' && !r.isHidden) return false;
      if (!term) return true;
      return (
        (r.comment ?? '').toLowerCase().includes(term) ||
        r.authorName.toLowerCase().includes(term) ||
        (r.lotName ?? '').toLowerCase().includes(term)
      );
    });
  }, [ratings, score, visibility, search]);

  const runHide = async (ratingId: string, hidden: boolean, reason: string | null) => {
    setBusy(true);
    try {
      await setHidden(ratingId, hidden, reason);
      show(hidden ? 'Reseña ocultada' : 'Reseña restaurada');
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo completar la acción'}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading && ratings.length === 0) {
    return <EmptyState icon="⏳" title="Cargando reseñas" description="Un momento." />;
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--gg-s4)' }}>
        <Callout tone="danger">
          <div>
            <strong>No se pudieron cargar las reseñas.</strong>
            <p style={{ marginTop: 4 }}>{error}</p>
            <div style={{ marginTop: 'var(--gg-s3)' }}>
              <Button onClick={refetch}>Reintentar</Button>
            </div>
          </div>
        </Callout>
      </div>
    );
  }

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

      <Toolbar count={`${filtered.length} de ${ratings.length}`}>
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
          <article key={row.id} className="gg-card">
            <div className="gg-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 120 }}>
                <StarRating value={row.score} size={16} />
                <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                  {formatRelative(row.createdAt, now)}
                </div>
              </div>

              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div className="gg-row">
                  <strong>{row.authorName}</strong>
                  <span style={{ color: 'var(--gg-text-soft)' }}>
                    sobre <strong>{row.lotName ?? 'cochera eliminada'}</strong>
                    {row.ownerName ? ` de ${row.ownerName}` : ''}
                  </span>
                  {row.isHidden ? <Badge tone="danger">Oculta</Badge> : null}
                </div>

                <p style={{ marginTop: 'var(--gg-s2)', lineHeight: 1.6 }}>
                  {row.comment ?? <em style={{ color: 'var(--gg-text-faint)' }}>Sin comentario</em>}
                </p>

                {row.hiddenReason ? (
                  <div style={{ marginTop: 'var(--gg-s2)' }}>
                    <Callout tone="neutral">Motivo: {row.hiddenReason}</Callout>
                  </div>
                ) : null}
              </div>

              <div className="gg-row" style={{ flexShrink: 0 }}>
                {row.isHidden ? (
                  <Button size="sm" disabled={busy} onClick={() => runHide(row.id, false, null)}>
                    Restaurar
                  </Button>
                ) : (
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => setHideTarget(row)}>
                    Ocultar
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <HideReviewDialog
        row={hideTarget}
        onClose={() => setHideTarget(null)}
        onConfirm={(reason) => {
          if (!hideTarget) return;
          const id = hideTarget.id;
          setHideTarget(null);
          void runHide(id, true, reason);
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
  row: PanelRating | null;
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
        {row.comment ?? 'Sin comentario'}
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

const LOT_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobada',
  pending: 'Pendiente',
  rejected: 'Rechazada',
  changes_requested: 'Cambios pedidos',
};

function UserDetailDrawer({
  user,
  onClose,
}: {
  user: UserDirectoryEntry | null;
  onClose: () => void;
}) {
  const { show } = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!user) return;
    let cancelled = false;
    fetchUserDetail(user.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la ficha.');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  return (
    <Drawer
      open
      title={fullName(user)}
      subtitle={user.email ?? undefined}
      onClose={onClose}
      footer={
        <Button
          onClick={() => {
            navigator.clipboard?.writeText(user.id);
            show('ID copiado');
          }}
        >
          Copiar ID
        </Button>
      }
    >
      <DrawerSection title="Perfil">
        <KeyValue
          items={[
            ['Email', user.email ?? '—'],
            ['Teléfono', user.phone ?? '—'],
            ['Alta', formatDate(user.createdAt)],
            [
              'Rol activo',
              <Badge key="r" tone={user.activeRole === 'owner' ? 'accent' : 'neutral'}>
                {user.activeRole === 'owner' ? 'Propietario' : 'Conductor'}
              </Badge>,
            ],
            ['Propietario habilitado', user.isOwnerEnabled ? 'Sí' : 'No'],
            ['ID', <span key="id" className="gg-mono">{user.id}</span>],
          ]}
        />
      </DrawerSection>

      {error ? <Callout tone="danger">{error}</Callout> : null}
      {!detail && !error ? (
        <p style={{ color: 'var(--gg-text-faint)' }}>Cargando ficha…</p>
      ) : null}

      {detail ? (
        <>
          {detail.vehicles.length > 0 ? (
            <DrawerSection title={`Vehículos (${detail.vehicles.length})`}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {detail.vehicles.map((v, i) => (
                  <li key={`${v.plate}-${i}`} style={{ padding: '4px 0' }}>
                    <span className="gg-mono">{v.plate}</span>
                    {v.brand || v.model ? ` · ${v.brand ?? ''} ${v.model ?? ''}`.trim() : ''}
                    {v.color ? ` · ${v.color}` : ''}
                  </li>
                ))}
              </ul>
            </DrawerSection>
          ) : null}

          {detail.lots.length > 0 ? (
            <DrawerSection title={`Cocheras (${detail.lots.length})`}>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {detail.lots.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="gg-row" style={{ padding: '4px 0' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{l.name}</span>
                    <Badge
                      tone={
                        l.approvalStatus === 'approved'
                          ? 'ok'
                          : l.approvalStatus === 'pending'
                            ? 'warn'
                            : 'neutral'
                      }
                    >
                      {LOT_STATUS_LABELS[l.approvalStatus] ?? l.approvalStatus}
                    </Badge>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          ) : null}

          <DrawerSection title="Últimas reservas">
            {detail.recentBookings.length === 0 ? (
              <p style={{ color: 'var(--gg-text-faint)' }}>Sin reservas.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {detail.recentBookings.map((b, i) => (
                  <li key={i} className="gg-row" style={{ padding: '4px 0' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{b.lot_name ?? '—'}</span>
                    <span style={{ color: 'var(--gg-text-faint)' }}>{b.date}</span>
                    <span className="gg-mono">{formatMoney(b.total_price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DrawerSection>

          <DrawerSection title="Billetera">
            <p style={{ marginBottom: 'var(--gg-s2)' }}>
              Saldo actual: <strong>{formatMoney(detail.balance)}</strong>
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {detail.recentTransactions.map((t, i) => (
                <li
                  key={i}
                  className="gg-row"
                  style={{ padding: '3px 0', fontSize: 'var(--gg-fs-sm)' }}
                >
                  <span style={{ flex: 1 }}>{t.type}</span>
                  <span className={t.amount >= 0 ? 'gg-amount--pos' : 'gg-amount--neg'}>
                    {formatMoney(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </DrawerSection>
        </>
      ) : null}

      <SchemaNote>
        Suspender o dar de baja una cuenta requeriría una migración: `profiles` no tiene ningún
        campo de estado.
      </SchemaNote>
    </Drawer>
  );
}
