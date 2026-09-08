import { useMemo, useState } from 'react';

import { formatDuration, formatMoney, formatRelative, fullName, shortTime } from '../../lib/format';
import { useMock } from '../../state/MockDataProvider';
import {
  selectActiveSessions,
  selectGrowthSeries,
  selectOccupancy,
  selectOnlineUsers,
  selectPendingCounts,
  type ActiveSession,
  type GrowthRange,
} from '../../state/selectors';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { DonutGauge, LineChart } from '../../ui/charts';
import { MetricCard } from '../../ui/MetricCard';
import { Badge, Card, EmptyState, SchemaNote, UserCell } from '../../ui/primitives';
import { Tabs } from '../../ui/controls';

export function DashboardPage() {
  const { state } = useMock();

  const occupancy = useMemo(() => selectOccupancy(state), [state]);
  const sessions = useMemo(() => selectActiveSessions(state), [state]);
  const online = useMemo(() => selectOnlineUsers(state), [state]);
  const counts = useMemo(() => selectPendingCounts(state), [state]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Qué está pasando ahora mismo en la plataforma y cómo viene creciendo."
      />

      <div className="gg-grid-4" style={{ marginBottom: 'var(--gg-s4)' }}>
        <MetricCard
          label="Ocupación ahora"
          value={`${occupancy.busy} / ${occupancy.total}`}
          hint={`${Math.round(occupancy.ratio * 100)} % de las cocheras publicadas`}
        />
        <MetricCard
          label="Sesiones en curso"
          value={sessions.length}
          hint={`${sessions.filter((s) => s.overMs > 0).length} con tiempo excedido`}
        />
        <MetricCard
          label="Usuarios en línea"
          value={online.all.length}
          hint={`${online.drivers.length} conductores · ${online.owners.length} propietarios`}
        />
        <MetricCard
          label="Esperando aprobación"
          value={counts.pendingLots}
          hint="Ir a la bandeja de revisión →"
          tone="warn"
          to="/inventario"
        />
      </div>

      <div className="gg-grid-2" style={{ marginBottom: 'var(--gg-s4)' }}>
        <OccupancyPanel sessions={sessions} busy={occupancy.busy} free={occupancy.free} ratio={occupancy.ratio} />
        <OnlineUsersPanel online={online} now={state.now} />
      </div>

      <div style={{ marginBottom: 'var(--gg-s4)' }}>
        <GrowthPanel />
      </div>

      <ActiveSessionsTable sessions={sessions} />
    </>
  );
}

/* ---------------------------------------------------------------- Ocupación */

