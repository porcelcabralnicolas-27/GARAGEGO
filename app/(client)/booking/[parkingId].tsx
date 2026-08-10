import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { PlaceholderText } from '@/components/ui/PlaceholderText';

export default function BookingScreen() {
  const { parkingId } = useLocalSearchParams<{ parkingId: string }>();

  return (
    <Screen>
      <PlaceholderText title="Reservar" subtitle={`Estacionamiento: ${parkingId} — Fase 6`} />
    </Screen>
  );
}
