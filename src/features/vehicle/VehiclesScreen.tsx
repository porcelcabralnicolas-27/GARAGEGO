import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FlatList, Text, View } from 'react-native';

import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

import { createVehicle, deleteVehicle, getVehicleErrorMessage, listMyVehicles } from './api';
import { vehicleSchema, type VehicleFormValues } from './schemas';
import { MAX_VEHICLES, type Vehicle } from './types';
import { VehicleListItem } from './VehicleListItem';

const EMPTY_FORM: VehicleFormValues = { plate: '', brand: '', model: '', color: '' };

export function VehiclesScreen({ backHref }: { backHref: Href }) {
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<VehicleFormValues>({ resolver: zodResolver(vehicleSchema), defaultValues: EMPTY_FORM });

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listMyVehicles(profile.id)
      .then(setVehicles)
      .catch(() => setErrorMessage('No se pudieron cargar tus vehículos.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const startAdding = () => {
    reset(EMPTY_FORM);
    setErrorMessage(null);
    setIsAdding(true);
  };

  const onSubmit = async (values: VehicleFormValues) => {
    if (!profile) return;
    setErrorMessage(null);
    try {
      await createVehicle(profile.id, {
        plate: values.plate.toUpperCase(),
        brand: values.brand?.trim() ? values.brand.trim() : null,
        model: values.model?.trim() ? values.model.trim() : null,
        color: values.color?.trim() ? values.color.trim() : null,
      });
      setIsAdding(false);
      load();
    } catch (error) {
      setErrorMessage(getVehicleErrorMessage(error));
    }
  };

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
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <VehicleListItem vehicle={item} onDelete={() => setDeleteTarget(item)} />}
        ListHeaderComponent={
          <>
            <BackHeader href={backHref} />
            <Text style={[typography.displayLarge, { color: colors.onBackground, marginBottom: 4 }]}>
              Mis vehículos
            </Text>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 16 }]}>
              Hasta {MAX_VEHICLES} vehículos. Vas a elegir uno al hacer una reserva.
            </Text>
            {errorMessage ? <Banner message={errorMessage} /> : null}
            {!isLoading && vehicles.length === 0 && !isAdding ? (
              <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 16 }]}>
                Todavía no cargaste ningún vehículo.
              </Text>
            ) : null}
          </>
        }
        ListFooterComponent={
          isAdding ? (
            <View style={{ marginTop: 8 }}>
              <Controller
                control={control}
                name="plate"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Patente"
                    autoCapitalize="characters"
                    value={field.value}
                    onChangeText={field.onChange}
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="brand"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Marca (opcional)"
                    value={field.value}
                    onChangeText={field.onChange}
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="model"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Modelo (opcional)"
                    value={field.value}
                    onChangeText={field.onChange}
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="color"
                render={({ field, fieldState }) => (
                  <TextField
                    label="Color (opcional)"
                    value={field.value}
                    onChangeText={field.onChange}
                    errorMessage={fieldState.error?.message}
                  />
                )}
              />

              <Button
                label="Guardar vehículo"
                onPress={handleSubmit(onSubmit)}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
              <View style={{ height: 12 }} />
              <Button label="Cancelar" variant="text" onPress={() => setIsAdding(false)} disabled={isSubmitting} />
            </View>
          ) : vehicles.length < MAX_VEHICLES ? (
            <Button label="+ Agregar vehículo" variant="outlined" onPress={startAdding} />
          ) : (
            <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>
              Llegaste al máximo de {MAX_VEHICLES} vehículos.
            </Text>
          )
        }
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
