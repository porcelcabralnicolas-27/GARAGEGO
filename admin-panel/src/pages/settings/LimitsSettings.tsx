import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { formatMoney, formatRelative } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { Field } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, Card, EmptyState } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import {
  changedLimits,
  fetchLimits,
  LIMIT_LABELS,
  LIMIT_RANGES,
  MAX_QUICK_AMOUNTS,
  saveLimits,
  validateLimits,
  type LimitKey,
  type Limits,
  type LimitsMeta,
} from './settingsApi';

type NumberKey = Exclude<LimitKey, 'topup_quick_amounts'>;
/** Lo que se está escribiendo: los números como texto, para poder borrar el campo mientras se edita. */
type Draft = Record<NumberKey, string> & { topup_quick_amounts: number[] };

const MONEY_KEYS: NumberKey[] = ['wallet_max_balance', 'topup_min', 'topup_max'];

function toDraft(limits: Limits): Draft {
  const draft = { topup_quick_amounts: [...limits.topup_quick_amounts] } as Draft;
  for (const key of Object.keys(LIMIT_RANGES) as NumberKey[]) draft[key] = String(limits[key]);
  return draft;
}

function fromDraft(draft: Draft): Limits {
  const limits = { topup_quick_amounts: [...draft.topup_quick_amounts].sort((a, b) => a - b) } as Limits;
  for (const key of Object.keys(LIMIT_RANGES) as NumberKey[]) {
    limits[key] = draft[key].trim() === '' ? Number.NaN : Number(draft[key]);
  }
  return limits;
}

function show(key: LimitKey, value: number | number[]): string {
  if (Array.isArray(value)) return value.map((v) => formatMoney(v)).join(', ');
  return MONEY_KEYS.includes(key as NumberKey) ? formatMoney(value) : String(value);
}

/**
 * Configuración → Límites (0093). Los números que antes estaban fijos en la base y en la app. Se
 * guardan todos juntos, con confirmación, y el servidor los vuelve a validar.
 */
