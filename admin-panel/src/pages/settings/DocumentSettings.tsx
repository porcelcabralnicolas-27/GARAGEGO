import { useCallback, useEffect, useState } from 'react';

import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, type DocumentKind, type DocumentPolicy, type LotType } from '../../domain';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { Field } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, Card, EmptyState } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import {
  createDocumentRule,
  deleteDocumentRule,
  DOCUMENT_POLICY_LABELS,
  fetchDocumentRules,
  RULE_LOT_TYPE_LABELS,
  swapDocumentRules,
  updateDocumentRule,
  type DocumentRuleInput,
  type DocumentRuleItem,
} from './documentRulesApi';

// La casilla y su texto en la misma línea también en pantallas angostas.
const CHECK_ROW = { cursor: 'pointer', flexWrap: 'nowrap', alignItems: 'flex-start' } as const;

const POLICY_TONE: Record<DocumentPolicy, 'accent' | 'neutral' | 'warn'> = {
  required: 'accent',
  optional: 'neutral',
  off: 'warn',
};

const rolesText = (rule: DocumentRuleItem) =>
  [rule.forOwner ? 'titular' : null, rule.forTenant ? 'inquilino' : null, rule.forManager ? 'administrador' : null]
    .filter(Boolean)
    .join(', ');

/**
 * Configuración → Aprobación y titularidad → Documentos que se piden (0097). Qué tiene que subir el
 * propietario para publicar, según su relación con el lugar y el tipo de lugar.
 */
