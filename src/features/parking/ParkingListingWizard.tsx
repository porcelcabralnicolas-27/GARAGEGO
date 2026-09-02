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
  setParkingLotActive,
  updateParkingLot,
  type ParkingLotInput,
} from '@/features/parking/api';
import { ImageManager } from '@/features/parking/ImageManager';
import { ParkingForm } from '@/features/parking/ParkingForm';
import type { ParkingLot } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const STEPS = ['Datos del lugar', 'Disponibilidad', 'Fotos'] as const;

type WizardProps =
  | { mode: 'create' }
  | { mode: 'edit'; lot: ParkingLot };

/** Barra de progreso 1·2·3. En edición los pasos ya son navegables (el lote existe); al crear,
 *  hasta que el paso 1 no se guarda, los siguientes están bloqueados. */
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
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Asistente de publicación en 3 pasos, compartido por crear y editar.
//
// El flujo se parte en pasos porque los pasos 2 y 3 (disponibilidad y fotos) reutilizan
// AvailabilityEditor e ImageManager, y los dos necesitan un lote ya guardado — las fotos se
// suben a una carpeta con el id del lote. Por eso no puede ser una sola pantalla.
//
// Al crear: el lote se guarda como borrador (inactivo) al terminar el paso 1 y se activa
// recién al finalizar. Si se abandona, queda un borrador PAUSADO editable.
// Al editar: cada paso guarda lo suyo (el paso 1 al tocar "Guardar y seguir", los pasos 2 y 3
// en vivo). Los pasos ya son navegables porque el lote existe.
export function ParkingListingWizard(props: WizardProps) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);

  const isEdit = props.mode === 'edit';
  const [step, setStep] = useState(1);
  const [lotId, setLotId] = useState<string | null>(isEdit ? props.lot.id : null);
  const [isActive, setIsActive] = useState(isEdit ? props.lot.isActive : false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Solo en edición
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const reachableUpTo = lotId ? 3 : 1;

  const handleStepOne = async (input: ParkingLotInput) => {
    if (!profile) return;
    if (lotId) {
      await updateParkingLot(lotId, input);
    } else {
      const lot = await createParkingLot(profile.id, input, { isActive: false });
      setLotId(lot.id);
    }
    setStep(2);
  };

  const handleFinish = async () => {
    if (!lotId) return;
    if (isEdit) {
      router.replace('/(owner)/parkings');
      return;
    }
    setIsFinishing(true);
    setErrorMessage(null);
    try {
      await setParkingLotActive(lotId, true);
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
      router.replace('/(owner)/parkings');
    } catch {
      setErrorMessage('No se pudo eliminar la publicación.');
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const editDefaults =
    props.mode === 'edit'
      ? {
          name: props.lot.name,
          description: props.lot.description ?? '',
          address: props.lot.address,
          latitude: String(props.lot.latitude),
          longitude: String(props.lot.longitude),
          pricePerHour: String(props.lot.pricePerHour),
        }
      : undefined;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader title={isEdit ? 'Editar publicación' : 'Publicá tu espacio'} onBack={handleBack} />
        <StepIndicator step={step} reachableUpTo={reachableUpTo} onJump={setStep} />

        {errorMessage ? <Banner message={errorMessage} /> : null}

        {/* El paso 1 se mantiene montado (oculto) para no perder lo escrito al volver atrás. */}
        <View style={step === 1 ? undefined : styles.hidden}>
          <ParkingForm
            submitLabel={isEdit ? 'Guardar y seguir' : 'Siguiente'}
            defaultValues={editDefaults}
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

        {step === 2 && lotId ? (
          <View>
            <Text style={[typography.bodyMedium, styles.stepIntro, { color: colors.onSurfaceVariant }]}>
              Definí los días y horarios en que se puede reservar.
            </Text>
            <AvailabilityEditor parkingLotId={lotId} />
            <View style={styles.stepActions}>
              <Button label="Siguiente" onPress={() => setStep(3)} />
              {!isEdit ? (
                <>
                  <View style={styles.spacer} />
                  <LinkText label="Configurar la disponibilidad más tarde" onPress={() => setStep(3)} />
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {step === 3 && lotId && profile ? (
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
        message="¿Seguro que querés eliminar este estacionamiento? Esta acción no se puede deshacer."
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
