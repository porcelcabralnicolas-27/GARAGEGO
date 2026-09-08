import { useMemo, useState } from 'react';

import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  formatSigned,
  fullName,
} from '../../lib/format';
import {
  TICKET_CATEGORY_LABELS,
  TRANSACTION_TYPE_LABELS,
  type TicketCategory,
  type TicketStatus,
  type TransactionStatus,
  type TransactionType,
} from '../../mocks/types';
import { useMock } from '../../state/MockDataProvider';
import {
  selectTicketRows,
  selectTransactionRows,
  selectTransactionStats,
  type TransactionRow,
} from '../../state/selectors';
import { PageHeader } from '../../shell/PageHeader';
import { DataTable, type Column } from '../../ui/DataTable';
import { Drawer, DrawerSection } from '../../ui/overlays';
import { FilterSelect, SearchInput, SubTabs, Tabs, Toolbar } from '../../ui/controls';
import { MetricCard } from '../../ui/MetricCard';
import {
  Badge,
  Button,
  EmptyState,
  KeyValue,
  SchemaNote,
  UserCell,
} from '../../ui/primitives';
import { useToast } from '../../ui/Toast';

type MainTab = 'transactions' | 'tickets';

export function SupportPage() {
  const { state } = useMock();
  const openTickets = state.tickets.filter((t) => t.status === 'open').length;
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
          { value: 'tickets', label: 'Tickets', count: openTickets },
        ]}
      />

      {tab === 'transactions' ? <TransactionsView /> : <TicketsView />}
    </>
  );
}

/* ================================================================ Transacciones */

type TypeFilter = TransactionType | 'all';
type StatusFilter = TransactionStatus | 'all';

