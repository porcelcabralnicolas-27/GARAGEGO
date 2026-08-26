import { useRouter } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Screen } from '@/components/ui/Screen';
import { createParkingLot, type ParkingLotInput } from '@/features/parking/api';
import { ParkingForm } from '@/features/parking/ParkingForm';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function CreateParkingScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const handleSubmit = async (input: ParkingLotInput) => {
    if (!profile) return;
    const lot = await createParkingLot(profile.id, input);
    router.replace({ pathname: '/(owner)/parkings/[id]/edit', params: { id: lot.id } });
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <BackHeader href="/(owner)/parkings" />

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 8 }]}>
          Publicar estacionamiento
        </Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 24 }]}>
          Completa los datos básicos. Después de guardar podrás agregar fotos y disponibilidad.
        </Text>
        <ParkingForm submitLabel="Crear publicación" onSubmit={handleSubmit} />
      </ScrollView>
    </Screen>
  );
}
