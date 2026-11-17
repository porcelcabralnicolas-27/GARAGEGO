import { useCallback, useEffect, useState } from 'react';

import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { Field } from '../../ui/controls';
import { Modal } from '../../ui/overlays';
import { Badge, Button, Callout, Card, EmptyState } from '../../ui/primitives';
import { useToast } from '../../ui/Toast';
import {
  AMENITY_ICON_KEYS,
  AMENITY_ICONS,
  createAmenity,
  createTicketCategory,
  deleteCatalogItem,
  fetchAmenities,
  fetchCatalogUsage,
  fetchTicketCategories,
  swapCatalogItems,
  updateAmenity,
  updateTicketCategory,
  type AmenityInput,
  type AmenityItem,
  type CatalogName,
  type TicketCategoryInput,
  type TicketCategoryItem,
} from './catalogsApi';
import { SortableList } from './SortableList';

// La casilla y su texto en la misma línea también en pantallas angostas.
const CHECK_ROW = { cursor: 'pointer', flexWrap: 'nowrap', alignItems: 'flex-start' } as const;

/**
 * Configuración → Catálogos (0094): los servicios que un propietario puede marcar en su cochera y
 * las categorías con que se abre un ticket de soporte.
 */
export function CatalogSettings() {
  const { show } = useToast();
  const [amenities, setAmenities] = useState<AmenityItem[]>([]);
  const [categories, setCategories] = useState<TicketCategoryItem[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingAmenity, setEditingAmenity] = useState<{ item: AmenityItem | null } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ item: TicketCategoryItem | null } | null>(null);
  const [toDelete, setToDelete] = useState<{ catalog: CatalogName; code: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, c, u] = await Promise.all([fetchAmenities(), fetchTicketCategories(), fetchCatalogUsage()]);
      setAmenities(a);
      setCategories(c);
      setUsage(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los catálogos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh('admin-catalog-settings', ['parking_amenities', 'ticket_categories'], () => void load());

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
        <strong>No se pudieron cargar los catálogos.</strong>
        <p style={{ marginTop: 4 }}>{error}</p>
      </Callout>
    );
  }
  if (loading) return <EmptyState icon="⏳" title="Cargando catálogos" description="Un momento." />;

  const usesOf = (catalog: CatalogName, code: string) => usage[`${catalog}:${code}`] ?? 0;
  const blockedIfUsed = (uses: number) => (uses > 0 ? 'Está en uso: desactivalo en vez de eliminarlo' : null);

  return (
    <div className="gg-stack" style={{ gap: 'var(--gg-s4)' }}>
      <Card
        title="Servicios de las cocheras"
        actions={
          <Button variant="primary" size="sm" disabled={busy} onClick={() => setEditingAmenity({ item: null })}>
            + Agregar servicio
          </Button>
        }
      >
        <div style={{ padding: 'var(--gg-s4)' }}>
          <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
            Lo que el propietario puede marcar al publicar y lo que ve el conductor en la ficha. Un servicio
            desactivado deja de ofrecerse, pero las cocheras que ya lo tienen lo siguen mostrando.
          </p>
          <SortableList
            items={amenities}
            busy={busy}
            render={(item) => (
              <>
                <div style={{ fontWeight: 600 }}>
                  <span aria-hidden style={{ marginRight: 6 }}>
                    {AMENITY_ICONS[item.icon]?.emoji ?? '•'}
                  </span>
                  {item.label}
                </div>
                <div style={{ color: 'var(--gg-text-soft)', fontSize: 'var(--gg-fs-sm)', marginTop: 2 }}>
                  En inglés: {item.labelEn ?? <em>sin traducción (se muestra en castellano)</em>}
                </div>
                <UsageLine uses={usesOf('amenities', item.code)} noun={['cochera', 'cocheras']} code={item.code} />
              </>
            )}
            onMove={(a, b) => void run(() => swapCatalogItems('amenities', a, b), 'Orden actualizado')}
            onToggle={(item, next) =>
              void run(() => updateAmenity(item.code, { isActive: next }), next ? 'Servicio activado' : 'Servicio desactivado')
            }
            onEdit={(item) => setEditingAmenity({ item })}
            onDelete={(item) => setToDelete({ catalog: 'amenities', code: item.code, label: item.label })}
            itemKey={(item) => item.code}
            deleteBlockedReason={(item) => blockedIfUsed(usesOf('amenities', item.code))}
          />
        </div>
      </Card>

      <Card
        title="Categorías de los tickets de soporte"
        actions={
          <Button variant="primary" size="sm" disabled={busy} onClick={() => setEditingCategory({ item: null })}>
            + Agregar categoría
          </Button>
        }
      >
        <div style={{ padding: 'var(--gg-s4)' }}>
          <p style={{ color: 'var(--gg-text-soft)', marginBottom: 'var(--gg-s3)' }}>
            Lo que elige el usuario al abrir un ticket. Cada categoría puede ser para el conductor, para el
            propietario o para los dos; siempre tiene que quedar al menos una activa para cada uno.
          </p>
          <SortableList
            items={categories}
            busy={busy}
            render={(item) => (
              <>
                <div style={{ fontWeight: 600 }}>{item.label}</div>
                <div className="gg-row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 'var(--gg-s2)' }}>
                  {item.forClient ? <Badge tone="info">Conductor</Badge> : null}
                  {item.forOwner ? <Badge tone="accent">Propietario</Badge> : null}
                </div>
                <UsageLine uses={usesOf('ticket_categories', item.code)} noun={['ticket', 'tickets']} code={item.code} />
              </>
            )}
            onMove={(a, b) => void run(() => swapCatalogItems('ticket_categories', a, b), 'Orden actualizado')}
            onToggle={(item, next) =>
              void run(
                () => updateTicketCategory(item.code, { isActive: next }),
                next ? 'Categoría activada' : 'Categoría desactivada'
              )
            }
            onEdit={(item) => setEditingCategory({ item })}
            onDelete={(item) => setToDelete({ catalog: 'ticket_categories', code: item.code, label: item.label })}
            itemKey={(item) => item.code}
            deleteBlockedReason={(item) => blockedIfUsed(usesOf('ticket_categories', item.code))}
          />
        </div>
      </Card>

      {editingAmenity ? (
        <AmenityDialog
          item={editingAmenity.item}
          busy={busy}
          onClose={() => setEditingAmenity(null)}
          onSave={async (input) => {
            const ok = await run(
              () => (editingAmenity.item ? updateAmenity(editingAmenity.item.code, input) : createAmenity(input, amenities)),
              editingAmenity.item ? 'Servicio actualizado' : 'Servicio agregado'
            );
            if (ok) setEditingAmenity(null);
          }}
        />
      ) : null}

      {editingCategory ? (
        <CategoryDialog
          item={editingCategory.item}
          busy={busy}
          onClose={() => setEditingCategory(null)}
          onSave={async (input) => {
            const ok = await run(
              () =>
                editingCategory.item
                  ? updateTicketCategory(editingCategory.item.code, input)
                  : createTicketCategory(input, categories),
              editingCategory.item ? 'Categoría actualizada' : 'Categoría agregada'
            );
            if (ok) setEditingCategory(null);
          }}
        />
      ) : null}

      <Modal
        open={toDelete !== null}
        title="Eliminar del catálogo"
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
                void run(() => deleteCatalogItem(target.catalog, target.code), 'Eliminado del catálogo');
              }}
            >
              Eliminar
            </Button>
          </>
        }
      >
        <p>
          ¿Eliminar <strong>«{toDelete?.label}»</strong>? Como nadie lo usa, se borra del todo. Si solo querés
          dejar de ofrecerlo por un tiempo, desactivalo en vez de eliminarlo.
        </p>
      </Modal>
    </div>
  );
}

