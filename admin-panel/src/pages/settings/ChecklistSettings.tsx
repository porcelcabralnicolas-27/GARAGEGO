import { useCallback, useEffect, useState } from 'react';

import { formatRelative } from '../../lib/format';
import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { Field } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, Card, EmptyState, Toggle } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import {
  AUTO_CHECK_LABELS,
  CHECKLIST_CHANGE_FIELD_LABELS,
  CHECKLIST_CHANGE_FIELDS,
  CHECKLIST_LOT_TYPE_LABELS,
  CHECKLIST_MOMENT_LABELS,
  createChecklistItem,
  deleteChecklistItem,
  fetchChecklistItems,
  swapChecklistItems,
  updateChecklistItem,
  type AutoCheck,
  type ChecklistChangeField,
  type ChecklistItem,
  type ChecklistItemInput,
  type ChecklistLotType,
  type ChecklistMoment,
} from './checklistApi';

/**
 * Configuración → Aprobación y titularidad: el checklist de aprobación de publicaciones (0092). El
 * equipo decide qué se revisa, qué es obligatorio y a qué publicaciones se aplica cada punto.
 */

// La casilla y su texto en la misma línea también en pantallas angostas (ahí `.gg-row` parte la fila).
const CHECK_ROW = { cursor: 'pointer', flexWrap: 'nowrap', alignItems: 'flex-start' } as const;

const EMPTY_INPUT: ChecklistItemInput = {
  label: '',
  help: '',
  required: true,
  appliesLotType: 'all',
  appliesTo: 'always',
  needsDocuments: false,
  appliesWhenChanged: [],
  autoCheck: null,
  isActive: true,
};

