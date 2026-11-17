import { listingChangesSince, type ApprovedSnapshot, type ListingCurrentState } from '../domain';

// La foto tiene la forma que arma `lot_review_snapshot` en SQL (0078) más lot_type (0089).
const snapshot: ApprovedSnapshot = {
  name: 'Cochera Centro',
  description: 'Techada',
  address: { address: 'Av. Corrientes 1000', lat: -34.6, lng: -58.38 },
  price: 1500,
  capacity: 1,
  amenities: ['cameras', 'lighting'],
  photos: ['u/l/a.jpg', 'u/l/b.jpg'],
  lot_type: 'house',
};

const unchanged: ListingCurrentState = {
  name: 'Cochera Centro ',
  description: 'Techada',
  address: 'Av. Corrientes 1000',
  latitude: -34.6,
  longitude: -58.38,
  pricePerHour: 1500,
  capacity: 1,
  amenities: ['lighting', 'cameras'],
  lotType: 'house',
  photoPaths: ['u/l/b.jpg', 'u/l/a.jpg'],
};

describe('listingChangesSince', () => {
  it('sin cambios (espacios sobrantes y orden distinto no cuentan)', () => {
    expect(listingChangesSince(snapshot, unchanged)).toEqual([]);
  });

  it('detecta cada campo cambiado', () => {
    const changes = listingChangesSince(snapshot, {
      ...unchanged,
      name: 'Cochera Centro 2',
      address: 'Av. Corrientes 2000',
      latitude: -34.61,
      pricePerHour: 1800,
      amenities: ['cameras', 'ev_charger'],
      photoPaths: ['u/l/a.jpg', 'u/l/c.jpg', 'u/l/d.jpg'],
    });
    expect(changes).toEqual([
      { field: 'name', before: 'Cochera Centro', after: 'Cochera Centro 2' },
      { field: 'address', before: 'Av. Corrientes 1000', after: 'Av. Corrientes 2000' },
      { field: 'location', before: { lat: -34.6, lng: -58.38 }, after: { lat: -34.61, lng: -58.38 } },
      { field: 'price', before: 1500, after: 1800 },
      { field: 'amenities', added: ['ev_charger'], removed: ['lighting'] },
      { field: 'photos', added: 2, removed: 1 },
    ]);
  });

  it('descripción vacía y nula son lo mismo; el tipo de lugar cuenta', () => {
    const changes = listingChangesSince(
      { ...snapshot, description: '' },
      { ...unchanged, description: null, lotType: 'lot' }
    );
    expect(changes).toEqual([{ field: 'lot_type', before: 'house', after: 'lot' }]);
  });
});
