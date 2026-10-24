import { sanitizeErrorMessage } from '../errorMessages';

const FALLBACK = 'Ocurrió un error inesperado. Intenta nuevamente.';

describe('sanitizeErrorMessage', () => {
  it('deja pasar los mensajes que escribimos nosotros', () => {
    expect(sanitizeErrorMessage('No autorizado', FALLBACK)).toBe('No autorizado');
    expect(sanitizeErrorMessage('Reserva no encontrada', FALLBACK)).toBe('Reserva no encontrada');
    expect(sanitizeErrorMessage('booking_not_started', FALLBACK)).toBe('booking_not_started');
  });

  it.each([
    'new row for relation "bookings" violates check constraint "bookings_status_check"',
    'duplicate key value violates unique constraint "ratings_booking_id_key"',
    'permission denied for table bookings',
    'invalid input syntax for type uuid: "abc"',
    'column "archived_at" does not exist',
    'JSON object requested, multiple (or no) rows returned (PGRST116)',
  ])('reemplaza el mensaje interno de Postgres: %s', (message) => {
    expect(sanitizeErrorMessage(message, FALLBACK)).toBe(FALLBACK);
  });

  it('no filtra nombres de tabla ni de constraint al usuario', () => {
    const result = sanitizeErrorMessage(
      'new row for relation "wallets" violates check constraint "wallets_balance_check"',
      FALLBACK
    );
    expect(result).not.toContain('wallets');
    expect(result).not.toContain('constraint');
  });
});
