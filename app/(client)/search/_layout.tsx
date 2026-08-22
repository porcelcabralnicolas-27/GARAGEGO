import { Stack } from 'expo-router';

// Stack propio para todo el flujo de búsqueda: index (filtros), list, parking/[id], booking/[parkingId].
// A diferencia de un Tabs.Screen, cada pantalla se monta de nuevo en cada visita,
// sin arrastrar estado (filtros, formularios) de una visita anterior.
export default function SearchLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