export function LimitsSettings() {
  const toast = useToast();
  const [saved, setSaved] = useState<Limits | null>(null);
  const [meta, setMeta] = useState<LimitsMeta>({ updatedAt: null, updatedByName: null });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (resetDraft: boolean) => {
    setError(null);
    try {
      const result = await fetchLimits();
      setSaved(result.limits);
      setMeta(result.meta);
      setDraft((current) => (resetDraft || current === null ? toDraft(result.limits) : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los límites.');
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Si otro admin guarda, se actualiza lo guardado sin pisar lo que se está escribiendo acá.
  useRealtimeRefresh('admin-limits-settings', ['app_settings'], () => void load(false));

  const current = useMemo(() => (draft ? fromDraft(draft) : null), [draft]);
  const errors = useMemo(() => (current ? validateLimits(current) : {}), [current]);
  const changes = useMemo(
    () => (saved && current ? changedLimits(saved, current) : {}),
    [saved, current]
  );
  const changedKeys = Object.keys(changes) as LimitKey[];
  const hasErrors = Object.keys(errors).length > 0;

  if (error) {
    return (
      <Callout tone="danger">
        <strong>No se pudieron cargar los límites.</strong>
        <p style={{ marginTop: 4 }}>{error}</p>
        <p style={{ marginTop: 4 }}>¿Está corrida la migración 0093?</p>
      </Callout>
    );
  }
  if (!saved || !draft || !current) {
    return <EmptyState icon="⏳" title="Cargando límites" description="Un momento." />;
  }

  const setValue = (key: NumberKey, value: string) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  const numberField = (key: NumberKey, help: ReactNode) => {
    const { min, max } = LIMIT_RANGES[key];
    const isMoney = MONEY_KEYS.includes(key);
    const value = current[key];
    return (
      <Field label={LIMIT_LABELS[key]} error={errors[key]}>
        <div className="gg-row" style={{ gap: 'var(--gg-s2)', flexWrap: 'nowrap', alignItems: 'center' }}>
          <input
            className="gg-input"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft[key]}
            aria-label={LIMIT_LABELS[key]}
            onChange={(e) => setValue(key, e.target.value)}
            style={{ maxWidth: 160 }}
          />
          {isMoney && Number.isFinite(value) ? (
            <span style={{ color: 'var(--gg-text-soft)', whiteSpace: 'nowrap' }}>{formatMoney(value)}</span>
          ) : null}
          {key in changes ? <Badge tone="accent">Sin guardar</Badge> : null}
        </div>
        <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>{help}</span>
      </Field>
    );
  };

  const addAmount = () => {
    const value = Number(newAmount);
    if (!Number.isInteger(value) || value <= 0) return;
    setDraft((d) =>
      d && !d.topup_quick_amounts.includes(value)
        ? { ...d, topup_quick_amounts: [...d.topup_quick_amounts, value].sort((a, b) => a - b) }
        : d
    );
    setNewAmount('');
  };

  const removeAmount = (value: number) =>
    setDraft((d) => (d ? { ...d, topup_quick_amounts: d.topup_quick_amounts.filter((a) => a !== value) } : d));

  const save = async () => {
    setBusy(true);
    try {
      await saveLimits(changes);
      setConfirming(false);
      toast.show('Límites guardados');
      await load(true);
    } catch (err) {
      setConfirming(false);
      toast.show(`Error: ${err instanceof Error ? err.message : 'no se pudo guardar'}`);
    } finally {
      setBusy(false);
    }
  };

  const grid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 'var(--gg-s4)',
    padding: 'var(--gg-s4)',
  } as const;

  return (
    <div className="gg-stack" style={{ gap: 'var(--gg-s4)' }}>
      <Callout tone="info">
        Estos límites los aplica el servidor y la app los muestra en sus pantallas. Bajar un límite no
        borra nada de lo que ya existe: por ejemplo, quien ya tiene 3 vehículos los conserva, pero no
        puede agregar otro. Los montos son en pesos.
      </Callout>

      <Card title="Publicaciones">
        <div style={grid}>
          {numberField('max_parking_images', 'Cuántas fotos puede subir el propietario a cada cochera. Entre 1 y 10.')}
          {numberField('parking_capacity_min', 'Menor cantidad de autos a la vez que se puede indicar al publicar.')}
          {numberField(
            'parking_capacity_max',
            'Mayor cantidad de autos a la vez. Las cocheras que ya tienen más siguen funcionando.'
          )}
        </div>
      </Card>

      <Card title="Vehículos">
        <div style={grid}>
          {numberField('max_vehicles_per_region', 'Por cada país (Argentina y Estados Unidos por separado). Entre 1 y 10.')}
        </div>
      </Card>

      <Card title="Billetera y recargas">
        <div style={grid}>
          {numberField('wallet_max_balance', 'No se puede recargar si el saldo pasaría este monto. Los cobros del propietario no tienen tope.')}
          {numberField('topup_min', 'Monto mínimo de cada recarga con Mercado Pago.')}
          {numberField('topup_max', 'Monto máximo de cada recarga. No puede superar el saldo máximo.')}
        </div>
        <div style={{ padding: '0 var(--gg-s4) var(--gg-s4)' }}>
          <Field label={LIMIT_LABELS.topup_quick_amounts} error={errors.topup_quick_amounts}>
            <div className="gg-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {draft.topup_quick_amounts.map((amount) => (
                <span
                  key={amount}
                  className="gg-badge gg-badge--neutral"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--gg-fs-md, 14px)' }}
                >
                  {formatMoney(amount)}
                  <button
                    type="button"
                    aria-label={`Quitar ${formatMoney(amount)}`}
                    onClick={() => removeAmount(amount)}
                    style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: '0 2px', color: 'inherit' }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {draft.topup_quick_amounts.length < MAX_QUICK_AMOUNTS ? (
                <span className="gg-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                  <input
                    className="gg-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="Ej.: 25000"
                    aria-label="Monto nuevo"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addAmount();
                    }}
                    style={{ maxWidth: 130 }}
                  />
                  <Button size="sm" onClick={addAmount} disabled={newAmount.trim() === ''}>
                    Agregar
                  </Button>
                </span>
              ) : null}
              {'topup_quick_amounts' in changes ? <Badge tone="accent">Sin guardar</Badge> : null}
            </div>
            <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
              Los botones de la pantalla de recarga. De 1 a {MAX_QUICK_AMOUNTS}, entre la recarga mínima y la máxima.
            </span>
          </Field>
        </div>
      </Card>

      <div
        className="gg-row"
        style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--gg-s3)', flexWrap: 'wrap' }}
      >
        <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          {meta.updatedAt
            ? `Último cambio ${formatRelative(meta.updatedAt, Date.now())}${meta.updatedByName ? `, por ${meta.updatedByName}` : ''}.`
            : 'Nunca se cambiaron: son los valores de siempre.'}
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
            Guardar cambios{changedKeys.length > 0 ? ` (${changedKeys.length})` : ''}
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        title="Guardar límites"
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
        <p style={{ marginBottom: 'var(--gg-s3)' }}>
          Se aplican enseguida para todos los usuarios, en la app y en el servidor:
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {changedKeys.map((key) => (
            <li key={key} style={{ marginBottom: 4 }}>
              <strong>{LIMIT_LABELS[key]}</strong>: {show(key, saved[key])} → {show(key, current[key])}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
