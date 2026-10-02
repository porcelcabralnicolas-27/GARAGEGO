import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AvailabilityEditor } from '@/features/parking/AvailabilityEditor';
import {
  createParkingLot,
  deleteParkingLot,
  getParkingErrorMessage,
  resubmitParkingLot,
  setParkingLotActive,
  updateParkingLot,
  type ParkingLotInput,
} from '@/features/parking/api';
import { ImageManager } from '@/features/parking/ImageManager';
import { ParkingPlaceForm, type PlaceInput } from '@/features/parking/ParkingPlaceForm';
import { ParkingRatesForm, type RatesInput } from '@/features/parking/ParkingRatesForm';
import type { ParkingLot } from '@/features/parking/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const STEPS = ['Datos del lugar', 'Tarifa y servicios', 'Disponibilidad', 'Fotos'] as const;

type WizardProps =
  | { mode: 'create' }
  | { mode: 'edit'; lot: ParkingLot };

/** Barra de progreso 1·2·3·4. En edición los pasos ya son navegables (el lote existe); al crear,
 *  los pasos se habilitan a medida que se completan (el lote se guarda al terminar el paso 2). */
function StepIndicator({
  step,
  reachableUpTo,
  onJump,
}: {
  step: number;
  reachableUpTo: number;
  onJump: (step: number) => void;
}) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.indicator}>
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const current = stepNumber === step;
        const reachable = stepNumber <= reachableUpTo;
        return (
          <Pressable
            key={label}
            style={styles.indicatorItem}
            disabled={!reachable}
            onPress={() => onJump(stepNumber)}
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: !reachable }}
            accessibilityLabel={`Paso ${stepNumber}: ${label}`}
          >
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: reachable ? colors.primary : colors.surfaceVariant,
                  borderColor: current ? colors.onSurface : 'transparent',
                },
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: reachable ? colors.onPrimary : colors.onSurfaceVariant },
                ]}
              >
                {stepNumber}
              </Text>
            </View>
            <Text
              style={[
                typography.label,
                styles.indicatorLabel,
                { color: current ? colors.onSurface : colors.onSurfaceVariant },
              ]}
              numberOfLines={2}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Asistente de publicación en 4 pasos, compartido por crear y editar:
//   1. Datos del lugar      nombre, descripción, dirección y ubicación en el mapa
//   2. Tarifa y servicios   tarifa por hora, capacidad y servicios
//   3. Disponibilidad       días y horarios
//   4. Fotos
//
// El flujo se parte en pasos porque los pasos 3 y 4 (disponibilidad y fotos) reutilizan
// AvailabilityEditor e ImageManager, y los dos necesitan un lote ya guardado — las fotos se
// suben a una carpeta con el id del lote. Por eso no puede ser una sola pantalla.
//
// Al crear: los pasos 1 y 2 se guardan en memoria y el lote se crea como borrador (inactivo) al
// terminar el paso 2 —una publicación necesita tarifa para existir—; se activa recién al
// finalizar. Si se abandona, queda un borrador PAUSADO editable.
// Al editar: los pasos 1 y 2 guardan al tocar "Guardar y seguir" y los pasos 3 y 4 en vivo. Los
// pasos ya son navegables porque el lote existe.
function placeDefaultsOf(props: WizardProps): PlaceInput | null {
  if (props.mode !== 'edit') return null;
  const { name, description, address, latitude, longitude } = props.lot;
  return { name, description, address, latitude, longitude };
}

function ratesDefaultsOf(props: WizardProps): RatesInput | null {
  if (props.mode !== 'edit') return null;
  const { pricePerHour, capacity, amenities } = props.lot;
  return { pricePerHour, capacity, amenities };
}

