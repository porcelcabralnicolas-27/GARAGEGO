import { isValidArgentinePlate, normalizePlate, vehicleSchema } from '../schemas';

describe('normalizePlate', () => {
  it('pasa a mayúsculas y saca espacios y guiones', () => {
    expect(normalizePlate(' ab 123-cd ')).toBe('AB123CD');
  });
});

describe('isValidArgentinePlate', () => {
  it('acepta el formato viejo (ABC123)', () => {
    expect(isValidArgentinePlate('ABC123')).toBe(true);
    expect(isValidArgentinePlate('abc123')).toBe(true);
  });

  it('acepta el formato Mercosur (AB123CD)', () => {
    expect(isValidArgentinePlate('AB123CD')).toBe(true);
    expect(isValidArgentinePlate('ab 123 cd')).toBe(true);
  });

  it('rechaza formatos que no son ninguno de los dos', () => {
    expect(isValidArgentinePlate('AB123')).toBe(false);
    expect(isValidArgentinePlate('ABCD123')).toBe(false);
    expect(isValidArgentinePlate('123ABC')).toBe(false);
    expect(isValidArgentinePlate('')).toBe(false);
  });
});

describe('vehicleSchema', () => {
  it('acepta un vehículo con solo la patente', () => {
    expect(vehicleSchema.safeParse({ plate: 'ABC123' }).success).toBe(true);
  });

  it('rechaza una patente inválida', () => {
    const result = vehicleSchema.safeParse({ plate: 'NOPE' });
    expect(result.success).toBe(false);
  });

  it('rechaza la patente vacía', () => {
    expect(vehicleSchema.safeParse({ plate: '   ' }).success).toBe(false);
  });

  it('limita el largo de marca, modelo y color', () => {
    expect(vehicleSchema.safeParse({ plate: 'ABC123', brand: 'x'.repeat(41) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ plate: 'ABC123', color: 'x'.repeat(31) }).success).toBe(false);
  });
});
