import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { deleteVehicle, getVehicleCoverImageUrls, getVehicleErrorMessage, listMyVehicles } from '@/features/vehicle/api';
import { MAX_VEHICLES, type Vehicle } from '@/features/vehicle/types';
import { VehicleListItem } from '@/features/vehicle/VehicleListItem';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerVehiclesScreen() {
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
      <BackHeader href="/(owner)/profile" />

      <View style={styles.header}>
        <Text style={[typography.displayLarge, { color: colors.onBackground }]}>Mis vehículos</Text>
        {vehicles.length < MAX_VEHICLES ? (
          <Pressable onPress={() => router.push('/(owner)/vehicles/create')} hitSlop={8}>
            <Ionicons name="add-circle" size={32} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && vehicles.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Todavía no cargaste ningún vehículo. Tocá el + para agregar el primero.
        </Text>
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
            onEdit={() => router.push({ pathname: '/(owner)/vehicles/[id]/edit', params: { id: item.id } })}
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
});
