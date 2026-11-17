import { useEffect, useState } from 'react';

import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import { FALLBACK_CATALOG_LABELS, fetchCatalogLabels, type CatalogLabels } from './catalogsApi';

// Los nombres vigentes, para las funciones de formato que no son componentes (por ejemplo la línea
// "se agregó X" de la comparación de cambios). Los componentes usan el hook, que re-renderiza.
let current: CatalogLabels = FALLBACK_CATALOG_LABELS;

/** Nombre de un servicio; si el código ya no existe en el catálogo, el código tal cual. */
export function amenityLabel(code: string): string {
  return current.amenities.find((item) => item.code === code)?.label ?? code;
}

/** Nombre de una categoría de ticket; si el código ya no existe, el código tal cual. */
export function ticketCategoryLabel(code: string): string {
  return current.ticketCategories.find((item) => item.code === code)?.label ?? code;
}

/** Catálogos (0094) para Inventario y Soporte. Si la migración no está, las listas de antes. */
export function useCatalogLabels(): CatalogLabels {
  const [labels, setLabels] = useState<CatalogLabels>(current);

  const load = () => {
    void fetchCatalogLabels().then((next) => {
      current = next;
      setLabels(next);
    });
  };

  useEffect(load, []);
  useRealtimeRefresh('admin-catalog-labels', ['parking_amenities', 'ticket_categories'], load);

  return labels;
}
