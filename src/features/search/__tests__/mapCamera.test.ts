import { CALLOUT_ROOM, LOT_ZOOM, latitudeBelow, lotCamera, pinOffsetPx } from '../mapCamera';

describe('latitudeBelow', () => {
  it('sin desplazamiento devuelve la misma latitud', () => {
    expect(latitudeBelow(-34.6037, 17, 0)).toBeCloseTo(-34.6037, 9);
  });

  it('a zoom 17 en Buenos Aires, 100 px son unos 0,00088° (≈ 98 m) al sur', () => {
    // A esa latitud un píxel mide ≈ 0,98 m a zoom 17 (156543 · cos(lat) / 2^17).
    const shifted = latitudeBelow(-34.6037, 17, 100);
    expect(shifted).toBeLessThan(-34.6037);
    expect(-34.6037 - shifted).toBeCloseTo(0.000886, 4);
  });
});

describe('pinOffsetPx', () => {
  it('sin hoja la cochera queda en el centro (no se corre)', () => {
    expect(pinOffsetPx({ mapTop: 100, mapHeight: 600, visibleBottom: 700 })).toBe(0);
  });

  it('con hoja, la cochera va al medio de lo visible', () => {
    // Visible de 100 a 500: medio en 300; centro del mapa en 400 → se corre 100.
    expect(pinOffsetPx({ mapTop: 100, mapHeight: 600, visibleBottom: 500 })).toBe(100);
  });

  it('con poco lugar visible, deja espacio para el cartel encima', () => {
    // Visible de 100 a 240: el medio (170) no deja lugar al cartel; va a 100 + CALLOUT_ROOM.
    const offset = pinOffsetPx({ mapTop: 100, mapHeight: 600, visibleBottom: 240 });
    expect(offset).toBeCloseTo(400 - (100 + CALLOUT_ROOM), 6);
  });
});

describe('lotCamera', () => {
  it('se acerca a nivel de calle pero no aleja si ya estaba más cerca', () => {
    const layout = { mapTop: 0, mapHeight: 500, visibleBottom: 500 };
    expect(lotCamera({ latitude: -34.6, longitude: -58.4 }, 12, layout).zoom).toBe(LOT_ZOOM);
    expect(lotCamera({ latitude: -34.6, longitude: -58.4 }, 19, layout).zoom).toBe(19);
    expect(lotCamera({ latitude: -34.6, longitude: -58.4 }, 12, layout).center).toEqual({ latitude: -34.6, longitude: -58.4 });
  });
});
