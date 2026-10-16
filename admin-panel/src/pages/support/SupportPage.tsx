import { useState } from 'react';

import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  formatSigned,
} from '../../lib/format';
import {
  TICKET_CATEGORY_LABELS,
  TRANSACTION_TYPE_LABELS,
  type TicketCategory,
  type TicketStatus,
  type TransactionStatus,
  type TransactionType,
} from '../../domain';
import { revealDetailOnNarrowScreens } from '../../lib/revealDetail';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Drawer, DrawerSection } from '../../ui/overlays';
import { FilterSelect, SearchInput, SubTabs, Tabs, Toolbar } from '../../ui/controls';
import { MetricCard } from '../../ui/MetricCard';
import { Badge, Button, Callout, EmptyState, KeyValue, SchemaNote } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import { TRANSACTION_SIDE_LABEL, TRANSACTIONS_PAGE_SIZE, type PanelTransaction } from './transactionsApi';
import type { TicketCounts } from './ticketsApi';
import { useTicketCounts, useTicketMessages, useTickets } from './useTickets';
import { useTransactions } from './useTransactions';

type MainTab = 'transactions' | 'tickets';

export function SupportPage() {
  const { counts } = useTicketCounts();
  const [tab, setTab] = useState<MainTab>('transactions');

  return (
    <>
      <PageHeader
        title="Operaciones de soporte"
        description="Movimientos de dinero de toda la plataforma y reportes de incidencias de los usuarios."
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'transactions', label: 'Transacciones' },
          { value: 'tickets', label: 'Tickets', count: counts.open },
        ]}
      />

      {tab === 'transactions' ? <TransactionsView /> : <TicketsView counts={counts} />}
    </>
  );
}

/* ================================================================ Transacciones */

type TypeFilter = TransactionType | 'all';
type StatusFilter = TransactionStatus | 'all';

function TransactionsView() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [detail, setDetail] = useState<PanelTransaction | null>(null);

  // Los filtros los aplica el servidor (0059): así se encuentra cualquier movimiento, no solo
  // los que ya están cargados en la tabla.
  const { transactions, summary, loading, loadingMore, hasMore, error, refetch, loadMore } = useTransactions({
    type: type === 'all' ? null : type,
    status: status === 'all' ? null : status,
    search,
  });

  const columns: Column<PanelTransaction>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (r) => formatDateTime(r.createdAt),
      sortValue: (r) => r.createdAt,
    },
    {
      key: 'user',
      header: 'Titular',
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div>{r.userName}</div>
          <div className="gg-user-cell__sub">{TRANSACTION_SIDE_LABEL[r.side]}</div>
        </div>
      ),
      sortValue: (r) => r.userName,
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (r) => (
        <Badge
          tone={
            r.type === 'topup' || r.type === 'refund' || r.type === 'earning'
              ? 'ok'
              : r.type === 'overtime_charge'
                ? 'warn'
                : r.type === 'adjustment'
                  ? 'info'
                  : 'neutral'
          }
        >
          {TRANSACTION_TYPE_LABELS[r.type] ?? r.type}
          {r.isDemo ? ' · Demo' : ''}
        </Badge>
      ),
      sortValue: (r) => r.type,
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'num',
      render: (r) => (
        <span className={r.amount >= 0 ? 'gg-amount--pos' : 'gg-amount--neg'}>
          {formatSigned(r.amount)}
        </span>
      ),
      sortValue: (r) => r.amount,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => (
        <Badge tone={r.status === 'completed' ? 'ok' : r.status === 'failed' ? 'danger' : 'warn'}>
          {r.status === 'completed' ? 'Completada' : r.status === 'failed' ? 'Fallida' : 'Pendiente'}
        </Badge>
      ),
      sortValue: (r) => r.status,
    },
    {
      key: 'booking',
      header: 'Reserva',
      render: (r) =>
        r.lotName ? (
          <span style={{ color: 'var(--gg-text-soft)' }}>{r.lotName}</span>
        ) : (
          <span style={{ color: 'var(--gg-text-faint)' }}>—</span>
        ),
    },
  ];

  if (loading && transactions.length === 0) {
    return <EmptyState icon="⏳" title="Cargando movimientos" description="Un momento." />;
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--gg-s4)' }}>
        <Callout tone="danger">
          <div>
            <strong>No se pudieron cargar los movimientos.</strong>
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
      <div className="gg-grid-4" style={{ marginBottom: 'var(--gg-s4)' }}>
        <MetricCard label="Volumen 30 días" value={formatMoney(summary?.volume ?? 0)} hint="movimientos completados" />
        <MetricCard label="Recargas" value={formatMoney(summary?.topups ?? 0)} />
        <MetricCard label="Pagos de reservas" value={formatMoney(summary?.payments ?? 0)} />
        <MetricCard label="Acreditado a propietarios" value={formatMoney(summary?.earnings ?? 0)} />
      </div>

      <Toolbar count={hasMore ? `${transactions.length} cargados` : `${transactions.length}`}>
        <SearchInput value={search} onChange={setSearch} placeholder="ID, titular o referencia" />
        <FilterSelect
          label="Tipo"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'Todos los tipos' },
            ...(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map((t) => ({
              value: t,
              label: TRANSACTION_TYPE_LABELS[t],
            })),
          ]}
        />
        <FilterSelect
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Todos los estados' },
            { value: 'completed', label: 'Completadas' },
            { value: 'pending', label: 'Pendientes' },
            { value: 'failed', label: 'Fallidas' },
          ]}
        />
      </Toolbar>

      <DataTable
        columns={columns}
        rows={transactions}
        rowKey={(r) => r.id}
        onRowClick={setDetail}
        defaultSort={{ key: 'date', dir: 'desc' }}
      />

      {hasMore ? (
        <div style={{ marginTop: 'var(--gg-s3)', textAlign: 'center' }}>
          <Button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más movimientos'}
          </Button>
        </div>
      ) : null}

      <div style={{ marginTop: 'var(--gg-s3)' }}>
        <SchemaNote>
          Solo lectura, de a {TRANSACTIONS_PAGE_SIZE} movimientos. Ordenar por una columna ordena los
          ya cargados. Un ajuste manual de saldo (`wallet_transactions.type = 'adjustment'`) sería
          otra RPC `security definer`: `wallets` no tiene policy de UPDATE.
        </SchemaNote>
      </div>

      {detail ? (
        <Drawer
          open
          title="Detalle del movimiento"
          subtitle={TRANSACTION_TYPE_LABELS[detail.type] ?? detail.type}
          onClose={() => setDetail(null)}
        >
          <DrawerSection title="Datos">
            <KeyValue
              items={[
                ['Monto', formatSigned(detail.amount)],
                ['Fecha', formatDateTime(detail.createdAt)],
                ['Titular', detail.userName],
                ['Vista', TRANSACTION_SIDE_LABEL[detail.side]],
                ['Estado', detail.status],
                ['Cochera', detail.lotName ?? '—'],
                ['Referencia', detail.paymentGatewayRef ?? '—'],
                ['Origen', detail.isDemo ? 'Recarga de prueba (saldo ficticio)' : '—'],
              ]}
            />
          </DrawerSection>

          <DrawerSection title="Registro crudo">
            <pre
              style={{
                background: 'var(--gg-surface-3)',
                padding: 'var(--gg-s3)',
                borderRadius: 'var(--gg-r2)',
                fontSize: 'var(--gg-fs-sm)',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(detail, null, 2)}
            </pre>
          </DrawerSection>
        </Drawer>
      ) : null}
    </>
  );
}

