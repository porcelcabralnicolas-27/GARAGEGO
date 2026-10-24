import { useMemo, useState, type ReactNode } from 'react';

import { EmptyState } from './primitives';

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** `num` alinea a la derecha y usa tipografía monoespaciada tabular. */
  align?: 'left' | 'right' | 'num';
  width?: number | string;
  /** Valor por el que ordenar cuando se hace click en el encabezado. Sin esto, no es ordenable. */
  sortValue?: (row: T) => number | string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Orden inicial: clave de columna + dirección. */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
};

/**
 * Tabla del backoffice. Ordenamiento en cliente sobre `sortValue`, sin paginado: los volúmenes
 * del panel (decenas a pocos cientos de filas) no lo justifican, y el scroll continuo es más
 * rápido de barrer visualmente que paginar.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  emptyTitle = 'Sin resultados',
  emptyDescription,
  defaultSort,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;

    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    );
  };

  if (rows.length === 0) {
    return (
      <div className="gg-table-wrap">
        <EmptyState icon="⌕" title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="gg-table-wrap">
      <table className="gg-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={col.sortValue ? 'is-sortable' : undefined}
                onClick={col.sortValue ? () => toggleSort(col.key) : undefined}
                aria-sort={
                  sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {col.header}
                {sort?.key === col.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={[
                  onRowClick ? 'is-clickable' : '',
                  selectedKey === key ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.align === 'num'
                        ? 'gg-td--num'
                        : col.align === 'right'
                          ? 'gg-td--right'
                          : undefined
                    }
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
