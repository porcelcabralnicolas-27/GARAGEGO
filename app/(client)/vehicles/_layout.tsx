import { Stack } from 'expo-router';

// Stack propio para esta sección: a diferencia de un Tabs.Screen, cada pantalla
// (index, create, [id]/edit) se monta de nuevo en cada visita, sin arrastrar
// estado de formulario de una visita anterior. Mismo criterio que parkings/_layout.tsx.
export default function ClientVehiclesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
