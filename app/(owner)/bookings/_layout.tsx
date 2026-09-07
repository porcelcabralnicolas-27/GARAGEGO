import { Stack } from 'expo-router';

// Stack propio de "Reservas recibidas": index (las activas) e history (finalizadas y
// canceladas). Mismo patrón que el lado del conductor.
export default function OwnerBookingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
