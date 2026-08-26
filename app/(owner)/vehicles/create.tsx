import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Screen } from '@/components/ui/Screen';
import { createVehicle, type VehicleInput } from '@/features/vehicle/api';
import { VehicleForm } from '@/features/vehicle/VehicleForm';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function CreateOwnerVehicleScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const handleSubmit = async (input: VehicleInput) => {
    if (!profile) return;
    const vehicle = await createVehicle(profile.id, input);
    router.replace({ pathname: '/(owner)/vehicles/[id]/edit', params: { id: vehicle.id } });
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <BackHeader href="/(owner)/vehicles" />

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 8 }]}>
          Agregar vehículo
        </Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 24 }]}>
          Completá los datos básicos. Después de guardar vas a poder agregar fotos.
        </Text>
        <VehicleForm submitLabel="Guardar vehículo" onSubmit={handleSubmit} />
      </ScrollView>
    </Screen>
  );
}
