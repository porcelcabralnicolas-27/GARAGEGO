import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

const MAP_PREFIX = 'map';
const MAP_HREF = '/(client)' as const;

type MapParams = Record<string, string>;

/**
 * Valor del parámetro `from` para las pantallas a las que se llega desde el mapa de Inicio. Lleva
 * también los parámetros del mapa (punto de búsqueda, distancia, filtros, dirección buscada), porque
 * el mapa es una pestaña que se reinicia al navegar a ella sin parámetros: para volver exactamente al
 * mismo mapa hay que devolverle esos parámetros.
 */
export function mapOrigin(params: Record<string, string | string[] | undefined>): string {
  const kept: MapParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value !== '') kept[key] = value;
  }
  return Object.keys(kept).length > 0 ? `${MAP_PREFIX}:${JSON.stringify(kept)}` : MAP_PREFIX;
}

function parseMapOrigin(from: string | undefined): MapParams | null {
  if (!from || !from.startsWith(MAP_PREFIX)) return null;
  const json = from.slice(MAP_PREFIX.length + 1);
  if (!json) return {};
  try {
    return JSON.parse(json) as MapParams;
  } catch {
    return {};
  }
}

/**
 * Acción de "volver" que respeta de dónde viene la persona, en vez de ir siempre a una pantalla fija.
 *
 *  - Si se llegó desde el mapa de Inicio (`from` creado con `mapOrigin`) vuelve al mapa tal como
 *    estaba. El mapa es otra pestaña, así que "retroceder" solo no alcanza: retrocedería dentro de la
 *    pila de la búsqueda y mostraría la pantalla Buscar. Primero se saca esta pantalla de la pila y
 *    después se vuelve a la pestaña, con sus parámetros.
 *  - Si no, retrocede en el historial (de la lista de resultados a la lista, de la ficha a la ficha).
 *  - Sin historial —se entró directo por un enlace, o se recargó la página en la web— cae en `fallback`.
 */
export function useGoBack(fallback: Href, from?: string): () => void {
  const router = useRouter();

  return useCallback(() => {
    const mapParams = parseMapOrigin(from);
    if (mapParams) {
      if (router.canGoBack()) router.back();
      router.navigate({ pathname: MAP_HREF, params: mapParams });
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(fallback);
    }
    // `fallback` suele ser un objeto nuevo en cada render; el destino es el mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, from, JSON.stringify(fallback)]);
}
