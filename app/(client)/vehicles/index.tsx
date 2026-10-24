import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deleteVehicle, getVehicleCoverImageUrls, getVehicleErrorMessage, listMyVehicles } from '@/features/vehicle/api';
import { MAX_VEHICLES, type Vehicle } from '@/features/vehicle/types';
import { VehicleListItem } from '@/features/vehicle/VehicleListItem';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function ClientVehiclesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const userId = profile?.id;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);

  const {
    data: vehicles = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.vehicles.list(userId ?? ''),
    queryFn: () => listMyVehicles(userId as string),
    enabled: Boolean(userId),
  });

  // Las fotos van en su propia query, con la lista de ids como parte de la clave: así no se
  // vuelven a pedir mientras los vehículos sean los mismos, y se refrescan solas cuando cambian
  // (por ejemplo, al borrar uno).
  const vehicleIds = vehicles.map((v) => v.id);
  const { data: coverImages = {} } = useQuery({
    queryKey: queryKeys.vehicles.images(vehicleIds),
    queryFn: () => getVehicleCoverImageUrls(vehicleIds),
    enabled: vehicleIds.length > 0,
  });

  const remove = useMutation({
    mutationFn: (vehicle: Vehicle) => deleteVehicle(vehicle.id),
    onSuccess: () => {
      setDeleteTarget(null);
      // Invalidar el grupo entero (lista + fotos) en vez de cada clave: el borrado cambia las
      // dos cosas, y la clave de las fotos depende de los ids que quedaron.
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
    onError: (error) => {
      setErrorMessage(getVehicleErrorMessage(error));
      setDeleteTarget(null);
    },
  });

  const visibleError = errorMessage ?? (isError ? 'No se pudieron cargar tus vehículos.' : null);

  return (
    <Screen>
      <ScreenHeader
        title="Mis vehículos"
        backHref="/(client)/profile/settings"
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

      {visibleError ? <Banner message={visibleError} /> : null}

      {!isLoading && vehicles.length === 0 && !visibleError ? (
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
        onRefresh={() => {
          setErrorMessage(null);
          refetch();
        }}
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
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          setErrorMessage(null);
          remove.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}
