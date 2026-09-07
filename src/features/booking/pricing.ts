// Precio de una reserva a partir del precio por hora del estacionamiento.
//
// Vive acá y no dentro de una pantalla porque lo usan las dos etapas del flujo: el formulario
// (para el "Total estimado") y la pantalla de pago (para el monto que se cobra). El precio real
// lo calcula igual `create_booking` en el servidor; esto es solo lo que se le muestra al usuario.

/** Total de la reserva, o `null` si el rango horario no es válido. */
export function computeBookingPrice(
  pricePerHour: number,
  startTime: string,
  endTime: string
): number | null {
  if (!startTime || !endTime) return null;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const hours = (endH * 60 + endM - (startH * 60 + startM)) / 60;
  if (hours <= 0) return null;
  return Math.round(pricePerHour * hours * 100) / 100;
}
