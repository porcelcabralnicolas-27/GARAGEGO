import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { CountStepper } from '@/components/ui/CountStepper';
import { FormSection } from '@/components/ui/FormSection';
import { PriceStepper } from '@/components/ui/PriceStepper';
import { ratesSchemaFor, type RatesFormValues } from '@/features/parking/schemas';
import {
  LOT_TYPES,
  LOT_TYPE_DESCRIPTIONS,
  LOT_TYPE_LABELS,
  type Amenity,
  type LotType,
} from '@/features/parking/types';
import { useAppLimits } from '@/hooks/useAppLimits';
import { useCatalogs } from '@/hooks/useCatalogs';
import { amenityOptions } from '@/lib/catalogs';
import { spacing, useTheme } from '@/theme';

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
  const { capacityMin, capacityMax } = useAppLimits();
  // Servicios del catálogo (0094): los activos, más los que la cochera ya tenía aunque se hayan
  // desactivado después (la base los deja conservar, pero no agregar).
  const { amenities: amenityCatalog } = useCatalogs();
  const initialAmenities = defaultValues?.amenities;
  const amenityChoices = useMemo(
    () => amenityOptions(initialAmenities ?? [], amenityCatalog),
    [amenityCatalog, initialAmenities]
  );
  const amenityChipOptions = amenityChoices.map((entry) => ({
    value: entry.code,
    label: entry.isActive ? entry.label : `${entry.label} (ya no se ofrece)`,
  }));
  // Al editar, la capacidad que ya tenía se acepta aunque el equipo haya cambiado el rango.
  const keepCapacity = defaultValues?.capacity;
  const schema = useMemo(
    () => ratesSchemaFor({ min: capacityMin, max: capacityMax }, keepCapacity),
    [capacityMin, capacityMax, keepCapacity]
  );
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RatesFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      // Las publicaciones nuevas arrancan como estacionamiento, que es lo que eran todas hasta ahora.
      lotType: defaultValues?.lotType ?? 'lot',
      pricePerHour: defaultValues?.pricePerHour ?? '',
      capacity: defaultValues?.capacity ?? capacityMin,
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
        amenities: amenityChoices.map((entry) => entry.code).filter((code) => values.amenities.includes(code)),
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
              min={Math.min(capacityMin, keepCapacity ?? capacityMin)}
              max={Math.max(capacityMax, keepCapacity ?? capacityMax)}
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
            <ChipSelect multiple options={amenityChipOptions} value={field.value} onChange={field.onChange} />
          )}
        />
      </FormSection>

      <Button label={submitLabel} onPress={handleSubmit(submit)} loading={isSubmitting} disabled={isSubmitting} />
    </View>
  );
}