function UsageLine({ uses, noun, code }: { uses: number; noun: [string, string]; code: string }) {
  return (
    <div style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)', marginTop: 4 }}>
      {uses === 0 ? 'Sin uso' : `En uso por ${uses} ${uses === 1 ? noun[0] : noun[1]}`} · código <code>{code}</code>
    </div>
  );
}

const labelError = (value: string) => {
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length < 2) return 'Mínimo 2 caracteres';
  if (text.length > 60) return 'Máximo 60 caracteres';
  return null;
};

function AmenityDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: AmenityItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: AmenityInput) => void;
}) {
  const [input, setInput] = useState<AmenityInput>(
    item
      ? { label: item.label, labelEn: item.labelEn ?? '', icon: item.icon, isActive: item.isActive }
      : { label: '', labelEn: '', icon: 'checkmark-circle', isActive: true }
  );
  const set = <K extends keyof AmenityInput>(key: K, value: AmenityInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const errLabel = labelError(input.label);
  const errEn = labelError(input.labelEn ?? '');
  const canSave = input.label.trim().length >= 2 && !errLabel && !errEn && !busy;

  return (
    <Modal
      open
      title={item ? 'Editar servicio' : 'Nuevo servicio'}
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
      <Field label="Nombre" error={errLabel}>
        <input
          className="gg-input"
          value={input.label}
          maxLength={60}
          placeholder="Ej.: Techado"
          onChange={(e) => set('label', e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Nombre en inglés (demo de Estados Unidos, opcional)" error={errEn}>
        <input
          className="gg-input"
          value={input.labelEn ?? ''}
          maxLength={60}
          placeholder="Ej.: Covered"
          onChange={(e) => set('labelEn', e.target.value)}
        />
      </Field>
      <Field label="Ícono">
        <div className="gg-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {AMENITY_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              title={AMENITY_ICONS[key].label}
              aria-label={AMENITY_ICONS[key].label}
              aria-pressed={input.icon === key}
              onClick={() => set('icon', key)}
              style={{
                width: 40,
                height: 40,
                fontSize: 20,
                borderRadius: 8,
                cursor: 'pointer',
                background: input.icon === key ? 'var(--gg-accent-soft, #e9f5c8)' : 'transparent',
                border: input.icon === key ? '2px solid var(--gg-accent, #8db600)' : '1px solid var(--gg-border)',
              }}
            >
              {AMENITY_ICONS[key].emoji}
            </button>
          ))}
        </div>
        <span style={{ color: 'var(--gg-text-faint)', fontSize: 'var(--gg-fs-sm)' }}>
          {AMENITY_ICONS[input.icon].label}. En la app se ve con el ícono equivalente.
        </span>
      </Field>
      <label className="gg-row" style={CHECK_ROW}>
        <input type="checkbox" checked={input.isActive} onChange={(e) => set('isActive', e.target.checked)} />
        <span>Activo: se ofrece al publicar</span>
      </label>
    </Modal>
  );
}

