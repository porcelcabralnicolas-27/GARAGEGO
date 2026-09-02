import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deleteVehicle, getVehicleCoverImageUrls, getVehicleErrorMessage, listMyVehicles } from '@/features/vehicle/api';
import { MAX_VEHICLES, type Vehicle } from '@/features/vehicle/types';
import { VehicleListItem } from '@/features/vehicle/VehicleListItem';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function ClientVehiclesScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [coverImages, setCoverImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listMyVehicles(profile.id)
      .then(async (data) => {
        setVehicles(data);
        setCoverImages(await getVehicleCoverImageUrls(data.map((v) => v.id)));
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus vehículos.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteVehicle(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (error) {
      setErrorMessage(getVehicleErrorMessage(error));
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Mis vehículos"
        backHref="/(client)/profile"
        action={
          vehicles.length < MAX_VEHICLES ? (
            <Pressable
              onPress={() => router.push('/(client)/vehicles/create')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Agregar vehículo"
            >
              <Ionicons name="add-circle" size={32} color={colors.accent} />
            </Pressable>
          ) : null
        }
      />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && vehicles.length === 0 && !errorMessage ? (
        <EmptyState
          icon="car-outline"
          title="Todavía no cargaste ningún vehículo"
          description={`Podés tener hasta ${MAX_VEHICLES}. Vas a elegir uno al hacer una reserva.`}
          actionLabel="Agregar vehículo"
          onAction={() => router.push('/(client)/vehicles/create')}
        />
      ) : null}

      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <VehicleListItem
            vehicle={item}
            imageUrl={coverImages[item.id]}
            onEdit={() => router.push({ pathname: '/(client)/vehicles/[id]/edit', params: { id: item.id } })}
            onDelete={() => setDeleteTarget(item)}
          />
        )}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Eliminar vehículo"
        message={`¿Seguro que querés eliminar ${deleteTarget?.plate ?? 'este vehículo'}?`}
        confirmLabel="Eliminar"
        cancelLabel="Volver"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}
