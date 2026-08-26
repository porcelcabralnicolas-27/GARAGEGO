import { Stack } from 'expo-router';

// Stack propio para el detalle del estacionamiento: index (info) y route (cómo llegar).
export default function ParkingDetailLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
