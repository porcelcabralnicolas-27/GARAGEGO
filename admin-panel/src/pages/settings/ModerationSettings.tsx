import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatRelative } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { Field } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, Card, EmptyState } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import {
  changedSla,
  createReason,
  deleteReason,
  fetchReasons,
  fetchSla,
  formatHours,
  PRICE_FACTOR_RANGE,
  REASON_KIND_INFO,
  REASON_KINDS,
  REASON_MAX,
  REASON_MIN,
  savePriceFactor,
  saveSla,
  SLA_KEYS,
  SLA_LABELS,
  SLA_RANGE,
  swapReasons,
  updateReason,
  validateSla,
  type ModerationReason,
  type ReasonKind,
  type SlaHours,
  type SlaKey,
} from './moderationSettingsApi';
import type { SettingsMeta } from './settingsApi';
import { SortableList } from './SortableList';

/** Colores de la cola de aprobación (los mismos que usa Inventario) para marcas y barras. */
export const SLA_COLORS = {
  ok: 'var(--gg-border-strong)',
  info: 'var(--gg-info)',
  warn: 'var(--gg-sla-yellow)',
  danger: 'var(--gg-danger)',
} as const;

/** Los mismos colores para TEXTO: el amarillo no se lee sobre blanco, así que va el ámbar oscuro. */
export const SLA_TEXT_COLORS = { ...SLA_COLORS, warn: 'var(--gg-warn)' } as const;

/**
 * Configuración → Moderación (0095): plazos de la cola de aprobación y motivos que se eligen al
 * rechazar, pausar u ocultar una reseña.
 */
export function ModerationSettings() {
  return (
    <div className="gg-stack" style={{ gap: 'var(--gg-s4)' }}>
      <SlaCard />
      <PriceFactorCard />
      <ReasonsCards />
    </div>
  );
}

/* ---------------------------------------------------------------- Plazos */

type SlaDraft = Record<SlaKey, string>;

const toDraft = (sla: SlaHours): SlaDraft =>
  Object.fromEntries(SLA_KEYS.map((key) => [key, String(sla[key])])) as SlaDraft;

const fromDraft = (draft: SlaDraft): SlaHours =>
  Object.fromEntries(
    SLA_KEYS.map((key) => [key, draft[key].trim() === '' ? Number.NaN : Number(draft[key])])
  ) as SlaHours;

const SLA_HELP: Record<SlaKey, string> = {
  review_sla_info_hours: 'Desde acá se marca en azul: conviene revisarla pronto.',
  review_sla_warn_hours: 'Desde acá, en amarillo: se está demorando.',
  review_sla_danger_hours: 'Desde acá, en rojo: está atrasada.',
};

const SLA_KEY_COLOR: Record<SlaKey, string> = {
  review_sla_info_hours: SLA_COLORS.info,
  review_sla_warn_hours: SLA_COLORS.warn,
  review_sla_danger_hours: SLA_COLORS.danger,
};

