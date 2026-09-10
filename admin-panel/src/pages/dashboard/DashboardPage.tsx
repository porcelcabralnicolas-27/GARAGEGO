import { useState } from 'react';

import { formatDuration, formatMoney } from '../../lib/format';
import { usePendingCounts } from '../../shell/usePendingCounts';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { DonutGauge, LineChart } from '../../ui/charts';
import { MetricCard } from '../../ui/MetricCard';
import { Badge, Button, Callout, Card, EmptyState } from '../../ui/primitives';
import { Tabs } from '../../ui/controls';
import type { DashActiveSession, GrowthRange } from './dashboardApi';
import { useDashboard, useGrowth } from './useDashboard';

export function DashboardPage() {
  const { data, loading, error, refetch } = useDashboard();
  const counts = usePendingCounts();

  const sessions = data?.activeSessions ?? [];
  const total = data?.publishableLots ?? 0;
  const busy = data?.busyLots ?? 0;
  const ratio = total ? busy / total : 0;
  const overtime = sessions.filter((s) => s.overMs > 0).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Qué está pasando ahora mismo en la plataforma y cómo viene creciendo."
      />

      {error ? (
        <Callout tone="danger">
          <div>
            <strong>No se pudo cargar el dashboard.</strong>
            <p style={{ marginTop: 4 }}>{error}</p>
            <div style={{ marginTop: 'var(--gg-s3)' }}>
              <Button onClick={refetch}>Reintentar</Button>
            </div>
          </div>
        </Callout>
      ) : null}

      <div className="gg-grid-4" style={{ marginBottom: 'var(--gg-s4)' }}>
        <MetricCard
          label="Ocupación ahora"
          value={loading && !data ? '…' : `${busy} / ${total}`}
          hint={`${Math.round(ratio * 100)} % de las cocheras publicadas`}
        />
        <MetricCard
          label="Sesiones en curso"
          value={loading && !data ? '…' : sessions.length}
          hint={`${overtime} con tiempo excedido`}
        />
        <MetricCard
          label="Esperando aprobación"
          value={counts.pendingLots}
          hint="Ir a la bandeja de revisión →"
          tone="warn"
          to="/inventario"
        />
        <MetricCard
          label="Movimientos 30 días"
          value={loading && !data ? '…' : formatMoney(data?.txSummary.volume ?? 0)}
          hint="dinero movido, completados"
        />
      </div>

      <div style={{ marginBottom: 'var(--gg-s4)' }}>
        <OccupancyPanel sessions={sessions} busy={busy} free={Math.max(0, total - busy)} ratio={ratio} />
      </div>

      <div style={{ marginBottom: 'var(--gg-s4)' }}>
        <GrowthPanel />
      </div>

      <ActiveSessionsTable sessions={sessions} loading={loading && !data} />
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
  sessions: DashActiveSession[];
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
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gg-accent-ink)' }} />
              Ocupadas <strong>{busy}</strong>
            </span>
            <span className="gg-row">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gg-neutral-soft)' }} />
              Libres <strong>{free}</strong>
            </span>
          </div>

          {sessions.length === 0 ? (
            <p style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
              No hay ninguna cochera en uso ahora mismo.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 210, overflowY: 'auto' }}>
              {sessions.slice(0, 8).map((s) => (
                <li
                  key={s.bookingId}
                  style={{
                    padding: 'var(--gg-s2) 0',
                    borderBottom: '1px solid var(--gg-border)',
                    fontSize: 'var(--gg-fs-md)',
                  }}
                >
                  <div className="gg-row">
                    <span style={{ fontWeight: 500, flex: 1, minWidth: 0 }}>{s.lotName}</span>
                    {s.overMs > 0 ? <Badge tone="warn">+{formatDuration(s.overMs)}</Badge> : null}
                  </div>
                  <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
                    {s.driverName}
                    {s.plate ? ` · ${s.plate}` : ''} · hace {formatDuration(s.elapsedMs)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Crecimiento */

function GrowthPanel() {
  const [range, setRange] = useState<GrowthRange>('6m');
  const [cumulative, setCumulative] = useState(false);
  const { points, loading, error } = useGrowth(range);

  const totalUsers = points.reduce((s, p) => s + p.newUsers, 0);
  const totalHosts = points.reduce((s, p) => s + p.newHosts, 0);

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
      {error ? (
        <p style={{ color: 'var(--gg-danger)', fontSize: 'var(--gg-fs-sm)' }}>{error}</p>
      ) : loading && points.length === 0 ? (
        <p style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>Cargando…</p>
      ) : (
        <>
          <LineChart
            labels={points.map((p) => p.label)}
            series={[
              {
                label: 'Usuarios nuevos',
                color: 'var(--gg-series-1)',
                points: points.map((p) => (cumulative ? p.cumUsers : p.newUsers)),
              },
              {
                label: 'Publicaron su 1ª cochera',
                color: 'var(--gg-series-2)',
                points: points.map((p) => (cumulative ? p.cumHosts : p.newHosts)),
              },
            ]}
          />

          <p style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-md)' }}>
            {cumulative ? (
              'Los propietarios son un subconjunto: de todos los usuarios registrados, los que llegaron a publicar al menos una cochera.'
            ) : (
              <>
                <strong>+{totalUsers}</strong> altas en el período; de esas,{' '}
                <strong>{totalHosts}</strong> publicaron su primera cochera.
              </>
            )}
          </p>
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- Sesiones activas */

function ActiveSessionsTable({
  sessions,
  loading,
}: {
  sessions: DashActiveSession[];
  loading: boolean;
}) {
  const columns: Column<DashActiveSession>[] = [
    {
      key: 'lot',
      header: 'Cochera',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 500 }}>{s.lotName}</div>
          <div className="gg-user-cell__sub">{s.lotAddress}</div>
        </div>
      ),
      sortValue: (s) => s.lotName,
    },
    {
      key: 'owner',
      header: 'Propietario',
      render: (s) => s.ownerName,
      sortValue: (s) => s.ownerName,
    },
    {
      key: 'driver',
      header: 'Conductor',
      render: (s) => s.driverName,
      sortValue: (s) => s.driverName,
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
      render: (s) => s.endTime,
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
      render: (s) => formatMoney(s.totalPrice),
      sortValue: (s) => s.totalPrice,
    },
  ];

  if (loading) {
    return (
      <Card title="Sesiones en curso">
        <EmptyState icon="⏳" title="Cargando…" description="Un momento." />
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card title="Sesiones en curso">
        <EmptyState
          icon="◷"
          title="No hay sesiones activas"
          description="Nadie está usando una cochera en este momento."
        />
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
        rowKey={(s) => s.bookingId}
        defaultSort={{ key: 'elapsed', dir: 'desc' }}
      />
    </>
  );
}