function OccupancyPanel({
  sessions,
  busy,
  free,
  ratio,
}: {
  sessions: ActiveSession[];
  busy: number;
  free: number;
  ratio: number;
}) {
  return (
    <Card title="Ocupación en tiempo real">
      <div className="gg-row" style={{ gap: 'var(--gg-s5)', alignItems: 'flex-start' }}>
        <DonutGauge ratio={ratio}>
          <div>
            <div style={{ fontSize: 'var(--gg-fs-2xl)', fontWeight: 600, lineHeight: 1 }}>
              {Math.round(ratio * 100)}%
            </div>
            <div style={{ fontSize: 'var(--gg-fs-sm)', color: 'var(--gg-text-soft)' }}>ocupadas</div>
          </div>
        </DonutGauge>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gg-row" style={{ gap: 'var(--gg-s4)', marginBottom: 'var(--gg-s3)' }}>
            <span className="gg-row">
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gg-accent-ink)' }}
              />
              Ocupadas <strong>{busy}</strong>
            </span>
            <span className="gg-row">
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gg-neutral-soft)' }}
              />
              Libres <strong>{free}</strong>
            </span>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 210, overflowY: 'auto' }}>
            {sessions.slice(0, 8).map((s) => (
              <li
                key={s.booking.id}
                style={{
                  padding: 'var(--gg-s2) 0',
                  borderBottom: '1px solid var(--gg-border)',
                  fontSize: 'var(--gg-fs-md)',
                }}
              >
                <div className="gg-row">
                  <span style={{ fontWeight: 500, flex: 1, minWidth: 0 }}>{s.lot.name}</span>
                  {s.overMs > 0 ? <Badge tone="warn">+{formatDuration(s.overMs)}</Badge> : null}
                </div>
                <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                  {s.driver ? fullName(s.driver) : '—'}
                  {s.plate ? ` · ${s.plate}` : ''} · hace {formatDuration(s.elapsedMs)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Presencia */

function OnlineUsersPanel({
  online,
  now,
}: {
  online: ReturnType<typeof selectOnlineUsers>;
  now: number;
}) {
  return (
    <Card
      title="Usuarios en línea"
      actions={
        <Badge tone="ok" dot>
          En vivo
        </Badge>
      }
    >
      <div className="gg-grid-2">
        {(
          [
            ['Conductores', online.drivers],
            ['Propietarios', online.owners],
          ] as const
        ).map(([label, people]) => (
          <div key={label}>
            <h3 className="gg-drawer__section-title">
              {label} ({people.length})
            </h3>
            {people.length === 0 ? (
              <p style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                Nadie conectado.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {people.map((p) => (
                  <li key={p.id} style={{ padding: '5px 0' }}>
                    <UserCell
                      person={p}
                      online
                      sub={p.lastSeenAt ? formatRelative(p.lastSeenAt, now) : undefined}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'var(--gg-s4)' }}>
        <SchemaNote>
          Presencia simulada: `profiles` no tiene ningún campo de actividad. Para que sea real
          haría falta un `last_seen_at` o usar Realtime Presence de Supabase.
        </SchemaNote>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Crecimiento */

function GrowthPanel() {
  const { state } = useMock();
  const [range, setRange] = useState<GrowthRange>('6m');
  const [cumulative, setCumulative] = useState(false);

  const points = useMemo(
    () => selectGrowthSeries(state, range, cumulative),
    [state, range, cumulative]
  );

  const totalDrivers = points.reduce((s, p) => s + (cumulative ? 0 : p.drivers), 0);
  const totalOwners = points.reduce((s, p) => s + (cumulative ? 0 : p.owners), 0);

  return (
    <Card
      title="Crecimiento de usuarios"
      actions={
        <>
          <Tabs
            value={range}
            onChange={setRange}
            items={[
              { value: '30d', label: '30 días' },
              { value: '6m', label: '6 meses' },
              { value: '12m', label: '12 meses' },
            ]}
          />
          <Tabs
            value={cumulative ? 'cum' : 'new'}
            onChange={(v) => setCumulative(v === 'cum')}
            items={[
              { value: 'new', label: 'Nuevos' },
              { value: 'cum', label: 'Acumulado' },
            ]}
          />
        </>
      }
    >
      <LineChart
        labels={points.map((p) => p.label)}
        series={[
          { label: 'Conductores', color: 'var(--gg-series-1)', points: points.map((p) => p.drivers) },
          { label: 'Propietarios', color: 'var(--gg-series-2)', points: points.map((p) => p.owners) },
        ]}
      />

      {!cumulative ? (
        <p style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-md)' }}>
          <strong>+{totalDrivers}</strong> conductores y <strong>+{totalOwners}</strong>{' '}
          propietarios en el período.
        </p>
      ) : null}

      <div style={{ marginTop: 'var(--gg-s3)' }}>
        <SchemaNote>
          La serie de propietarios se calcula con la fecha de la primera cochera de cada uno
          (`min(parking_lots.created_at) group by owner_id`). No hace falta ninguna columna nueva:
          al conectar la base, esto pasa a ser una query real tal cual.
        </SchemaNote>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Sesiones activas */

function ActiveSessionsTable({ sessions }: { sessions: ActiveSession[] }) {
  const columns: Column<ActiveSession>[] = [
    {
      key: 'lot',
      header: 'Cochera',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 500 }}>{s.lot.name}</div>
          <div className="gg-user-cell__sub">{s.lot.address}</div>
        </div>
      ),
      sortValue: (s) => s.lot.name,
    },
    {
      key: 'owner',
      header: 'Propietario',
      render: (s) => (s.owner ? fullName(s.owner) : '—'),
      sortValue: (s) => (s.owner ? fullName(s.owner) : ''),
    },
    {
      key: 'driver',
      header: 'Conductor',
      render: (s) => (s.driver ? <UserCell person={s.driver} /> : '—'),
      sortValue: (s) => (s.driver ? fullName(s.driver) : ''),
    },
    {
      key: 'plate',
      header: 'Patente',
      render: (s) => <span className="gg-mono">{s.plate ?? '—'}</span>,
    },
    {
      key: 'elapsed',
      header: 'Transcurrido',
      align: 'num',
      render: (s) => formatDuration(s.elapsedMs),
      sortValue: (s) => s.elapsedMs,
    },
    {
      key: 'until',
      header: 'Reservado hasta',
      render: (s) => shortTime(s.booking.endTime),
    },
    {
      key: 'over',
      header: 'Exceso',
      render: (s) =>
        s.overMs > 0 ? (
          <Badge tone="warn">+{formatDuration(s.overMs)}</Badge>
        ) : (
          <span style={{ color: 'var(--gg-text-faint)' }}>—</span>
        ),
      sortValue: (s) => s.overMs,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'num',
      render: (s) => formatMoney(s.booking.totalPrice),
      sortValue: (s) => s.booking.totalPrice,
    },
  ];

  if (sessions.length === 0) {
    return (
      <Card title="Sesiones en curso">
        <EmptyState icon="◷" title="No hay sesiones activas" description="Nadie está usando una cochera en este momento." />
      </Card>
    );
  }

  return (
    <>
      <h2 style={{ fontSize: 'var(--gg-fs-md)', fontWeight: 600, marginBottom: 'var(--gg-s3)' }}>
        Sesiones en curso ({sessions.length})
      </h2>
      <DataTable
        columns={columns}
        rows={sessions}
        rowKey={(s) => s.booking.id}
        defaultSort={{ key: 'elapsed', dir: 'desc' }}
      />
    </>
  );
}