function SlaCard() {
  const toast = useToast();
  const [saved, setSaved] = useState<SlaHours | null>(null);
  const [meta, setMeta] = useState<SettingsMeta>({ updatedAt: null, updatedByName: null });
  const [draft, setDraft] = useState<SlaDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (resetDraft: boolean) => {
    setError(null);
    try {
      const result = await fetchSla();
      setSaved(result.sla);
      setMeta(result.meta);
      setDraft((current) => (resetDraft || current === null ? toDraft(result.sla) : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los plazos.');
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Si otro admin guarda, se actualiza lo guardado sin pisar lo que se está escribiendo acá.
  useRealtimeRefresh('admin-sla-settings', ['app_settings'], () => void load(false));

  const current = useMemo(() => (draft ? fromDraft(draft) : null), [draft]);
  const errors = useMemo(() => (current ? validateSla(current) : {}), [current]);
  const changes = useMemo(() => (saved && current ? changedSla(saved, current) : {}), [saved, current]);
  const changedKeys = Object.keys(changes) as SlaKey[];
  const hasErrors = Object.keys(errors).length > 0;

  if (error) {
    return (
      <Callout tone="danger">
        <strong>No se pudieron cargar los plazos de la cola.</strong>
        <p style={{ marginTop: 4 }}>{error}</p>
        <p style={{ marginTop: 4 }}>¿Está corrida la migración 0095?</p>
      </Callout>
    );
  }
  if (!saved || !draft || !current) {
    return <EmptyState icon="⏳" title="Cargando plazos" description="Un momento." />;
  }

  const save = async () => {
    setBusy(true);
    try {
      await saveSla(changes);
      setConfirming(false);
      toast.show('Plazos guardados');
      await load(true);
    } catch (err) {
      setConfirming(false);
      toast.show(`Error: ${err instanceof Error ? err.message : 'no se pudo guardar'}`);
    } finally {
      setBusy(false);
    }
  };

  // La barra muestra lo que se está escribiendo; si algo es inválido, lo guardado.
  const preview = hasErrors ? saved : current;

  return (
    <Card title="Plazos de la cola de aprobación">
      <div style={{ padding: 'var(--gg-s4)' }}>
        <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
          En Inventario, cada publicación pendiente se colorea según cuánto lleva esperando revisión. Estos son
          los plazos, en horas desde que el propietario la envió.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--gg-s4)',
          }}
        >
          {SLA_KEYS.map((key) => (
            <Field key={key} label={SLA_LABELS[key]} error={errors[key]}>
              <div className="gg-row" style={{ gap: 'var(--gg-s2)', flexWrap: 'nowrap', alignItems: 'center' }}>
                <span
                  aria-hidden
                  style={{ width: 12, height: 12, borderRadius: 3, background: SLA_KEY_COLOR[key], flexShrink: 0 }}
                />
                <input
                  className="gg-input"
                  type="number"
                  inputMode="numeric"
                  min={SLA_RANGE.min}
                  max={SLA_RANGE.max}
                  step={1}
                  value={draft[key]}
                  aria-label={SLA_LABELS[key]}
                  onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
                  style={{ maxWidth: 110 }}
                />
                <span style={{ color: 'var(--gg-text-soft)', whiteSpace: 'nowrap' }}>horas</span>
                {key in changes ? <Badge tone="accent">Sin guardar</Badge> : null}
              </div>
              <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>{SLA_HELP[key]}</span>
            </Field>
          ))}
        </div>

        <SlaBar sla={preview} />
      </div>

      <div
        className="gg-row"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--gg-s3)',
          flexWrap: 'wrap',
          padding: '0 var(--gg-s4) var(--gg-s4)',
        }}
      >
        <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          {meta.updatedAt
            ? `Último cambio ${formatRelative(meta.updatedAt, Date.now())}${meta.updatedByName ? `, por ${meta.updatedByName}` : ''}.`
            : 'Nunca se cambiaron: son los plazos de siempre.'}
        </span>
        <div className="gg-row" style={{ gap: 'var(--gg-s2)' }}>
          <Button disabled={busy || changedKeys.length === 0} onClick={() => setDraft(toDraft(saved))}>
            Descartar
          </Button>
          <Button
            variant="primary"
            disabled={busy || changedKeys.length === 0 || hasErrors}
            onClick={() => setConfirming(true)}
          >
            Guardar plazos{changedKeys.length > 0 ? ` (${changedKeys.length})` : ''}
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        title="Guardar plazos"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Cancelar</Button>
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              Guardar
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 'var(--gg-s3)' }}>La cola de Inventario se colorea con los plazos nuevos:</p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {changedKeys.map((key) => (
            <li key={key} style={{ marginBottom: 4 }}>
              <strong>{SLA_LABELS[key]}</strong>: {formatHours(saved[key])} → {formatHours(current[key])}
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  );
}

/** Los cuatro tramos de la cola, con sus colores. */
export function SlaBar({ sla }: { sla: SlaHours }) {
  const info = formatHours(sla.review_sla_info_hours);
  const warn = formatHours(sla.review_sla_warn_hours);
  const danger = formatHours(sla.review_sla_danger_hours);
  const segments = [
    { color: SLA_COLORS.ok, text: `Menos de ${info}` },
    { color: SLA_COLORS.info, text: `${info} a ${warn}` },
    { color: SLA_COLORS.warn, text: `${warn} a ${danger}` },
    { color: SLA_COLORS.danger, text: `Más de ${danger}` },
  ];
  return (
    <div
      role="img"
      aria-label={segments.map((s) => s.text).join(', ')}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 4,
        marginTop: 'var(--gg-s4)',
      }}
    >
      {segments.map((segment) => (
        <div key={segment.text}>
          <div style={{ height: 8, borderRadius: 4, background: segment.color }} />
          <div style={{ fontSize: 'var(--gg-fs-sm)', color: 'var(--gg-text-soft)', marginTop: 4 }}>{segment.text}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Control de tarifa */

/** Factor del control automático de tarifa del checklist (0096). */
function PriceFactorCard() {
  const toast = useToast();
  const [saved, setSaved] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (resetDraft: boolean) => {
    try {
      const { priceFactor } = await fetchSla();
      setSaved(priceFactor);
      if (resetDraft) setDraft(String(priceFactor));
    } catch {
      // Sin la 0095 lo avisa la tarjeta de plazos.
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);
  useRealtimeRefresh('admin-price-factor', ['app_settings'], () => void load(false));

  if (saved === null) return null;

  const value = draft.trim() === '' ? Number.NaN : Number(draft);
  const error = !Number.isInteger(value)
    ? 'Tiene que ser un número entero.'
    : value < PRICE_FACTOR_RANGE.min || value > PRICE_FACTOR_RANGE.max
      ? `Tiene que estar entre ${PRICE_FACTOR_RANGE.min} y ${PRICE_FACTOR_RANGE.max}.`
      : null;
  const changed = !error && value !== saved;

  const save = async () => {
    setBusy(true);
    try {
      await savePriceFactor(value);
      toast.show('Control de tarifa guardado');
      await load(true);
    } catch (err) {
      toast.show(`Error: ${err instanceof Error ? err.message : 'no se pudo guardar'}`);
    } finally {
      setBusy(false);
    }
  };

  const example = Number.isInteger(value) && !error ? value : saved;

  return (
    <Card title="Control de tarifa del checklist">
      <div style={{ padding: 'var(--gg-s4)' }}>
        <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
          Al revisar una publicación, el punto del checklist con el control de tarifa compara su precio con la
          mediana de las cocheras aprobadas del mismo país y tipo de lugar, y avisa si se aparta demasiado.
        </p>
        <Field label="Avisar si se aparta más de" error={error}>
          <div className="gg-row" style={{ gap: 'var(--gg-s2)', flexWrap: 'nowrap', alignItems: 'center' }}>
            <input
              className="gg-input"
              type="number"
              inputMode="numeric"
              min={PRICE_FACTOR_RANGE.min}
              max={PRICE_FACTOR_RANGE.max}
              step={1}
              value={draft}
              aria-label="Factor del control de tarifa"
              onChange={(e) => setDraft(e.target.value)}
              style={{ maxWidth: 90 }}
            />
            <span style={{ color: 'var(--gg-text-soft)', whiteSpace: 'nowrap' }}>veces la mediana</span>
            {changed ? <Badge tone="accent">Sin guardar</Badge> : null}
          </div>
          <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
            Con {example}: si la mediana es $ 1.000, avisa por debajo de $ {Math.round(1000 / example).toLocaleString('es-AR')}{' '}
            o por encima de $ {(1000 * example).toLocaleString('es-AR')}. Entre {PRICE_FACTOR_RANGE.min} y{' '}
            {PRICE_FACTOR_RANGE.max}.
          </span>
        </Field>
        <div className="gg-row" style={{ justifyContent: 'flex-end', gap: 'var(--gg-s2)' }}>
          <Button disabled={busy || draft === String(saved)} onClick={() => setDraft(String(saved))}>
            Descartar
          </Button>
          <Button variant="primary" disabled={busy || !changed} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Motivos */

function ReasonsCards() {
  const { show } = useToast();
  const [reasons, setReasons] = useState<ModerationReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ kind: ReasonKind; item: ModerationReason | null } | null>(null);
  const [toDelete, setToDelete] = useState<ModerationReason | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setReasons(await fetchReasons());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los motivos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh('admin-reason-settings', ['moderation_reasons'], () => void load());

  /** Corre una acción contra la base, avisa y recarga. Devuelve si salió bien. */
  const run = async (action: () => Promise<void>, okMessage: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      show(okMessage);
      await load();
      return true;
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo guardar'}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Callout tone="danger">
        <strong>No se pudieron cargar los motivos.</strong>
        <p style={{ marginTop: 4 }}>{error}</p>
      </Callout>
    );
  }
  if (loading) return <EmptyState icon="⏳" title="Cargando motivos" description="Un momento." />;

  return (
    <>
      <Callout tone="info">
        Los motivos son las opciones que aparecen al rechazar, pausar u ocultar. Lo que ya se registró conserva su
        texto: editar o eliminar un motivo no cambia el historial. Cada lista tiene que tener al menos uno activo.
      </Callout>

      {REASON_KINDS.map((kind) => {
        const items = reasons.filter((r) => r.kind === kind);
        const activeCount = items.filter((r) => r.isActive).length;
        return (
          <Card
            key={kind}
            title={REASON_KIND_INFO[kind].title}
            actions={
              <Button variant="primary" size="sm" disabled={busy} onClick={() => setEditing({ kind, item: null })}>
                + Agregar motivo
              </Button>
            }
          >
            <div style={{ padding: 'var(--gg-s4)' }}>
              <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>{REASON_KIND_INFO[kind].where}</p>
              <SortableList
                items={items}
                busy={busy}
                itemKey={(item) => item.id}
                render={(item) => <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.label}</div>}
                onMove={(a, b) => void run(() => swapReasons(a, b), 'Orden actualizado')}
                onToggle={(item, next) =>
                  void run(() => updateReason(item.id, { isActive: next }), next ? 'Motivo activado' : 'Motivo desactivado')
                }
                onEdit={(item) => setEditing({ kind, item })}
                onDelete={(item) => setToDelete(item)}
                deleteBlockedReason={(item) =>
                  item.isActive && activeCount <= 1 ? 'Es el único activo de la lista' : null
                }
              />
            </div>
          </Card>
        );
      })}

      {editing ? (
        <ReasonDialog
          kind={editing.kind}
          item={editing.item}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (label) => {
            const ok = await run(
              () => (editing.item ? updateReason(editing.item.id, { label }) : createReason(editing.kind, label, reasons)),
              editing.item ? 'Motivo actualizado' : 'Motivo agregado'
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      <Modal
        open={toDelete !== null}
        title="Eliminar motivo"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const target = toDelete;
                if (!target) return;
                setToDelete(null);
                void run(() => deleteReason(target.id), 'Motivo eliminado');
              }}
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          ¿Eliminar <strong>«{toDelete?.label}»</strong> de «{toDelete ? REASON_KIND_INFO[toDelete.kind].title : ''}»?
          Deja de ofrecerse, pero lo ya registrado con este motivo conserva el texto.
        </p>
      </Modal>
    </>
  );
}

function ReasonDialog({
  kind,
  item,
  busy,
  onClose,
  onSave,
}: {
  kind: ReasonKind;
  item: ModerationReason | null;
  busy: boolean;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const text = label.trim();
  const err =
    text.length === 0 ? null : text.length < REASON_MIN ? `Mínimo ${REASON_MIN} caracteres` : null;
  const canSave = text.length >= REASON_MIN && text.length <= REASON_MAX && text !== item?.label && !busy;

  return (
    <Modal
      open
      title={item ? 'Editar motivo' : `Nuevo motivo · ${REASON_KIND_INFO[kind].title}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => onSave(text)}>
            {item ? 'Guardar cambios' : 'Agregar'}
          </Button>
        </>
      }
    >
      <Field label="Motivo" error={err}>
        <input
          className="gg-input"
          value={label}
          maxLength={REASON_MAX}
          placeholder="Ej.: Fotos de otra cochera"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave(text);
          }}
          autoFocus
        />
      </Field>
      {item ? (
        <p style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          Lo ya registrado con el nombre anterior no cambia.
        </p>
      ) : null}
    </Modal>
  );
}
