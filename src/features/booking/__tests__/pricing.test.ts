import { computeBookingPrice } from '../pricing';

describe('computeBookingPrice', () => {
  it('cobra el precio por hora completo por una hora', () => {
    expect(computeBookingPrice(500, '10:00', '11:00')).toBe(500);
  });

  it('prorratea las medias horas', () => {
    expect(computeBookingPrice(500, '10:00', '11:30')).toBe(750);
  });

  it('redondea a dos decimales', () => {
    // 333.33 * 1.5 h = 499.995 → 500.00 (la billetera y la base usan numeric(10,2)).
    expect(computeBookingPrice(333.33, '10:00', '11:30')).toBe(500);
  });

  it('devuelve null si el fin no es posterior al inicio', () => {
    expect(computeBookingPrice(500, '11:00', '10:00')).toBeNull();
    expect(computeBookingPrice(500, '10:00', '10:00')).toBeNull();
  });

  it('devuelve null si falta alguno de los horarios', () => {
    expect(computeBookingPrice(500, '', '11:00')).toBeNull();
    expect(computeBookingPrice(500, '10:00', '')).toBeNull();
  });
});
