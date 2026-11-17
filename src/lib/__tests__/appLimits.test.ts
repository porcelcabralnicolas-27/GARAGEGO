jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

import { ratesSchemaFor } from '@/features/parking/schemas';
import { DEFAULT_APP_LIMITS, parseAppLimits } from '@/lib/appLimits';

describe('parseAppLimits', () => {
  it('toma los valores de public_settings', () => {
    const limits = parseAppLimits({
      max_parking_images: 5,
      max_vehicles_per_region: 4,
      parking_capacity_min: 2,
      parking_capacity_max: 80,
      wallet_max_balance: 300000,
      topup_min: 500,
      topup_max: 60000,
      topup_quick_amounts: [20000, 5000],
    });
    expect(limits).toEqual({
      maxParkingImages: 5,
      maxVehiclesPerRegion: 4,
      capacityMin: 2,
      capacityMax: 80,
      walletMaxBalance: 300000,
      topupMin: 500,
      topupMax: 60000,
      topupQuickAmounts: [5000, 20000],
    });
  });

  it('sin datos (migración sin correr) usa los de siempre', () => {
    expect(parseAppLimits(null)).toEqual(DEFAULT_APP_LIMITS);
    expect(parseAppLimits({})).toEqual(DEFAULT_APP_LIMITS);
  });

  it('un valor raro cae a su default sin tocar los demás', () => {
    const limits = parseAppLimits({ max_parking_images: 'diez', max_vehicles_per_region: 2.5, topup_quick_amounts: [] });
    expect(limits.maxParkingImages).toBe(3);
    expect(limits.maxVehiclesPerRegion).toBe(3);
    expect(limits.topupQuickAmounts).toEqual(DEFAULT_APP_LIMITS.topupQuickAmounts);
  });

  it('un rango invertido vuelve al de siempre', () => {
    const limits = parseAppLimits({ parking_capacity_min: 30, parking_capacity_max: 10 });
    expect([limits.capacityMin, limits.capacityMax]).toEqual([1, 50]);
  });
});

describe('ratesSchemaFor', () => {
  const base = { lotType: 'lot' as const, pricePerHour: '1000', amenities: [] };

  it('respeta el rango configurado', () => {
    const schema = ratesSchemaFor({ min: 2, max: 10 });
    expect(schema.safeParse({ ...base, capacity: 10 }).success).toBe(true);
    const tooMany = schema.safeParse({ ...base, capacity: 11 });
    expect(tooMany.success).toBe(false);
    expect(tooMany.error?.issues[0].message).toBe('La capacidad máxima es 10');
    expect(schema.safeParse({ ...base, capacity: 1 }).error?.issues[0].message).toBe('La capacidad mínima es 2');
  });

  it('al editar, acepta la capacidad que ya tenía aunque haya quedado fuera del rango', () => {
    const schema = ratesSchemaFor({ min: 1, max: 10 }, 30);
    expect(schema.safeParse({ ...base, capacity: 30 }).success).toBe(true);
    expect(schema.safeParse({ ...base, capacity: 29 }).success).toBe(false);
  });
});
