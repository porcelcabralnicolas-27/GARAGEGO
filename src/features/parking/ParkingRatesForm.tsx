import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { CountStepper } from '@/components/ui/CountStepper';
import { FormSection } from '@/components/ui/FormSection';
import { PriceStepper } from '@/components/ui/PriceStepper';
import { MAX_CAPACITY, MIN_CAPACITY, ratesSchema, type RatesFormValues } from '@/features/parking/schemas';
import {
  AMENITIES,
  AMENITY_LABELS,
  LOT_TYPES,
  LOT_TYPE_DESCRIPTIONS,
  LOT_TYPE_LABELS,
  type Amenity,
  type LotType,
} from '@/features/parking/types';
import { spacing, useTheme } from '@/theme';

const AMENITY_OPTIONS = AMENITIES.map((value) => ({ value, label: AMENITY_LABELS[value] }));
const LOT_TYPE_OPTIONS = LOT_TYPES.map((value) => ({ value, label: LOT_TYPE_LABELS[value] }));

/** El tipo, la tarifa, la capacidad y los servicios ya convertidos para guardar. */
export type RatesInput = {
  lotType: LotType;
  pricePerHour: number;
  capacity: number;
  amenities: Amenity[];
};

type ParkingRatesFormProps = {
  defaultValues?: Partial<RatesFormValues>;
  submitLabel: string;
  onSubmit: (input: RatesInput) => Promise<void>;
};

// Paso 2 del asistente de publicación: tipo de publicación, tarifa por hora, capacidad y servicios.
export function ParkingRatesForm({ defaultValues, submitLabel, onSubmit }: ParkingRatesFormProps) {
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RatesFormValues>({
    resolver: zodResolver(ratesSchema),
    defaultValues: {
      // Las publicaciones nuevas arrancan como estacionamiento, que es lo que eran todas hasta ahora.
      lotType: defaultValues?.lotType ?? 'lot',
      pricePerHour: defaultValues?.pricePerHour ?? '',
      capacity: defaultValues?.capacity ?? MIN_CAPACITY,
      amenities: defaultValues?.amenities ?? [],
    },
  });

  const submit = async (values: RatesFormValues) => {
    // Misma protección contra doble envío que el paso 1.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setErrorMessage(null);
    try {
      await onSubmit({
        lotType: values.lotType,
        pricePerHour: Number(values.pricePerHour),
        capacity: values.capacity,
        // Mismo orden siempre, sin importar en cuál tocó primero.
        amenities: AMENITIES.filter((a) => values.amenities.includes(a)),
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

      <FormSection
        title="Tipo de publicación"
        description="Elegí qué estás ofreciendo. Se muestra con un ícono distinto en el mapa."
      >
        <Controller
          control={control}
          name="lotType"
          render={({ field }) => (
            <>
              <ChipSelect options={LOT_TYPE_OPTIONS} value={field.value} onChange={field.onChange} />
              <Text style={[typography.label, { color: colors.onSurfaceVariant, marginTop: spacing.sm }]}>
                {LOT_TYPE_DESCRIPTIONS[field.value]}
              </Text>
            </>
          )}
        />
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

      <FormSection title="Servicios" description="Marcá los que tenga tu cochera. Es opcional.">
        <Controller
          control={control}
          name="amenities"
          render={({ field }) => (
            <ChipSelect multiple options={AMENITY_OPTIONS} value={field.value} onChange={field.onChange} />
          )}
        />
      </FormSection>

      <Button label={submitLabel} onPress={handleSubmit(submit)} loading={isSubmitting} disabled={isSubmitting} />
    </View>
  );
}
