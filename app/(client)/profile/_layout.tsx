import { Stack } from 'expo-router';

// Stack propio para esta sección: a diferencia de un Tabs.Screen, cada pantalla
// (index, settings) se monta de nuevo en cada visita, sin arrastrar estado vieja.
export default function ProfileLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