export function ChecklistSettings() {
  const { show } = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // null = cerrado; { item: null } = punto nuevo; { item } = editar ese punto.
  const [editing, setEditing] = useState<{ item: ChecklistItem | null } | null>(null);
  const [toDelete, setToDelete] = useState<ChecklistItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchChecklistItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el checklist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Si otro admin lo cambia, se ve enseguida.
  useRealtimeRefresh('admin-checklist-settings', ['review_checklist_items'], () => void load());

  /** Corre una acción contra la base, avisa y recarga la lista. */
  const run = async (action: () => Promise<void>, okMessage: string) => {
    setBusy(true);
    try {
      await action();
      show(okMessage);
      await load();
    } catch (err) {
      show(`Error: ${err instanceof Error ? err.message : 'no se pudo guardar'}`);
    } finally {
      setBusy(false);
    }
  };

  const activeRequired = items.filter((item) => item.isActive && item.required).length;

  return (
    <Card
      title="Checklist de aprobación de publicaciones"
      actions={
        <Button variant="primary" size="sm" onClick={() => setEditing({ item: null })} disabled={busy}>
          + Agregar punto
        </Button>
      }
    >
      <div style={{ padding: 'var(--gg-s4)' }}>
        <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
          Es lo que el revisor tiene que chequear antes de aprobar una publicación en Inventario. Para
          aprobar hay que tildar todos los puntos <strong>obligatorios</strong> que corresponden a esa
          publicación; el servidor lo controla. Cada aprobación guarda qué se tildó, con el texto de ese
          momento: cambiar o borrar un punto no altera el historial.
        </p>

        {error ? (
          <Callout tone="danger">
            <div>
              <strong>No se pudo cargar el checklist.</strong>
              <p style={{ marginTop: 4 }}>{error}</p>
              <p style={{ marginTop: 4 }}>¿Están corridas las migraciones 0092 y 0096?</p>
            </div>
          </Callout>
        ) : loading ? (
          <EmptyState icon="⏳" title="Cargando checklist" description="Un momento." />
        ) : items.length === 0 ? (
          <EmptyState
            icon="☐"
            title="No hay puntos en el checklist"
            description="Sin puntos, una publicación se aprueba sin checklist. Agregá el primero."
          />
        ) : (
          <>
            {activeRequired === 0 ? (
              <div style={{ marginBottom: 'var(--gg-s3)' }}>
                <Callout tone="warn">
                  No hay ningún punto activo y obligatorio: las publicaciones se pueden aprobar sin tildar nada.
                </Callout>
              </div>
            ) : null}
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((item, index) => (
                <li
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--gg-s3)',
                    alignItems: 'flex-start',
                    padding: 'var(--gg-s3) 0',
                    borderTop: index === 0 ? 'none' : '1px solid var(--gg-border)',
                    opacity: item.isActive ? 1 : 0.55,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Subir "${item.label}"`}
                      disabled={busy || index === 0}
                      onClick={() => void run(() => swapChecklistItems(item, items[index - 1]), 'Orden actualizado')}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Bajar "${item.label}"`}
                      disabled={busy || index === items.length - 1}
                      onClick={() => void run(() => swapChecklistItems(item, items[index + 1]), 'Orden actualizado')}
                    >
                      ↓
                    </Button>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    {item.help ? (
                      <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)', marginTop: 2 }}>
                        {item.help}
                      </div>
                    ) : null}
                    <div className="gg-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 'var(--gg-s2)' }}>
                      <Badge tone={item.required ? 'accent' : 'neutral'}>
                        {item.required ? 'Obligatorio' : 'Opcional'}
                      </Badge>
                      <Badge>{CHECKLIST_LOT_TYPE_LABELS[item.appliesLotType]}</Badge>
                      <Badge>{CHECKLIST_MOMENT_LABELS[item.appliesTo]}</Badge>
                      {item.needsDocuments ? <Badge tone="info">Solo si subió documentos de titularidad</Badge> : null}
                      {item.appliesWhenChanged.length > 0 && item.appliesTo !== 'new' ? (
                        <Badge tone="info">
                          En ediciones, si cambió:{' '}
                          {item.appliesWhenChanged.map((field) => CHECKLIST_CHANGE_FIELD_LABELS[field].toLowerCase()).join(', ')}
                        </Badge>
                      ) : null}
                      {item.autoCheck ? <Badge tone="accent">Control: {AUTO_CHECK_LABELS[item.autoCheck]}</Badge> : null}
                      {item.isActive ? null : <Badge tone="warn">Desactivado</Badge>}
                    </div>
                    <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', marginTop: 4 }}>
                      Modificado {formatRelative(item.updatedAt, Date.now())}
                    </div>
                  </div>

                  <div className="gg-row" style={{ gap: 'var(--gg-s2)', alignItems: 'center' }}>
                    <Toggle
                      checked={item.isActive}
                      disabled={busy}
                      label={item.isActive ? `Desactivar "${item.label}"` : `Activar "${item.label}"`}
                      onChange={(next) =>
                        void run(
                          () => updateChecklistItem(item.id, { isActive: next }),
                          next ? 'Punto activado' : 'Punto desactivado'
                        )
                      }
                    />
                    <Button size="sm" disabled={busy} onClick={() => setEditing({ item })}>
                      Editar
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => setToDelete(item)}>
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
        <ChecklistItemDialog
          item={editing.item}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            void run(async () => {
              if (editing.item) await updateChecklistItem(editing.item.id, input);
              else await createChecklistItem(input, items);
              setEditing(null);
            }, editing.item ? 'Punto actualizado' : 'Punto agregado')
          }
        />
      ) : null}

      <Modal
        open={toDelete !== null}
        title="Eliminar punto del checklist"
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                const item = toDelete;
                if (!item) return;
                setToDelete(null);
                void run(() => deleteChecklistItem(item.id), 'Punto eliminado');
              }}
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          ¿Eliminar <strong>«{toDelete?.label}»</strong>? Las aprobaciones anteriores conservan el texto en
          su historial. Si solo querés dejar de pedirlo por un tiempo, desactivalo en vez de eliminarlo.
        </p>
      </Modal>
    </Card>
  );
}

function ChecklistItemDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: ChecklistItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: ChecklistItemInput) => void;
}) {
  const [input, setInput] = useState<ChecklistItemInput>(
    item
      ? {
          label: item.label,
          help: item.help ?? '',
          required: item.required,
          appliesLotType: item.appliesLotType,
          appliesTo: item.appliesTo,
          needsDocuments: item.needsDocuments,
          appliesWhenChanged: item.appliesWhenChanged,
          autoCheck: item.autoCheck,
          isActive: item.isActive,
        }
      : EMPTY_INPUT
  );
  const set = <K extends keyof ChecklistItemInput>(key: K, value: ChecklistItemInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const toggleField = (field: ChecklistChangeField, on: boolean) =>
    setInput((current) => ({
      ...current,
      // En el orden de la lista, sin repetidos.
      appliesWhenChanged: CHECKLIST_CHANGE_FIELDS.filter((f) =>
        f === field ? on : current.appliesWhenChanged.includes(f)
      ),
    }));

  const label = input.label.trim();
  const labelError =
    label.length === 0 ? null : label.length < 3 ? 'Mínimo 3 caracteres' : label.length > 200 ? 'Máximo 200 caracteres' : null;
  const helpError = (input.help ?? '').length > 500 ? 'Máximo 500 caracteres' : null;
  const canSave = label.length >= 3 && !labelError && !helpError && !busy;

  return (
    <Modal
      open
      title={item ? 'Editar punto del checklist' : 'Nuevo punto del checklist'}
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
      <Field label="Qué tiene que chequear el revisor" error={labelError}>
        <input
          className="gg-input"
          value={input.label}
          maxLength={200}
          placeholder="Ej.: El acceso desde la calle se ve en alguna foto"
          onChange={(e) => set('label', e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Ayuda para el revisor (opcional)" error={helpError}>
        <textarea
          className="gg-textarea"
          value={input.help ?? ''}
          maxLength={500}
          placeholder="Cómo chequearlo, qué buscar."
          onChange={(e) => set('help', e.target.value)}
        />
      </Field>

      <Field label="¿A qué publicaciones se aplica?">
        <div className="gg-row" style={{ gap: 'var(--gg-s2)', flexWrap: 'wrap' }}>
          <select
            className="gg-select"
            aria-label="Tipo de lugar"
            value={input.appliesLotType}
            onChange={(e) => set('appliesLotType', e.target.value as ChecklistLotType)}
          >
            {(Object.keys(CHECKLIST_LOT_TYPE_LABELS) as ChecklistLotType[]).map((value) => (
              <option key={value} value={value}>
                {CHECKLIST_LOT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            className="gg-select"
            aria-label="Momento"
            value={input.appliesTo}
            onChange={(e) => set('appliesTo', e.target.value as ChecklistMoment)}
          >
            {(Object.keys(CHECKLIST_MOMENT_LABELS) as ChecklistMoment[]).map((value) => (
              <option key={value} value={value}>
                {CHECKLIST_MOMENT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </Field>

      <Field label="En una edición, solo si cambió… (opcional)">
        {input.appliesTo === 'new' ? (
          <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
            No aplica: este punto es solo para altas nuevas, donde se revisa todo.
          </span>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: 'var(--gg-s2)',
              }}
            >
              {CHECKLIST_CHANGE_FIELDS.map((field) => (
                <label key={field} className="gg-row" style={CHECK_ROW}>
                  <input
                    type="checkbox"
                    checked={input.appliesWhenChanged.includes(field)}
                    onChange={(e) => toggleField(field, e.target.checked)}
                  />
                  <span>{CHECKLIST_CHANGE_FIELD_LABELS[field]}</span>
                </label>
              ))}
            </div>
            <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
              Sin marcar ninguno, aparece en todas las ediciones. En un alta nueva aparece siempre.
            </span>
          </>
        )}
      </Field>

      <Field label="Control automático (opcional)">
        <select
          className="gg-select"
          aria-label="Control automático"
          value={input.autoCheck ?? ''}
          onChange={(e) => set('autoCheck', (e.target.value || null) as AutoCheck | null)}
        >
          <option value="">Ninguno</option>
          {(Object.keys(AUTO_CHECK_LABELS) as AutoCheck[]).map((value) => (
            <option key={value} value={value}>
              {AUTO_CHECK_LABELS[value]}
            </option>
          ))}
        </select>
        <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          El panel muestra el resultado junto al punto al revisar. Ayuda, pero no tilda ni bloquea: el revisor decide.
        </span>
      </Field>

      <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
        <label className="gg-row" style={CHECK_ROW}>
          <input type="checkbox" checked={input.required} onChange={(e) => set('required', e.target.checked)} />
          <span>
            <strong>Obligatorio</strong>: sin tildarlo no se puede aprobar
          </span>
        </label>
        <label className="gg-row" style={CHECK_ROW}>
          <input
            type="checkbox"
            checked={input.needsDocuments}
            onChange={(e) => set('needsDocuments', e.target.checked)}
          />
          <span>Solo si la publicación subió documentos de titularidad y todavía no está verificada</span>
        </label>
        <label className="gg-row" style={CHECK_ROW}>
          <input type="checkbox" checked={input.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          <span>Activo</span>
        </label>
      </div>
    </Modal>
  );
}
