import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { createVehicle, type VehicleInput } from '@/features/vehicle/api';
import { VehicleForm } from '@/features/vehicle/VehicleForm';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function CreateClientVehicleScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const handleSubmit = async (input: VehicleInput) => {
    if (!profile) return;
    const vehicle = await createVehicle(profile.id, input);
    // La lista de "Mis vehículos" usa React Query: sin esto, al volver seguiría mostrando la
    // lista vieja hasta que se venza el staleTime.
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    router.replace({ pathname: '/(client)/vehicles/[id]/edit', params: { id: vehicle.id } });
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Agregar vehículo" backHref="/(client)/vehicles" />
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 24 }]}>
          Completá los datos básicos. Después de guardar vas a poder agregar fotos.
        </Text>
        <VehicleForm submitLabel="Guardar vehículo" onSubmit={handleSubmit} />
      </ScrollView>
    </Screen>
  );
}