export function DocumentSettings() {
  const { show } = useToast();
  const [rules, setRules] = useState<DocumentRuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ item: DocumentRuleItem | null } | null>(null);
  const [toDelete, setToDelete] = useState<DocumentRuleItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRules(await fetchDocumentRules());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh('admin-document-settings', ['document_requirements'], () => void load());

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

  const requiredCount = rules.filter((rule) => rule.policy === 'required').length;

  return (
    <Card
      title="Documentos que se piden"
      actions={
        <Button variant="primary" size="sm" disabled={busy || loading || error !== null} onClick={() => setEditing({ item: null })}>
          + Agregar requisito
        </Button>
      }
    >
      <div style={{ padding: 'var(--gg-s4)' }}>
        <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
          Lo que el propietario tiene que subir en el paso «Titularidad» para publicar. Cada requisito se cumple con
          cualquiera de sus documentos. Los <strong>obligatorios</strong> los exige el servidor: sin ellos no se puede
          publicar ni aprobar. Las cocheras con la titularidad ya verificada no se ven afectadas.
        </p>

        {error ? (
          <Callout tone="danger">
            <div>
              <strong>No se pudieron cargar los documentos.</strong>
              <p style={{ marginTop: 4 }}>{error}</p>
            </div>
          </Callout>
        ) : loading ? (
          <EmptyState icon="⏳" title="Cargando documentos" description="Un momento." />
        ) : (
          <>
            {requiredCount === 0 ? (
              <div style={{ marginBottom: 'var(--gg-s3)' }}>
                <Callout tone="warn">
                  No hay ningún documento obligatorio: las publicaciones van a revisión sin acreditar la titularidad.
                </Callout>
              </div>
            ) : null}
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rules.map((rule, index) => (
                <li
                  key={rule.code}
                  style={{
                    display: 'flex',
                    gap: 'var(--gg-s3)',
                    alignItems: 'flex-start',
                    padding: 'var(--gg-s3) 0',
                    borderTop: index === 0 ? 'none' : '1px solid var(--gg-border)',
                    opacity: rule.policy === 'off' ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Subir "${rule.label}"`}
                      disabled={busy || index === 0}
                      onClick={() => void run(() => swapDocumentRules(rule, rules[index - 1]), 'Orden actualizado')}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Bajar "${rule.label}"`}
                      disabled={busy || index === rules.length - 1}
                      onClick={() => void run(() => swapDocumentRules(rule, rules[index + 1]), 'Orden actualizado')}
                    >
                      ↓
                    </Button>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{rule.label}</div>
                    {rule.hint ? (
                      <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)', marginTop: 2 }}>{rule.hint}</div>
                    ) : null}
                    <div className="gg-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 'var(--gg-s2)' }}>
                      <Badge tone={POLICY_TONE[rule.policy]}>{DOCUMENT_POLICY_LABELS[rule.policy]}</Badge>
                      <Badge>Se le pide a: {rolesText(rule)}</Badge>
                      <Badge>{RULE_LOT_TYPE_LABELS[rule.appliesLotType]}</Badge>
                    </div>
                    <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', marginTop: 4 }}>
                      Lo cumple: {rule.kinds.map((kind) => DOCUMENT_KIND_LABELS[kind]).join(' o ')}
                    </div>
                  </div>

                  <div className="gg-row" style={{ gap: 'var(--gg-s2)', alignItems: 'center' }}>
                    <select
                      className="gg-select"
                      aria-label={`Política de "${rule.label}"`}
                      value={rule.policy}
                      disabled={busy}
                      onChange={(e) =>
                        void run(
                          () => updateDocumentRule(rule.code, { policy: e.target.value as DocumentPolicy }),
                          `«${rule.label}»: ${DOCUMENT_POLICY_LABELS[e.target.value as DocumentPolicy].toLowerCase()}`
                        )
                      }
                    >
                      {(Object.keys(DOCUMENT_POLICY_LABELS) as DocumentPolicy[]).map((policy) => (
                        <option key={policy} value={policy}>
                          {DOCUMENT_POLICY_LABELS[policy]}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" disabled={busy} onClick={() => setEditing({ item: rule })}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || rule.isBuiltin}
                      title={rule.isBuiltin ? 'Es de los requisitos de base: ponelo en «No se pide» en vez de eliminarlo' : undefined}
                      onClick={() => setToDelete(rule)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      {editing ? (
        <DocumentRuleDialog
          item={editing.item}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const ok = await run(
              () => (editing.item ? updateDocumentRule(editing.item.code, input) : createDocumentRule(input, rules)),
              editing.item ? 'Requisito actualizado' : 'Requisito agregado'
            );
            if (ok) setEditing(null);
          }}
        />
      ) : null}

      <Modal
        open={toDelete !== null}
        title="Eliminar requisito"
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
                void run(() => deleteDocumentRule(target.code), 'Requisito eliminado');
              }}
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          ¿Eliminar <strong>«{toDelete?.label}»</strong>? Deja de pedirse. Los documentos que ya se subieron no se borran.
        </p>
      </Modal>
    </Card>
  );
}

const EMPTY_INPUT: DocumentRuleInput = {
  label: '',
  hint: '',
  kinds: [],
  forOwner: true,
  forTenant: true,
  forManager: true,
  appliesLotType: 'all',
  policy: 'required',
};

function DocumentRuleDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: DocumentRuleItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: DocumentRuleInput) => void;
}) {
  const [input, setInput] = useState<DocumentRuleInput>(
    item
      ? {
          label: item.label,
          hint: item.hint,
          kinds: item.kinds,
          forOwner: item.forOwner,
          forTenant: item.forTenant,
          forManager: item.forManager,
          appliesLotType: item.appliesLotType,
          policy: item.policy,
        }
      : EMPTY_INPUT
  );
  const set = <K extends keyof DocumentRuleInput>(key: K, value: DocumentRuleInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const toggleKind = (kind: DocumentKind, on: boolean) =>
    setInput((current) => ({
      ...current,
      kinds: DOCUMENT_KINDS.filter((k) => (k === kind ? on : current.kinds.includes(k))),
    }));

  const label = input.label.trim();
  const labelError = label.length === 0 ? null : label.length < 3 ? 'Mínimo 3 caracteres' : null;
  const noKinds = input.kinds.length === 0;
  const noRoles = !input.forOwner && !input.forTenant && !input.forManager;
  const canSave = label.length >= 3 && label.length <= 80 && input.hint.length <= 300 && !noKinds && !noRoles && !busy;

  return (
    <Modal
      open
      title={item ? 'Editar requisito' : 'Nuevo requisito'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!canSave} onClick={() => onSave(input)}>
            {item ? 'Guardar cambios' : 'Agregar'}
          </Button>
        </>
      }
    >
      <Field label="Nombre (lo ve el propietario)" error={labelError}>
        <input
          className="gg-input"
          value={input.label}
          maxLength={80}
          placeholder="Ej.: Comprobante de domicilio"
          onChange={(e) => set('label', e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Ayuda (opcional)" error={input.hint.length > 300 ? 'Máximo 300 caracteres' : null}>
        <textarea
          className="gg-textarea"
          value={input.hint}
          maxLength={300}
          placeholder="Qué tiene que mostrar el documento."
          onChange={(e) => set('hint', e.target.value)}
        />
      </Field>
      <Field label="Lo cumple cualquiera de estos documentos" error={noKinds ? 'Elegí al menos uno.' : null}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--gg-s2)' }}>
          {DOCUMENT_KINDS.map((kind) => (
            <label key={kind} className="gg-row" style={CHECK_ROW}>
              <input type="checkbox" checked={input.kinds.includes(kind)} onChange={(e) => toggleKind(kind, e.target.checked)} />
              <span>{DOCUMENT_KIND_LABELS[kind]}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Se le pide a" error={noRoles ? 'Elegí al menos uno.' : null}>
        <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
          <label className="gg-row" style={CHECK_ROW}>
            <input type="checkbox" checked={input.forOwner} onChange={(e) => set('forOwner', e.target.checked)} />
            <span>Titular (dueño)</span>
          </label>
          <label className="gg-row" style={CHECK_ROW}>
            <input type="checkbox" checked={input.forTenant} onChange={(e) => set('forTenant', e.target.checked)} />
            <span>Inquilino</span>
          </label>
          <label className="gg-row" style={CHECK_ROW}>
            <input type="checkbox" checked={input.forManager} onChange={(e) => set('forManager', e.target.checked)} />
            <span>Administra el lugar para el dueño</span>
          </label>
        </div>
      </Field>
      <Field label="Tipo de lugar y política">
        <div className="gg-row" style={{ gap: 'var(--gg-s2)', flexWrap: 'wrap' }}>
          <select
            className="gg-select"
            aria-label="Tipo de lugar"
            value={input.appliesLotType}
            onChange={(e) => set('appliesLotType', e.target.value as 'all' | LotType)}
          >
            {(Object.keys(RULE_LOT_TYPE_LABELS) as Array<'all' | LotType>).map((value) => (
              <option key={value} value={value}>
                {RULE_LOT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            className="gg-select"
            aria-label="Política"
            value={input.policy}
            onChange={(e) => set('policy', e.target.value as DocumentPolicy)}
          >
            {(Object.keys(DOCUMENT_POLICY_LABELS) as DocumentPolicy[]).map((policy) => (
              <option key={policy} value={policy}>
                {DOCUMENT_POLICY_LABELS[policy]}
              </option>
            ))}
          </select>
        </div>
      </Field>
    </Modal>
  );
}
