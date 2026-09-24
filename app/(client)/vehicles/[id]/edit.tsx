import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deleteVehicle, getVehicle, getVehicleErrorMessage, updateVehicle, type VehicleInput } from '@/features/vehicle/api';
import { VehicleForm } from '@/features/vehicle/VehicleForm';
import { VehicleImageManager } from '@/features/vehicle/VehicleImageManager';
import type { Vehicle } from '@/features/vehicle/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function EditClientVehicleScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const { data: vehicle, isError } = useQuery({
    queryKey: queryKeys.vehicles.detail(id),
    queryFn: () => getVehicle(id),
  });

  const handleSubmit = async (input: VehicleInput) => {
    const updated = await updateVehicle(id, input);
    queryClient.setQueryData<Vehicle>(queryKeys.vehicles.detail(id), updated);
    // Ver el comentario en create.tsx: la lista de vehículos vive en la cache de React Query.
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteVehicle(id);
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      setIsConfirmingDelete(false);
      router.replace('/(client)/vehicles');
    } catch (error) {
      setErrorMessage(getVehicleErrorMessage(error));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  if (isError && !vehicle) {
    return (
      <Screen>
        <Banner message="No se pudo cargar el vehículo." />
      </Screen>
    );
  }

  if (!vehicle || !profile) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader title={vehicle.plate} backHref="/(client)/vehicles" />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        <VehicleImageManager ownerId={profile.id} vehicleId={vehicle.id} />

        <View style={styles.sectionSpacer} />

        <VehicleForm
          submitLabel="Guardar cambios"
          defaultValues={{
            plate: vehicle.plate,
            brand: vehicle.brand ?? '',
            model: vehicle.model ?? '',
            color: vehicle.color ?? '',
          }}
          onSubmit={handleSubmit}
        />

        <View style={styles.sectionSpacer} />

        <Button
          label="Eliminar vehículo"
          variant="text"
          onPress={() => setIsConfirmingDelete(true)}
          disabled={isDeleting}
        />
      </ScrollView>

      <ConfirmDialog
        visible={isConfirmingDelete}
        title="Eliminar vehículo"
        message="¿Seguro que querés eliminar este vehículo? Esta acción no se puede deshacer."
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
});
