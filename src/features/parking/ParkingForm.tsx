import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LocationPicker } from '@/features/parking/LocationPicker';
import { parkingLotSchema, type ParkingLotFormValues } from '@/features/parking/schemas';
import type { ParkingLotInput } from '@/features/parking/api';
import { useTheme } from '@/theme';

type ParkingFormProps = {
  defaultValues?: Partial<ParkingLotFormValues>;
  submitLabel: string;
  onSubmit: (input: ParkingLotInput) => Promise<void>;
};

export function ParkingForm({ defaultValues, submitLabel, onSubmit }: ParkingFormProps) {
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<ParkingLotFormValues>({
    resolver: zodResolver(parkingLotSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      address: defaultValues?.address ?? '',
      latitude: defaultValues?.latitude ?? '',
      longitude: defaultValues?.longitude ?? '',
      pricePerHour: defaultValues?.pricePerHour ?? '',
    },
  });

  const watchedLatitude = watch('latitude');
  const watchedLongitude = watch('longitude');
  const pickerLatitude = watchedLatitude && !Number.isNaN(Number(watchedLatitude)) ? Number(watchedLatitude) : null;
  const pickerLongitude = watchedLongitude && !Number.isNaN(Number(watchedLongitude)) ? Number(watchedLongitude) : null;

  const submit = async (values: ParkingLotFormValues) => {
    // Protección contra doble envío: un doble clic/tap muy rápido puede disparar
    // dos submits antes de que "isSubmitting" (estado, asíncrono) llegue a deshabilitar el botón.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setErrorMessage(null);
    try {
      await onSubmit({
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : null,
        address: values.address,
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        pricePerHour: Number(values.pricePerHour),
      });
    } catch {
      setErrorMessage('No pudimos guardar los cambios. Intenta nuevamente.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <View>
      {errorMessage ? <Banner message={errorMessage} /> : null}

      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField label="Nombre" value={field.value} onChangeText={field.onChange} errorMessage={fieldState.error?.message} />
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <TextField
            label="Descripción (opcional)"
            value={field.value}
            onChangeText={field.onChange}
            errorMessage={fieldState.error?.message}
            multiline
          />
        )}
      />

      <Controller
        control={control}
        name="address"
        render={({ field, fieldState }) => (
          <TextField label="Dirección" value={field.value} onChangeText={field.onChange} errorMessage={fieldState.error?.message} />
        )}
      />

      <LocationPicker
        latitude={pickerLatitude}
        longitude={pickerLongitude}
        onChange={(lat, lng) => {
          setValue('latitude', String(lat), { shouldValidate: true });
          setValue('longitude', String(lng), { shouldValidate: true });
        }}
        onAddressResolved={(address) => setValue('address', address, { shouldValidate: true })}
      />

      {pickerLatitude !== null && pickerLongitude !== null ? (
        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>
          Ubicación seleccionada: {pickerLatitude.toFixed(5)}, {pickerLongitude.toFixed(5)}
        </Text>
      ) : null}
      {errors.latitude || errors.longitude ? (
        <Banner message={errors.latitude?.message ?? errors.longitude?.message ?? 'Ubicación inválida'} />
      ) : null}

      <View style={styles.spacer} />

      <Controller
        control={control}
        name="pricePerHour"
        render={({ field, fieldState }) => (
          <TextField
            label="Precio por hora (USD)"
            keyboardType="decimal-pad"
            value={field.value}
            onChangeText={field.onChange}
            errorMessage={fieldState.error?.message}
          />
        )}
      />

      <View style={styles.spacer} />

      <Button label={submitLabel} onPress={handleSubmit(submit)} loading={isSubmitting} disabled={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: {
    height: 12,
  },
});