export function ParkingListingWizard(props: WizardProps) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  // Sin esto, volver a abrir la edición dentro del staleTime mostraba el lote en cache de antes
  // de guardar (nombre, precio, estado de moderación).
  const invalidateLots = () => queryClient.invalidateQueries({ queryKey: queryKeys.parkingLots.all });

  const isEdit = props.mode === 'edit';
  const [step, setStep] = useState(1);
  const [lotId, setLotId] = useState<string | null>(isEdit ? props.lot.id : null);
  const [isActive, setIsActive] = useState(isEdit ? props.lot.isActive : false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // El equipo pidió cambios: al guardar cualquier edición se vuelve a mandar a revisión
  // (transición que habilita el trigger `parking_lots_protect_moderation`). Una publicación
  // rechazada es terminal y ni siquiera llega hasta acá (lo corta `[id]/edit.tsx`).
  const needsResubmit = props.mode === 'edit' && props.lot.approvalStatus === 'changes_requested';
  const [resubmitted, setResubmitted] = useState(false);

  const maybeResubmit = async (id: string) => {
    if (!needsResubmit || resubmitted) return;
    await resubmitParkingLot(id);
    setResubmitted(true);
  };

  // Solo en edición
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Los dos primeros pasos se completan en memoria; en edición ya vienen cargados del lote.
  const [place, setPlace] = useState<PlaceInput | null>(placeDefaultsOf(props));
  const [rates, setRates] = useState<RatesInput | null>(ratesDefaultsOf(props));

  const reachableUpTo = lotId ? 4 : place ? 2 : 1;

  // Crea el lote (si todavía no existe) o actualiza el que ya está, con los datos de los dos pasos.
  const saveLot = async (nextPlace: PlaceInput, nextRates: RatesInput) => {
    if (!profile) return;
    const input: ParkingLotInput = { ...nextPlace, ...nextRates };
    if (lotId) {
      await updateParkingLot(lotId, input);
      await maybeResubmit(lotId);
    } else {
      const lot = await createParkingLot(profile.id, input, { isActive: false });
      setLotId(lot.id);
    }
    invalidateLots();
  };

  const handleStepOne = async (input: PlaceInput) => {
    setPlace(input);
    // Con el lote ya creado (edición, o volviendo atrás después del paso 2) se guarda enseguida.
    if (lotId && rates) await saveLot(input, rates);
    setStep(2);
  };

  const handleStepTwo = async (input: RatesInput) => {
    if (!place) return;
    setRates(input);
    await saveLot(place, input);
    setStep(3);
  };

  const handleFinish = async () => {
    if (!lotId) return;
    if (isEdit) {
      // Cubre el caso de editar solo fotos o disponibilidad, sin pasar por "Guardar y seguir".
      await maybeResubmit(lotId).catch(() => undefined);
      invalidateLots();
      router.replace('/(owner)/parkings');
      return;
    }
    setIsFinishing(true);
    setErrorMessage(null);
    try {
      await setParkingLotActive(lotId, true);
      invalidateLots();
      router.replace('/(owner)/parkings');
    } catch {
      setErrorMessage(
        'No se pudo publicar. Quedó guardada como pausada; podés activarla desde la edición.'
      );
    } finally {
      setIsFinishing(false);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      router.replace('/(owner)/parkings');
      return;
    }
    setStep(step - 1);
  };

  const handleConfirmToggle = async () => {
    if (!lotId) return;
    setIsTogglingActive(true);
    try {
      await setParkingLotActive(lotId, !isActive);
      setIsActive(!isActive);
      invalidateLots();
      setConfirmToggle(false);
    } catch {
      setErrorMessage('No se pudo cambiar el estado de la publicación.');
      setConfirmToggle(false);
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!lotId) return;
    setIsDeleting(true);
    try {
      await deleteParkingLot(lotId);
      setConfirmDelete(false);
      invalidateLots();
      router.replace('/(owner)/parkings');
    } catch (error) {
      setErrorMessage(getParkingErrorMessage(error));
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const placeFormDefaults =
    props.mode === 'edit'
      ? {
          name: props.lot.name,
          description: props.lot.description ?? '',
          address: props.lot.address,
          latitude: String(props.lot.latitude),
          longitude: String(props.lot.longitude),
        }
      : undefined;

  const ratesFormDefaults =
    props.mode === 'edit'
      ? {
          pricePerHour: String(props.lot.pricePerHour),
          capacity: props.lot.capacity,
          amenities: props.lot.amenities,
        }
      : undefined;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title={isEdit ? 'Editar publicación' : 'Publicá tu espacio'} onBack={handleBack} />
        <StepIndicator step={step} reachableUpTo={reachableUpTo} onJump={setStep} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {resubmitted ? (
          <Banner
            variant="success"
            message="Cambios guardados. La publicación volvió a la cola de revisión del equipo."
          />
        ) : needsResubmit ? (
          <Banner
            message={
              'El equipo pidió cambios' +
              (props.mode === 'edit' && props.lot.rejectionReason
                ? `: ${props.lot.rejectionReason}`
                : '') +
              '. Editá lo que haga falta y guardá para volver a enviarla a revisión.'
            }
          />
        ) : null}

        {/* Los pasos 1 y 2 se mantienen montados (ocultos) para no perder lo escrito al volver atrás. */}
        <View style={step === 1 ? undefined : styles.hidden}>
          <ParkingPlaceForm
            submitLabel={isEdit ? 'Guardar y seguir' : 'Siguiente'}
            defaultValues={placeFormDefaults}
            onSubmit={handleStepOne}
          />

          {isEdit ? (
            <View style={styles.manageBlock}>
              <View style={[styles.divider, { backgroundColor: colors.outline }]} />
              <Button
                label={isActive ? 'Pausar publicación' : 'Activar publicación'}
                variant="outlined"
                onPress={() => setConfirmToggle(true)}
                loading={isTogglingActive}
              />
              <View style={styles.spacer} />
              <Button
                label="Eliminar publicación"
                variant="text"
                onPress={() => setConfirmDelete(true)}
                disabled={isDeleting}
              />
            </View>
          ) : null}
        </View>

        <View style={step === 2 ? undefined : styles.hidden}>
          <ParkingRatesForm
            submitLabel={isEdit ? 'Guardar y seguir' : 'Siguiente'}
            defaultValues={ratesFormDefaults}
            onSubmit={handleStepTwo}
          />
        </View>

        {step === 3 && lotId ? (
          <View>
            <Text style={[typography.bodyMedium, styles.stepIntro, { color: colors.onSurfaceVariant }]}>
              Definí los días y horarios en que se puede reservar.
            </Text>
            <AvailabilityEditor parkingLotId={lotId} />
            <View style={styles.stepActions}>
              <Button label="Siguiente" onPress={() => setStep(4)} />
              {!isEdit ? (
                <>
                  <View style={styles.spacer} />
                  <LinkText label="Configurar la disponibilidad más tarde" onPress={() => setStep(4)} />
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {step === 4 && lotId && profile ? (
          <View>
            <Text style={[typography.bodyMedium, styles.stepIntro, { color: colors.onSurfaceVariant }]}>
              Subí hasta 3 fotos del lugar. La primera es la que se ve en la búsqueda.
            </Text>
            <ImageManager ownerId={profile.id} parkingLotId={lotId} />
            <View style={styles.stepActions}>
              <Button
                label={isEdit ? 'Listo' : 'Publicar'}
                onPress={handleFinish}
                loading={isFinishing}
                disabled={isFinishing}
              />
              {!isEdit ? (
                <>
                  <View style={styles.spacer} />
                  <LinkText label="Publicar sin fotos" onPress={handleFinish} />
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmToggle}
        title={isActive ? 'Pausar publicación' : 'Activar publicación'}
        message={
          isActive
            ? '¿Seguro que querés pausarla? Deja de aparecer en las búsquedas y nadie va a poder reservar hasta que la vuelvas a activar.'
            : '¿Querés volver a activar esta publicación? Va a aparecer de nuevo en las búsquedas.'
        }
        confirmLabel={isActive ? 'Pausar' : 'Activar'}
        loading={isTogglingActive}
        onConfirm={handleConfirmToggle}
        onCancel={() => setConfirmToggle(false)}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title="Eliminar publicación"
        message="¿Seguro que querés eliminar este estacionamiento? Deja de publicarse y no se puede deshacer. Si ya tuvo reservas, su historial se conserva."
        confirmLabel="Eliminar"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  indicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  indicatorItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorLabel: {
    textAlign: 'center',
    // Con 4 pasos, "Disponibilidad" no entra entera en un celular angosto con el tamaño normal.
    fontSize: 11,
    letterSpacing: 0,
  },
  hidden: {
    display: 'none',
  },
  manageBlock: {
    marginTop: spacing.xl,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.xl,
  },
  stepIntro: {
    marginBottom: spacing.lg,
  },
  stepActions: {
    marginTop: spacing.xl,
  },
  spacer: {
    height: spacing.md,
  },
});
