import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { FormSection } from '@/components/ui/FormSection';
import { TextField } from '@/components/ui/TextField';
import { LocationPicker } from '@/features/parking/LocationPicker';
import { placeSchema, type PlaceFormValues } from '@/features/parking/schemas';
import { useGeocoder } from '@/features/search/useGeocoder';
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

/** Cuánto se espera después de que dejan de escribir antes de buscar la dirección en el mapa. */
const ADDRESS_SEARCH_DELAY_MS = 900;
const MIN_ADDRESS_LENGTH = 5;

type AddressStatus = 'idle' | 'searching' | 'found' | 'notFound' | 'error';

// Paso 1 del asistente de publicación: nombre, descripción, dirección y ubicación en el mapa.
// La dirección se puede escribir (se ubica sola en el mapa) o se puede tocar el mapa (completa la
// dirección). Son dos caminos para el mismo dato.
export function ParkingPlaceForm({ defaultValues, submitLabel, onSubmit }: ParkingPlaceFormProps) {
  const { colors, typography } = useTheme();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const geocoder = useGeocoder();
  const [recenterToken, setRecenterToken] = useState(0);
  const [addressStatus, setAddressStatus] = useState<AddressStatus>('idle');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Para descartar la respuesta de una búsqueda vieja si ya se escribió otra cosa.
  const searchIdRef = useRef(0);
  // Texto ya buscado (o que vino del mapa o de la cochera guardada): no se busca dos veces.
  const lastSearchedRef = useRef((defaultValues?.address ?? '').trim());
  // Solo se busca lo que la persona escribió: la dirección que completa el mapa no se vuelve a buscar.
  const typedRef = useRef(false);
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

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    []
  );

  /** Busca la dirección escrita y, si la encuentra, mueve el marcador y el mapa ahí. */
  const locateAddress = async (text: string) => {
    const query = text.trim();
    if (query.length < MIN_ADDRESS_LENGTH || query === lastSearchedRef.current || !geocoder.isReady) return;
    lastSearchedRef.current = query;
    typedRef.current = false;
    const searchId = (searchIdRef.current += 1);
    setAddressStatus('searching');
    try {
      const found = await geocoder.geocode(query);
      if (searchId !== searchIdRef.current) return;
      if (!found) {
        setAddressStatus('notFound');
        return;
      }
      setValue('latitude', String(found.latitude), { shouldValidate: true });
      setValue('longitude', String(found.longitude), { shouldValidate: true });
      setRecenterToken((token) => token + 1);
      setAddressStatus('found');
    } catch {
      if (searchId === searchIdRef.current) setAddressStatus('error');
    }
  };

  const handleAddressTyped = (text: string) => {
    typedRef.current = true;
    setAddressStatus('idle');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => void locateAddress(text), ADDRESS_SEARCH_DELAY_MS);
  };

  /** El mapa completó la dirección (se tocó o se movió el marcador): cancela cualquier búsqueda en curso. */
  const handleAddressFromMap = (address: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchIdRef.current += 1;
    typedRef.current = false;
    lastSearchedRef.current = address.trim();
    setAddressStatus('idle');
    setValue('address', address, { shouldValidate: true });
  };

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
            <>
              <TextField
                label="DIRECCIÓN"
                placeholder="Ej.: Av. Mitre 1500, Avellaneda"
                value={field.value}
                onChangeText={(text) => {
                  field.onChange(text);
                  handleAddressTyped(text);
                }}
                // Al salir del campo no se espera el retardo: se busca enseguida si hubo cambios.
                onBlur={() => {
                  field.onBlur();
                  if (typedRef.current) {
                    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                    void locateAddress(field.value);
                  }
                }}
                errorMessage={fieldState.error?.message}
              />
              {addressStatus !== 'idle' ? (
                <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.sm }]}>
                  {addressStatus === 'searching'
                    ? 'Buscando la dirección en el mapa…'
                    : addressStatus === 'found'
                      ? 'Ubicamos la dirección en el mapa. Si hace falta, movés el marcador a la entrada exacta.'
                      : addressStatus === 'notFound'
                        ? 'No encontramos esa dirección en el mapa. Probá con calle, número y localidad, o ubicala tocando el mapa.'
                        : 'No se pudo buscar la dirección. Ubicala tocando el mapa.'}
                </Text>
              ) : null}
            </>
          )}
        />
      </FormSection>

      <FormSection
        title="Ubicación en el mapa"
        description="Se ubica sola con la dirección que escribís arriba. También podés tocar el mapa o mover el marcador al lugar exacto de la entrada."
      >
        <LocationPicker
          latitude={pickerLatitude}
          longitude={pickerLongitude}
          onChange={(lat, lng) => {
            setValue('latitude', String(lat), { shouldValidate: true });
            setValue('longitude', String(lng), { shouldValidate: true });
          }}
          onAddressResolved={handleAddressFromMap}
          recenterToken={recenterToken}
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
