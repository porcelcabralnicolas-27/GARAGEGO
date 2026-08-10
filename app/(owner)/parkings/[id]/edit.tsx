import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/ui/Screen';
import { PlaceholderText } from '@/components/ui/PlaceholderText';

export default function EditParkingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <Screen>
      <PlaceholderText title="Editar publicación" subtitle={`ID: ${id} — Fase 4`} />
    </Screen>
  );
}
