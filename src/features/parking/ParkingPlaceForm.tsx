import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { FormSection } from '@/components/ui/FormSection';
import { TextField } from '@/components/ui/TextField';
import { LocationPicker } from '@/features/parking/LocationPicker';
import { placeSchema, type PlaceFormValues } from '@/features/parking/schemas';
import { spacing, useTheme } from '@/theme';

/** Los datos del lugar ya convertidos para guardar. */
export type PlaceInput = {
  name: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
};

type ParkingPlaceFormProps = {
  defaultValues?: Partial<PlaceFormValues>;
  submitLabel: string;
  onSubmit: (input: PlaceInput) => Promise<void>;
};

// Paso 1 del asistente de publicación: nombre, descripción, dirección y ubicación en el mapa.
export function ParkingPlaceForm({ defaultValues, submitLabel, onSubmit }: ParkingPlaceFormProps) {
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<PlaceFormValues>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      description: defaultValues?.description ?? '',
      address: defaultValues?.address ?? '',
      latitude: defaultValues?.latitude ?? '',
      longitude: defaultValues?.longitude ?? '',
    },
  });

  const watchedLatitude = watch('latitude');
  const watchedLongitude = watch('longitude');
  const pickerLatitude = watchedLatitude && !Number.isNaN(Number(watchedLatitude)) ? Number(watchedLatitude) : null;
  const pickerLongitude = watchedLongitude && !Number.isNaN(Number(watchedLongitude)) ? Number(watchedLongitude) : null;

  const submit = async (values: PlaceFormValues) => {
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

      <FormSection title="Datos del lugar" description="Así lo van a ver los conductores en la búsqueda.">
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="NOMBRE"
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <TextField
              label="DESCRIPCIÓN (OPCIONAL)"
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
            <TextField
              label="DIRECCIÓN"
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Ubicación en el mapa"
        description="Movés el marcador al lugar exacto de la entrada."
      >
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
          <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.sm }]}>
            Ubicación seleccionada: {pickerLatitude.toFixed(5)}, {pickerLongitude.toFixed(5)}
          </Text>
        ) : null}
        {errors.latitude || errors.longitude ? (
          <Banner message={errors.latitude?.message ?? errors.longitude?.message ?? 'Ubicación inválida'} />
        ) : null}
      </FormSection>

      <Button label={submitLabel} onPress={handleSubmit(submit)} loading={isSubmitting} disabled={isSubmitting} />
    </View>
  );
}
