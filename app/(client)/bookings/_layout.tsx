import { Stack } from 'expo-router';

// Stack propio de "Mis reservas": index (la lista) y [id] (la sesión: por iniciar, en curso o
// finalizada). Antes `bookings/index` colgaba directo del Tabs; con el detalle nuevo hace falta
// un Stack para poder apilar la pantalla sobre la lista sin que aparezca como otra pestaña.
export default function BookingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
