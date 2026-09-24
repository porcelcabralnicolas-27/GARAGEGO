import { appendNewest, flattenPages, newestFirst, olderThanFilter, toPage, type MessageCursor, type Page } from '../pagination';

type Msg = { id: string; createdAt: string };

function pages(...itemPages: Msg[][]) {
  return {
    pages: itemPages.map((items): Page<Msg, MessageCursor> => ({ items, nextCursor: null })),
    pageParams: itemPages.map(() => null),
  };
}

describe('toPage', () => {
  it('una página completa puede tener más: el cursor sale del último renglón', () => {
    const page = toPage([{ id: 'a' }, { id: 'b' }], 2, (last) => last.id);
    expect(page.nextCursor).toBe('b');
  });

  it('una página corta es la última', () => {
    expect(toPage([{ id: 'a' }], 2, (last) => last.id).nextCursor).toBeNull();
    expect(toPage([], 2, () => 'x').nextCursor).toBeNull();
  });
});

describe('flattenPages', () => {
  it('junta las páginas en orden', () => {
    expect(flattenPages(pages([{ id: 'a', createdAt: '1' }], [{ id: 'b', createdAt: '2' }])).map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
    expect(flattenPages(undefined)).toEqual([]);
  });
});

describe('chats', () => {
  // Página 0 = los más recientes; cada página, en orden cronológico.
  const data = pages(
    [
      { id: 'm3', createdAt: '3' },
      { id: 'm4', createdAt: '4' },
    ],
    [
      { id: 'm1', createdAt: '1' },
      { id: 'm2', createdAt: '2' },
    ]
  );

  it('newestFirst devuelve del más nuevo al más viejo, cruzando páginas', () => {
    expect(newestFirst(data).map((m) => m.id)).toEqual(['m4', 'm3', 'm2', 'm1']);
  });

  it('appendNewest agrega al final de la página más reciente', () => {
    const next = appendNewest(data, { id: 'm5', createdAt: '5' });
    expect(newestFirst(next).map((m) => m.id)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('appendNewest no duplica un mensaje que ya estaba (realtime + respuesta del envío)', () => {
    expect(appendNewest(data, { id: 'm1', createdAt: '1' })).toBe(data);
  });

  it('appendNewest sin datos cargados no inventa una página', () => {
    expect(appendNewest<Msg>(undefined, { id: 'm1', createdAt: '1' })).toBeUndefined();
  });
});

describe('olderThanFilter', () => {
  it('compara por (created_at, id) y deja el timestamp entre comillas', () => {
    expect(olderThanFilter({ createdAt: '2026-09-24T13:05:07.123456+00:00', id: 'abc' })).toBe(
      'created_at.lt."2026-09-24T13:05:07.123456+00:00",and(created_at.eq."2026-09-24T13:05:07.123456+00:00",id.lt.abc)'
    );
  });
});