function CategoryDialog({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: TicketCategoryItem | null;
  busy: boolean;
  onClose: () => void;
  onSave: (input: TicketCategoryInput) => void;
}) {
  const [input, setInput] = useState<TicketCategoryInput>(
    item
      ? { label: item.label, forClient: item.forClient, forOwner: item.forOwner, isActive: item.isActive }
      : { label: '', forClient: true, forOwner: true, isActive: true }
  );
  const set = <K extends keyof TicketCategoryInput>(key: K, value: TicketCategoryInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const errLabel = labelError(input.label);
  const noRole = !input.forClient && !input.forOwner;
  const canSave = input.label.trim().length >= 2 && !errLabel && !noRole && !busy;

  return (
    <Modal
      open
      title={item ? 'Editar categoría' : 'Nueva categoría'}
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
      <Field label="Nombre" error={errLabel}>
        <input
          className="gg-input"
          value={input.label}
          maxLength={60}
          placeholder="Ej.: Problemas con la app"
          onChange={(e) => set('label', e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="¿Quién la puede elegir?" error={noRole ? 'Elegí al menos uno.' : null}>
        <div className="gg-stack" style={{ gap: 'var(--gg-s2)' }}>
          <label className="gg-row" style={CHECK_ROW}>
            <input type="checkbox" checked={input.forClient} onChange={(e) => set('forClient', e.target.checked)} />
            <span>Conductor</span>
          </label>
          <label className="gg-row" style={CHECK_ROW}>
            <input type="checkbox" checked={input.forOwner} onChange={(e) => set('forOwner', e.target.checked)} />
            <span>Propietario</span>
          </label>
        </div>
      </Field>
      <label className="gg-row" style={CHECK_ROW}>
        <input type="checkbox" checked={input.isActive} onChange={(e) => set('isActive', e.target.checked)} />
        <span>Activa: se puede elegir al abrir un ticket</span>
      </label>
    </Modal>
  );
}
