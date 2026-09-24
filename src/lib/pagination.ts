import type { InfiniteData } from '@tanstack/react-query';

/**
 * Una página de un listado paginado por cursor (keyset). `nextCursor` son los valores del último
 * renglón, que el servidor usa para seguir desde ahí; null cuando no hay más.
 *
 * Con useInfiniteQuery: `initialPageParam: null` y `getNextPageParam: (page) => page.nextCursor`.
 */
export type Page<T, C> = { items: T[]; nextCursor: C | null };

/** Si la página vino completa puede haber más; si vino corta, era la última. */
export function toPage<T, C>(items: T[], pageSize: number, cursorOf: (last: T) => C): Page<T, C> {
  return { items, nextCursor: items.length === pageSize ? cursorOf(items[items.length - 1]) : null };
}

/** Cursor de los chats (mensajes de reservas y de tickets): el mensaje más viejo ya cargado. */
export type MessageCursor = { createdAt: string; id: string };

/**
 * Filtro de PostgREST (para `.or()`) de "más viejo que el cursor" en orden (created_at, id)
 * descendente. El desempate por id evita saltearse mensajes con el mismo created_at. Los valores
 * van entre comillas porque el timestamp tiene caracteres que PostgREST usa como separadores.
 */
export function olderThanFilter(cursor: MessageCursor): string {
  return `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`;
}

/** Todas las filas de las páginas cargadas, en orden. */
export function flattenPages<T>(data: { pages: { items: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

// ── Chats ────────────────────────────────────────────────────────────────────────────────────
// Los chats se paginan hacia atrás: la página 0 son los mensajes más recientes y cada página
// siguiente, otros más viejos. Dentro de cada página, los mensajes van en orden cronológico.

type MessagePages<T> = InfiniteData<Page<T, MessageCursor>, MessageCursor | null>;

/** Agrega un mensaje recién llegado (realtime o enviado) a la página más reciente, sin duplicarlo. */
export function appendNewest<T extends { id: string }>(data: MessagePages<T> | undefined, item: T): MessagePages<T> | undefined {
  if (!data || data.pages.some((page) => page.items.some((existing) => existing.id === item.id))) return data;
  return {
    ...data,
    pages: data.pages.map((page, index) => (index === 0 ? { ...page, items: [...page.items, item] } : page)),
  };
}

/** Los mensajes cargados, del más nuevo al más viejo: el orden de una FlatList `inverted`. */
export function newestFirst<T>(data: { pages: { items: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((page) => [...page.items].reverse()) ?? [];
}
