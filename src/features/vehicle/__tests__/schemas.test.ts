import { isValidArgentinePlate, normalizePlate, vehicleSchema } from '../schemas';

const valid = { plate: 'ABC123', brand: 'Toyota', model: 'Corolla' };

describe('normalizePlate', () => {
  it('pasa a mayúsculas y saca espacios y guiones', () => {
    expect(normalizePlate(' ab-123 cd ')).toBe('AB123CD');
  });
});

describe('isValidArgentinePlate', () => {
  it('acepta el formato viejo y el Mercosur', () => {
    expect(isValidArgentinePlate('ABC123')).toBe(true);
    expect(isValidArgentinePlate('AB123CD')).toBe(true);
    expect(isValidArgentinePlate('ab 123 cd')).toBe(true);
  });

  it('rechaza formatos que no existen', () => {
    expect(isValidArgentinePlate('ABCD12')).toBe(false);
    expect(isValidArgentinePlate('1234ABC')).toBe(false);
    expect(isValidArgentinePlate('')).toBe(false);
  });
});

describe('vehicleSchema', () => {
  it('acepta un vehículo con patente, marca y modelo (el color es opcional)', () => {
    expect(vehicleSchema.safeParse(valid).success).toBe(true);
    expect(vehicleSchema.safeParse({ ...valid, color: 'Gris' }).success).toBe(true);
  });

  it('rechaza una patente inválida o vacía', () => {
    expect(vehicleSchema.safeParse({ ...valid, plate: 'NOPE' }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...valid, plate: '   ' }).success).toBe(false);
  });

  it('exige marca y modelo', () => {
    expect(vehicleSchema.safeParse({ plate: 'ABC123' }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...valid, brand: '' }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...valid, model: '   ' }).success).toBe(false);
  });

  it('limita el largo de marca, modelo y color', () => {
    expect(vehicleSchema.safeParse({ ...valid, brand: 'x'.repeat(41) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...valid, model: 'x'.repeat(41) }).success).toBe(false);
    expect(vehicleSchema.safeParse({ ...valid, color: 'x'.repeat(31) }).success).toBe(false);
  });
});
