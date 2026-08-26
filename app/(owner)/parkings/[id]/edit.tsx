import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { BackHeader } from '@/components/ui/BackHeader';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { AvailabilityEditor } from '@/features/parking/AvailabilityEditor';
import {
  deleteParkingLot,
  getParkingLot,
  setParkingLotActive,
  updateParkingLot,
  type ParkingLotInput,
} from '@/features/parking/api';
import { ImageManager } from '@/features/parking/ImageManager';
import { ParkingForm } from '@/features/parking/ParkingForm';
import type { ParkingLot } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function EditParkingScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAuthStore((s) => s.profile);

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [isConfirmingToggleActive, setIsConfirmingToggleActive] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    getParkingLot(id).then(setLot).catch(() => setErrorMessage('No se pudo cargar la publicación.'));
  }, [id]);

  const handleSubmit = async (input: ParkingLotInput) => {
    const updated = await updateParkingLot(id, input);
    setLot(updated);
  };

  const handleConfirmToggleActive = async () => {
    if (!lot) return;
    setIsTogglingActive(true);
    try {
      await setParkingLotActive(lot.id, !lot.isActive);
      setLot({ ...lot, isActive: !lot.isActive });
      setIsConfirmingToggleActive(false);
    } catch {
      setErrorMessage('No se pudo cambiar el estado de la publicación.');
      setIsConfirmingToggleActive(false);
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteParkingLot(id);
      setIsConfirmingDelete(false);
      router.replace('/(owner)/parkings');
    } catch {
      setErrorMessage('No se pudo eliminar la publicación.');
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  if (errorMessage && !lot) {
    return (
      <Screen>
        <Banner message={errorMessage} />
      </Screen>
    );
  }

  if (!lot || !profile) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <BackHeader href="/(owner)/parkings" />

        <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 16 }]}>{lot.name}</Text>

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <ImageManager ownerId={profile.id} parkingLotId={lot.id} />

        <View style={styles.sectionSpacer} />

        <ParkingForm
          submitLabel="Guardar cambios"
          defaultValues={{
            name: lot.name,
            description: lot.description ?? '',
            address: lot.address,
            latitude: String(lot.latitude),
            longitude: String(lot.longitude),
            pricePerHour: String(lot.pricePerHour),
          }}
          onSubmit={handleSubmit}
        />

        <View style={styles.sectionSpacer} />

        <AvailabilityEditor parkingLotId={lot.id} />

        <View style={styles.sectionSpacer} />

        <Button
          label={lot.isActive ? 'Desactivar publicación' : 'Activar publicación'}
          variant="outlined"
          onPress={() => setIsConfirmingToggleActive(true)}
          loading={isTogglingActive}
        />

        <View style={styles.spacer} />

        <Button
          label="Eliminar publicación"
          variant="text"
          onPress={() => setIsConfirmingDelete(true)}
          disabled={isDeleting}
        />
      </ScrollView>

      <ConfirmDialog
        visible={isConfirmingToggleActive}
        title={lot.isActive ? 'Desactivar publicación' : 'Activar publicación'}
        message={
          lot.isActive
            ? '¿Seguro que querés desactivar esta publicación? Deja de aparecer en las búsquedas y los clientes no van a poder reservar hasta que la vuelvas a activar.'
            : '¿Querés volver a activar esta publicación? Va a volver a aparecer en las búsquedas.'
        }
        confirmLabel={lot.isActive ? 'Desactivar' : 'Activar'}
        loading={isTogglingActive}
        onConfirm={handleConfirmToggleActive}
        onCancel={() => setIsConfirmingToggleActive(false)}
      />

      <ConfirmDialog
        visible={isConfirmingDelete}
        title="Eliminar publicación"
        message="¿Seguro que quieres eliminar este estacionamiento? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setIsConfirmingDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionSpacer: {
    height: 32,
  },
  spacer: {
    height: 12,
  },
});
