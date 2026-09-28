import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { CountStepper } from '@/components/ui/CountStepper';
import { FormSection } from '@/components/ui/FormSection';
import { PriceStepper } from '@/components/ui/PriceStepper';
import { TextField } from '@/components/ui/TextField';
import { LocationPicker } from '@/features/parking/LocationPicker';
import {
  MAX_CAPACITY,
  MIN_CAPACITY,
  parkingLotSchema,
  type ParkingLotFormValues,
} from '@/features/parking/schemas';
import type { ParkingLotInput } from '@/features/parking/api';
import { spacing, useTheme } from '@/theme';

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
      capacity: defaultValues?.capacity ?? MIN_CAPACITY,
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
        capacity: values.capacity,
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

      <FormSection title="Tarifa por hora" description="Lo que paga el conductor por cada hora reservada.">
        <Controller
          control={control}
          name="pricePerHour"
          render={({ field, fieldState }) => (
            <PriceStepper
              value={field.value}
              onChangeText={field.onChange}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </FormSection>

      <FormSection
        title="Capacidad"
        description="Cuántos autos entran a la vez. Esa cantidad de conductores puede reservar el mismo horario."
      >
        <Controller
          control={control}
          name="capacity"
          render={({ field }) => (
            <CountStepper
              value={field.value}
              onChange={field.onChange}
              min={MIN_CAPACITY}
              max={MAX_CAPACITY}
              unit={(n) => (n === 1 ? 'auto' : 'autos')}
              accessibilityLabel="Capacidad"
            />
          )}
        />
      </FormSection>

      <Button label={submitLabel} onPress={handleSubmit(submit)} loading={isSubmitting} disabled={isSubmitting} />
    </View>
  );
}