function TransactionsView() {
  const { state } = useMock();
  const rows = useMemo(() => selectTransactionRows(state), [state]);
  const stats = useMemo(() => selectTransactionStats(state), [state]);

  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [detail, setDetail] = useState<TransactionRow | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (type !== 'all' && r.tx.type !== type) return false;
      if (status !== 'all' && r.tx.status !== status) return false;
      if (!term) return true;
      return (
        r.tx.id.toLowerCase().includes(term) ||
        (r.tx.paymentGatewayRef ?? '').toLowerCase().includes(term) ||
        (r.user ? fullName(r.user).toLowerCase().includes(term) : false)
      );
    });
  }, [rows, search, type, status]);

  const columns: Column<TransactionRow>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (r) => formatDateTime(r.tx.createdAt),
      sortValue: (r) => r.tx.createdAt,
    },
    {
      key: 'user',
      header: 'Titular',
      render: (r) =>
        r.user ? (
          <UserCell
            person={r.user}
            sub={r.user.isOwnerEnabled ? 'Propietario' : 'Conductor'}
            size={24}
          />
        ) : (
          '—'
        ),
      sortValue: (r) => (r.user ? fullName(r.user) : ''),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (r) => (
        <Badge
          tone={
            r.tx.type === 'topup' || r.tx.type === 'refund' || r.tx.type === 'earning'
              ? 'ok'
              : r.tx.type === 'overtime_charge'
                ? 'warn'
                : r.tx.type === 'adjustment'
                  ? 'info'
                  : 'neutral'
          }
        >
          {TRANSACTION_TYPE_LABELS[r.tx.type]}
        </Badge>
      ),
      sortValue: (r) => r.tx.type,
    },
    {
      key: 'amount',
      header: 'Monto',
      align: 'num',
      render: (r) => (
        <span className={r.tx.amount >= 0 ? 'gg-amount--pos' : 'gg-amount--neg'}>
          {formatSigned(r.tx.amount)}
        </span>
      ),
      sortValue: (r) => r.tx.amount,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (r) => (
        <Badge
          tone={r.tx.status === 'completed' ? 'ok' : r.tx.status === 'failed' ? 'danger' : 'warn'}
        >
          {r.tx.status === 'completed' ? 'Completada' : r.tx.status === 'failed' ? 'Fallida' : 'Pendiente'}
        </Badge>
      ),
      sortValue: (r) => r.tx.status,
    },
    {
      key: 'booking',
      header: 'Reserva',
      render: (r) =>
        r.lot ? (
          <span style={{ color: 'var(--gg-text-soft)' }}>{r.lot.name}</span>
        ) : (
          <span style={{ color: 'var(--gg-text-faint)' }}>—</span>
        ),
    },
  ];

  return (
    <>
      <div className="gg-grid-4" style={{ marginBottom: 'var(--gg-s4)' }}>
        <MetricCard label="Volumen 30 días" value={formatMoney(stats.volume)} hint="movimientos completados" />
        <MetricCard label="Recargas" value={formatMoney(stats.topups)} />
        <MetricCard label="Pagos de reservas" value={formatMoney(stats.payments)} />
        <MetricCard label="Acreditado a propietarios" value={formatMoney(stats.earnings)} />
      </div>

      <Toolbar count={`${filtered.length} de ${rows.length}`}>
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
        rows={filtered.slice(0, 120)}
        rowKey={(r) => r.tx.id}
        onRowClick={setDetail}
        defaultSort={{ key: 'date', dir: 'desc' }}
      />

      <div style={{ marginTop: 'var(--gg-s3)' }}>
        <SchemaNote>
          Solo lectura. Un ajuste manual de saldo usaría `wallet_transactions.type = 'adjustment'`
          (está en el constraint pero ningún código lo emite hoy) y tendría que hacerse con una
          función `security definer`: la tabla `wallets` no tiene policy de UPDATE, así que no se
          puede tocar el saldo desde el cliente.
        </SchemaNote>
      </div>

      {detail ? (
        <Drawer
          open
          title="Detalle del movimiento"
          subtitle={TRANSACTION_TYPE_LABELS[detail.tx.type]}
          onClose={() => setDetail(null)}
        >
          <DrawerSection title="Datos">
            <KeyValue
              items={[
                ['Monto', formatSigned(detail.tx.amount)],
                ['Fecha', formatDateTime(detail.tx.createdAt)],
                ['Titular', detail.user ? fullName(detail.user) : '—'],
                ['Estado', detail.tx.status],
                ['Cochera', detail.lot?.name ?? '—'],
              ]}
            />
          </DrawerSection>

          <DrawerSection title="Registro crudo">
            {/* A propósito: cuando se conecte la base de verdad, esto sirve para comparar el
                mapeo campo por campo contra la fila real. */}
            <pre
              style={{
                background: 'var(--gg-surface-3)',
                padding: 'var(--gg-s3)',
                borderRadius: 'var(--gg-r2)',
                fontSize: 'var(--gg-fs-sm)',
                overflowX: 'auto',
              }}
            >
              {JSON.stringify(detail.tx, null, 2)}
            </pre>
          </DrawerSection>
        </Drawer>
      ) : null}
    </>
  );
}

/* ================================================================ Tickets */

type TicketTab = TicketStatus | 'all';

