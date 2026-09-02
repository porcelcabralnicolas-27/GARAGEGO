import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { getParkingLot } from '@/features/parking/api';
import { ParkingListingWizard } from '@/features/parking/ParkingListingWizard';
import type { ParkingLot } from '@/features/parking/types';
import { useTheme } from '@/theme';

export default function EditParkingScreen() {
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getParkingLot(id)
      .then(setLot)
      .catch(() => setErrorMessage('No se pudo cargar la publicación.'));
  }, [id]);

  if (errorMessage) {
    return (
      <Screen>
        <Banner message={errorMessage} />
      </Screen>
    );
  }

  if (!lot) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return <ParkingListingWizard mode="edit" lot={lot} />;
}
