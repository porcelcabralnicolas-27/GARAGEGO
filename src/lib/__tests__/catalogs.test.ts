jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import {
  amenitiesOf,
  amenityOptions,
  DEFAULT_CATALOGS,
  parseCatalogs,
  ticketCategoriesFor,
  ticketCategoryName,
} from '@/lib/catalogs';

const raw = {
  amenities: [
    { code: 'cameras', label: 'Cámaras', label_en: 'Cameras', icon: 'videocam', is_active: false },
    { code: 'techado', label: 'Techado', label_en: null, icon: 'umbrella', is_active: true },
  ],
  ticket_categories: [
    { code: 'access', label: 'Acceso', for_client: true, for_owner: false, is_active: true },
    { code: 'app', label: 'La app', for_client: true, for_owner: true, is_active: true },
    { code: 'old', label: 'Vieja', for_client: true, for_owner: true, is_active: false },
  ],
};

describe('parseCatalogs', () => {
  it('toma los catálogos de public_catalogs', () => {
    const catalogs = parseCatalogs(raw);
    expect(catalogs.amenities.map((a) => a.code)).toEqual(['cameras', 'techado']);
    expect(catalogs.amenities[1]).toEqual({ code: 'techado', label: 'Techado', labelEn: null, icon: 'umbrella', isActive: true });
    expect(catalogs.ticketCategories).toHaveLength(3);
  });

  it('sin datos (migración sin correr) usa las listas de siempre', () => {
    expect(parseCatalogs(null)).toEqual(DEFAULT_CATALOGS);
    expect(parseCatalogs({ amenities: [], ticket_categories: [] })).toEqual(DEFAULT_CATALOGS);
    expect(DEFAULT_CATALOGS.amenities).toHaveLength(5);
  });
});

describe('ayudas', () => {
  const catalogs = parseCatalogs(raw);

  it('al publicar se ofrecen los activos y los que la cochera ya tenía', () => {
    expect(amenityOptions([], catalogs.amenities).map((a) => a.code)).toEqual(['techado']);
    expect(amenityOptions(['cameras'], catalogs.amenities).map((a) => a.code)).toEqual(['cameras', 'techado']);
  });

  it('la ficha muestra también un servicio que ya no está en el catálogo', () => {
    expect(amenitiesOf(['techado', 'borrado'], catalogs.amenities).map((a) => a.label)).toEqual(['Techado', 'borrado']);
  });

  it('cada rol ve solo sus categorías activas', () => {
    expect(ticketCategoriesFor('client', catalogs.ticketCategories).map((c) => c.code)).toEqual(['access', 'app']);
    expect(ticketCategoriesFor('owner', catalogs.ticketCategories).map((c) => c.code)).toEqual(['app']);
  });

  it('el nombre de una categoría desactivada o desconocida', () => {
    expect(ticketCategoryName('old', catalogs.ticketCategories)).toBe('Vieja');
    expect(ticketCategoryName('xyz', catalogs.ticketCategories)).toBe('xyz');
  });
});