/* ================================================================ Tickets */

type TicketTab = TicketStatus | 'all';

function TicketsView({ counts }: { counts: TicketCounts }) {
  const { show } = useToast();

  const [tab, setTab] = useState<TicketTab>('open');
  const [category, setCategory] = useState<TicketCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [busy, setBusy] = useState(false);

  // Los filtros los aplica el servidor (0059); la búsqueda también mira el texto de los mensajes.
  const {
    tickets: visible,
    loading,
    loadingMore,
    hasMore,
    error,
    refetch,
    loadMore,
    reply: sendReplyRpc,
    setStatus,
  } = useTickets({
    status: tab === 'all' ? null : tab,
    category: category === 'all' ? null : category,
    search,
  });

  const now = Date.now();

  const selected = visible.find((t) => t.id === selectedId) ?? visible[0] ?? null;
  const { messages: selectedMessages, reload: reloadMessages } = useTicketMessages(selected);

  const sendReply = async () => {
    if (!selected || reply.trim().length === 0 || busy) return;
    setBusy(true);
    try {
      await sendReplyRpc(selected.id, reply.trim());
      reloadMessages();
      if (resolveOnSend) await setStatus(selected.id, 'resolved');
      setReply('');
      setResolveOnSend(false);
      show(resolveOnSend ? 'Respuesta enviada y ticket resuelto' : 'Respuesta enviada');
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo enviar'}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await setStatus(selected.id, selected.status === 'open' ? 'resolved' : 'open');
      show(selected.status === 'open' ? 'Ticket resuelto' : 'Ticket reabierto');
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo cambiar el estado'}`);
    } finally {
      setBusy(false);
    }
  };

  if (loading && visible.length === 0 && !search && category === 'all') {
    return <EmptyState icon="⏳" title="Cargando tickets" description="Un momento." />;
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--gg-s4)' }}>
        <Callout tone="danger">
          <div>
            <strong>No se pudieron cargar los tickets.</strong>
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
    <div className="gg-split">
      <div className="gg-split__list">
        <SubTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: 'Abiertos', count: counts.open },
            { value: 'resolved', label: 'Resueltos', count: counts.resolved },
            { value: 'all', label: 'Todos', count: counts.all },
          ]}
        />

        <div
          className="gg-stack"
          style={{ padding: 'var(--gg-s3)', borderBottom: '1px solid var(--gg-border)', gap: 'var(--gg-s2)' }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Asunto, código o texto" width={320} />
          <FilterSelect
            label="Categoría"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'all', label: 'Todas las categorías' },
              ...(Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[]).map((c) => ({
                value: c,
                label: TICKET_CATEGORY_LABELS[c],
              })),
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="✓" title="Sin tickets" description="No hay reportes en este estado." />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {visible.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(t.id);
                    revealDetailOnNarrowScreens();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--gg-s3)',
                    border: 0,
                    borderBottom: '1px solid var(--gg-border)',
                    background: selected?.id === t.id ? 'var(--gg-surface-3)' : 'transparent',
                  }}
                >
                  <div className="gg-row">
                    <span className="gg-mono" style={{ color: 'var(--gg-text-faint)' }}>
                      {t.code}
                    </span>
                    <Badge tone={t.status === 'open' ? 'warn' : 'ok'}>
                      {t.status === 'open' ? 'Abierto' : 'Resuelto'}
                    </Badge>
                    <span
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--gg-text-faint)',
                        fontSize: 'var(--gg-fs-sm)',
                      }}
                    >
                      {formatRelative(t.updatedAt, now)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{t.subject}</div>
                  <div
                    className="gg-row"
                    style={{ marginTop: 4, color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}
                  >
                    {t.reporterName}
                    <Badge tone="neutral">{TICKET_CATEGORY_LABELS[t.category]}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasMore ? (
          <div style={{ padding: 'var(--gg-s3)', textAlign: 'center' }}>
            <Button onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Cargando…' : 'Cargar más tickets'}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="gg-split__detail">
        {!selected ? (
          <EmptyState icon="✉" title="Elegí un ticket" description="Seleccioná uno de la lista para leerlo." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <header style={{ padding: 'var(--gg-s4)', borderBottom: '1px solid var(--gg-border)' }}>
              <div className="gg-row">
                <h2 style={{ fontSize: 'var(--gg-fs-lg)', fontWeight: 600, flex: 1 }}>
                  {selected.subject}
                </h2>
                <Badge tone={selected.status === 'open' ? 'warn' : 'ok'}>
                  {selected.status === 'open' ? 'Abierto' : 'Resuelto'}
                </Badge>
              </div>
              <div
                className="gg-row"
                style={{ marginTop: 6, color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}
              >
                <span className="gg-mono">{selected.code}</span>
                <span>·</span>
                <span>
                  {selected.reporterName} (
                  {selected.reporterRole === 'owner' ? 'propietario' : 'conductor'})
                </span>
                <span>·</span>
                <span>Creado {formatDate(selected.createdAt)}</span>
                <span>·</span>
                {/* Sin reserva ni cochera asociada: una consulta general (migración 0076). */}
                <span>{selected.contextLabel ?? 'Consulta general'}</span>
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gg-s4)' }}>
              {selectedMessages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: m.authorSide === 'admin' ? 'flex-end' : 'flex-start',
                    marginBottom: 'var(--gg-s3)',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      background:
                        m.authorSide === 'admin' ? 'var(--gg-accent-soft)' : 'var(--gg-surface-3)',
                      border: '1px solid var(--gg-border)',
                      borderRadius: 'var(--gg-r3)',
                      padding: 'var(--gg-s3)',
                    }}
                  >
                    <div
                      className="gg-row"
                      style={{ fontSize: 'var(--gg-fs-sm)', color: 'var(--gg-text-soft)', marginBottom: 4 }}
                    >
                      <strong>{m.authorName}</strong>
                      <span>{formatDateTime(m.createdAt)}</span>
                    </div>
                    <div style={{ lineHeight: 1.55 }}>{m.body}</div>
                  </div>
                </div>
              ))}
            </div>

            <footer style={{ borderTop: '1px solid var(--gg-border)', padding: 'var(--gg-s3) var(--gg-s4)' }}>
              <textarea
                className="gg-textarea"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Escribí la respuesta al usuario…"
                style={{ minHeight: 70 }}
              />
              <div className="gg-row" style={{ marginTop: 'var(--gg-s2)' }}>
                <label className="gg-row" style={{ cursor: 'pointer', fontSize: 'var(--gg-fs-sm)' }}>
                  <input
                    type="checkbox"
                    checked={resolveOnSend}
                    onChange={(e) => setResolveOnSend(e.target.checked)}
                  />
                  Marcar como resuelto al enviar
                </label>

                <span style={{ marginLeft: 'auto' }} />

                <Button disabled={busy} onClick={toggleStatus}>
                  {selected.status === 'open' ? 'Marcar como resuelto' : 'Reabrir'}
                </Button>
                <Button variant="primary" disabled={busy || reply.trim().length === 0} onClick={sendReply}>
                  Responder
                </Button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
