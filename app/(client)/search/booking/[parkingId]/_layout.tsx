import { Stack } from 'expo-router';

// Stack propio para el flujo de reserva: index (fecha/hora/vehículo) → payment (método de
// pago) → result (éxito o error).
//
// La pantalla era un archivo plano `[parkingId].tsx`; pasa a carpeta con _layout siguiendo el
// mismo patrón que `search/parking/[id]/`, que es el que evita el bug de pantallas duplicadas
// que ya apareció antes en este proyecto.
export default function BookingFlowLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
