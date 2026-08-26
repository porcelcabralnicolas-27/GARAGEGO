import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';

import type { VehicleInput } from './api';
import { normalizePlate, vehicleSchema, type VehicleFormValues } from './schemas';

type VehicleFormProps = {
  defaultValues?: Partial<VehicleFormValues>;
  submitLabel: string;
  onSubmit: (input: VehicleInput) => Promise<void>;
};

export function VehicleForm({ defaultValues, submitLabel, onSubmit }: VehicleFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      plate: defaultValues?.plate ?? '',
      brand: defaultValues?.brand ?? '',
      model: defaultValues?.model ?? '',
      color: defaultValues?.color ?? '',
    },
  });

  const submit = async (values: VehicleFormValues) => {
    // Protección contra doble envío: un doble clic/tap muy rápido puede disparar
    // dos submits antes de que "isSubmitting" (estado, asíncrono) llegue a deshabilitar el botón.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setErrorMessage(null);
    try {
      await onSubmit({
        plate: normalizePlate(values.plate),
        brand: values.brand?.trim() ? values.brand.trim() : null,
        model: values.model?.trim() ? values.model.trim() : null,
        color: values.color?.trim() ? values.color.trim() : null,
      });
    } catch (error) {
      setErrorMessage(
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'No pudimos guardar los cambios. Intenta nuevamente.'
      );
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <View>
      {errorMessage ? <Banner message={errorMessage} /> : null}

      <Controller
        control={control}
        name="plate"
        render={({ field, fieldState }) => (
          <TextField
            label="Patente"
            autoCapitalize="characters"
            autoCorrect={false}
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
