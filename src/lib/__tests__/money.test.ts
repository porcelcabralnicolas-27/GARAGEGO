import { formatMoney, formatMoneyInText, formatPricePerHour } from '../money';
import { setActiveRegion } from '../region';

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

// Textos de las notificaciones: los arma la base con `format('$%s', monto)`.
describe('formatMoneyInText', () => {
  it('formatea el monto crudo que deja PostgreSQL', () => {
    expect(normalize(formatMoneyInText('Se acreditaron $5000.00 a tu billetera con Mercado Pago.'))).toBe(
      'Se acreditaron $ 5.000,00 a tu billetera con Mercado Pago.'
    );
  });

  it('respeta el punto final de la oración y los montos sin decimales', () => {
    expect(normalize(formatMoneyInText('Se debitaron $2477.5.'))).toBe('Se debitaron $ 2.477,50.');
    expect(normalize(formatMoneyInText('Recibiste una reserva por $1750'))).toBe('Recibiste una reserva por $ 1.750,00');
  });

  it('formatea varios montos en el mismo texto', () => {
    expect(normalize(formatMoneyInText('Pagaste $100.00 y te devolvimos $25.50'))).toBe(
      'Pagaste $ 100,00 y te devolvimos $ 25,50'
    );
  });

  it('no toca lo que ya está formateado ni el texto sin montos', () => {
    expect(formatMoneyInText('Total: $ 5.000,00')).toBe('Total: $ 5.000,00');
    expect(formatMoneyInText('Total: $5.000,00')).toBe('Total: $5.000,00');
    expect(formatMoneyInText('Te estoy esperando')).toBe('Te estoy esperando');
  });

  it('en la demo de Estados Unidos lo muestra en dólares', () => {
    setActiveRegion('US');
    try {
      expect(formatMoneyInText('Se acreditaron $5000.00 a tu billetera.')).toBe('Se acreditaron US$ 5.00 a tu billetera.');
    } finally {
      setActiveRegion('AR');
    }
  });
});

// Demo de presentación regional (0086): los montos llegan en pesos y se muestran en dólares con el
// tipo de cambio fijo (US$ 1 = $1.000).
describe('formato en la demo de Estados Unidos', () => {
  beforeEach(() => setActiveRegion('US'));
  afterEach(() => setActiveRegion('AR'));

  it('convierte los pesos a dólares con dos decimales', () => {
    expect(formatMoney(5000)).toBe('US$ 5.00');
    expect(formatMoney(18500)).toBe('US$ 18.50');
    expect(formatMoney(1234567)).toBe('US$ 1,234.57');
  });

  it('pone el signo antes del símbolo en los débitos', () => {
    expect(formatMoney(-2500)).toBe('-US$ 2.50');
  });

  it('el precio por hora va en inglés', () => {
    expect(formatPricePerHour(25000)).toBe('US$ 25.00/hour');
  });

  it('volver a Argentina restituye los pesos', () => {
    setActiveRegion('AR');
    expect(normalize(formatMoney(5000))).toBe('$ 5.000,00');
  });
});
