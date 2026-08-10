import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { PlaceholderText } from '@/components/ui/PlaceholderText';

export default function ParkingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <PlaceholderText title="Detalle del estacionamiento" subtitle={`ID: ${id} — Fase 5`} />
    </Screen>
  );
}
