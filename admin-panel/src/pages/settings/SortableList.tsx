import type { ReactNode } from 'react';

import { Badge, Button, EmptyState, Toggle } from '../../ui/primitives';

/**
 * Lista editable de Configuración (Catálogos, Moderación): ↑/↓ para ordenar, interruptor de activo,
 * Editar y Eliminar. `deleteBlockedReason` deshabilita Eliminar con ese motivo (por ejemplo, "está en
 * uso").
 */
export function SortableList<T extends { label: string; isActive: boolean }>({
  items,
  busy,
  itemKey,
  render,
  onMove,
  onToggle,
  onEdit,
  onDelete,
  deleteBlockedReason,
}: {
  items: T[];
  busy: boolean;
  itemKey: (item: T) => string;
  render: (item: T) => ReactNode;
  onMove: (a: T, b: T) => void;
  onToggle: (item: T, next: boolean) => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  deleteBlockedReason?: (item: T) => string | null;
}) {
  if (items.length === 0) {
    return <EmptyState icon="🗂" title="No hay ítems" description="Agregá el primero." />;
  }
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item, index) => {
        const blocked = deleteBlockedReason?.(item) ?? null;
        return (
          <li
            key={itemKey(item)}
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
                onClick={() => onMove(item, items[index - 1])}
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Bajar "${item.label}"`}
                disabled={busy || index === items.length - 1}
                onClick={() => onMove(item, items[index + 1])}
              >
                ↓
              </Button>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {render(item)}
              {item.isActive ? null : (
                <div style={{ marginTop: 4 }}>
                  <Badge tone="warn">Desactivado</Badge>
                </div>
              )}
            </div>
            <div className="gg-row" style={{ gap: 'var(--gg-s2)', alignItems: 'center' }}>
              <Toggle
                checked={item.isActive}
                disabled={busy}
                label={item.isActive ? `Desactivar "${item.label}"` : `Activar "${item.label}"`}
                onChange={(next) => onToggle(item, next)}
              />
              <Button size="sm" disabled={busy} onClick={() => onEdit(item)}>
                Editar
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy || blocked !== null}
                title={blocked ?? undefined}
                onClick={() => onDelete(item)}
              >
                Eliminar
              </Button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
