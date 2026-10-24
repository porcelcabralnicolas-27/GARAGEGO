import { formatMoney, formatPricePerHour } from '../money';

// Intl mete un espacio no separable ( ) entre el símbolo y el número: se normaliza para
// que los tests no dependan de ese detalle invisible.
function normalize(value: string): string {
  return value.replace(/ /g, ' ');
}

describe('formatMoney', () => {
  it('usa el formato argentino: punto para miles y coma para decimales', () => {
    expect(normalize(formatMoney(1234.5))).toBe('$ 1.234,50');
  });

  it('siempre muestra dos decimales', () => {
    expect(normalize(formatMoney(500))).toBe('$ 500,00');
  });

  it('formatea el cero', () => {
    expect(normalize(formatMoney(0))).toBe('$ 0,00');
  });

  it('formatea montos negativos (débitos de la billetera)', () => {
    expect(normalize(formatMoney(-1000))).toBe('-$ 1.000,00');
  });
});

describe('formatPricePerHour', () => {
  it('le agrega el sufijo por hora', () => {
    expect(normalize(formatPricePerHour(500))).toBe('$ 500,00/hora');
  });
});