function TicketsView() {
  const { state, dispatch } = useMock();
  const { show } = useToast();

  const rows = useMemo(() => selectTicketRows(state), [state]);
  const [tab, setTab] = useState<TicketTab>('open');
  const [category, setCategory] = useState<TicketCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== 'all' && r.ticket.status !== tab) return false;
      if (category !== 'all' && r.ticket.category !== category) return false;
      if (!term) return true;
      return (
        r.ticket.subject.toLowerCase().includes(term) ||
        r.ticket.code.toLowerCase().includes(term) ||
        r.ticket.messages.some((m) => m.body.toLowerCase().includes(term))
      );
    });
  }, [rows, tab, category, search]);

  const selected = visible.find((r) => r.ticket.id === selectedId) ?? visible[0] ?? null;

  const sendReply = () => {
    if (!selected || reply.trim().length === 0) return;
    dispatch({ type: 'ADD_TICKET_REPLY', ticketId: selected.ticket.id, body: reply.trim() });
    if (resolveOnSend) {
      dispatch({ type: 'SET_TICKET_STATUS', ticketId: selected.ticket.id, status: 'resolved' });
    }
    setReply('');
    setResolveOnSend(false);
    show(resolveOnSend ? 'Respuesta enviada y ticket resuelto' : 'Respuesta enviada');
  };

  return (
    <div className="gg-split">
      <div className="gg-split__list">
        <SubTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: 'Abiertos', count: rows.filter((r) => r.ticket.status === 'open').length },
            { value: 'resolved', label: 'Resueltos', count: rows.filter((r) => r.ticket.status === 'resolved').length },
            { value: 'all', label: 'Todos', count: rows.length },
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
            {visible.map((row) => (
              <li key={row.ticket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.ticket.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: 'var(--gg-s3)',
                    border: 0,
                    borderBottom: '1px solid var(--gg-border)',
                    background:
                      selected?.ticket.id === row.ticket.id ? 'var(--gg-surface-3)' : 'transparent',
                  }}
                >
                  <div className="gg-row">
                    <span className="gg-mono" style={{ color: 'var(--gg-text-faint)' }}>
                      {row.ticket.code}
                    </span>
                    <Badge tone={row.ticket.status === 'open' ? 'warn' : 'ok'}>
                      {row.ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
                    </Badge>
                    <span
                      style={{
                        marginLeft: 'auto',
                        color: 'var(--gg-text-faint)',
                        fontSize: 'var(--gg-fs-sm)',
                      }}
                    >
                      {formatRelative(row.ticket.updatedAt, state.now)}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{row.ticket.subject}</div>
                  <div
                    className="gg-row"
                    style={{ marginTop: 4, color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}
                  >
                    {row.reporter ? fullName(row.reporter) : '—'}
                    <Badge tone="neutral">{TICKET_CATEGORY_LABELS[row.ticket.category]}</Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gg-split__detail">
        {!selected ? (
          <EmptyState icon="✉" title="Elegí un ticket" description="Seleccioná uno de la lista para leerlo." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <header style={{ padding: 'var(--gg-s4)', borderBottom: '1px solid var(--gg-border)' }}>
              <div className="gg-row">
                <h2 style={{ fontSize: 'var(--gg-fs-lg)', fontWeight: 600, flex: 1 }}>
                  {selected.ticket.subject}
                </h2>
                <Badge tone={selected.ticket.status === 'open' ? 'warn' : 'ok'}>
                  {selected.ticket.status === 'open' ? 'Abierto' : 'Resuelto'}
                </Badge>
              </div>
              <div
                className="gg-row"
                style={{ marginTop: 6, color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)' }}
              >
                <span className="gg-mono">{selected.ticket.code}</span>
                <span>·</span>
                {selected.reporter ? (
                  <span>
                    {fullName(selected.reporter)} (
                    {selected.ticket.reporterSide === 'owner' ? 'propietario' : 'conductor'})
                  </span>
                ) : null}
                <span>·</span>
                <span>Creado {formatDate(selected.ticket.createdAt)}</span>
                {selected.lot ? (
                  <>
                    <span>·</span>
                    <span>{selected.lot.name}</span>
                  </>
                ) : null}
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--gg-s4)' }}>
              {selected.ticket.messages.map((m) => (
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

                <Button
                  onClick={() =>
                    dispatch({
                      type: 'SET_TICKET_STATUS',
                      ticketId: selected.ticket.id,
                      status: selected.ticket.status === 'open' ? 'resolved' : 'open',
                    })
                  }
                >
                  {selected.ticket.status === 'open' ? 'Marcar como resuelto' : 'Reabrir'}
                </Button>
                <Button variant="primary" disabled={reply.trim().length === 0} onClick={sendReply}>
                  Responder
                </Button>
              </div>

              <div style={{ marginTop: 'var(--gg-s3)' }}>
                <SchemaNote>
                  Los tickets son 100 % simulados: no existe ninguna tabla de soporte. El único
                  canal de la app es `messages`, atado a una reserva, y no hay ningún canal
                  usuario ↔ plataforma.
                </SchemaNote>
              </div>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
