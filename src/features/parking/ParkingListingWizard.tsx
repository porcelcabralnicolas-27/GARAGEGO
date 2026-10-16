import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LinkText } from '@/components/ui/LinkText';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import {
  AvailabilityEditor,
  EMPTY_AVAILABILITY_DRAFT,
  type AvailabilityDraft,
} from '@/features/parking/AvailabilityEditor';
import {
  addAvailabilityException,
  addRecurringAvailabilityBulk,
  createParkingLot,
  deleteParkingLot,
  getParkingErrorMessage,
  listLotDocuments,
  resubmitParkingLot,
  setHolderRole,
  setParkingLotActive,
  updateParkingLot,
  uploadLotDocument,
  uploadParkingImage,
  type ParkingLotInput,
} from '@/features/parking/api';
import { DraftImageManager, type DraftPhoto } from '@/features/parking/DraftImageManager';
import { ImageManager } from '@/features/parking/ImageManager';
import { EMPTY_DOCS_DRAFT, OwnershipDocsStep, type DocsDraft } from '@/features/parking/OwnershipDocsStep';
import { ParkingPlaceForm, type PlaceInput } from '@/features/parking/ParkingPlaceForm';
import { ParkingRatesForm, type RatesInput } from '@/features/parking/ParkingRatesForm';
import {
  LISTING_CHANGE_FIELD_LABELS,
  missingDocumentRequirements,
  type DocumentKind,
  type HolderRole,
  type ParkingLot,
} from '@/features/parking/types';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/useAuthStore';
import { radius, spacing, useTheme } from '@/theme';

const STEPS = ['Datos del lugar', 'Tarifa y servicios', 'Disponibilidad', 'Fotos', 'Titularidad'] as const;
const LAST_STEP = STEPS.length;
const MISSING_PHOTO_MESSAGE = 'Subí al menos una foto del lugar para continuar.';

type WizardProps =
  | { mode: 'create' }
  | { mode: 'edit'; lot: ParkingLot };

/** Barra de progreso 1·2·3·4·5. En edición los pasos ya son navegables (el lote existe); al crear,
 *  los pasos se habilitan a medida que se completan. */
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

// Asistente de publicación en 5 pasos, compartido por crear y editar:
//   1. Datos del lugar      nombre, descripción, dirección y ubicación en el mapa
//   2. Tarifa y servicios   tarifa por hora, capacidad y servicios
//   3. Disponibilidad       días y horarios
//   4. Fotos
//   5. Titularidad          relación con el lugar y documentos que acreditan que es el dueño
//                           o que tiene permiso (migración 0078); el equipo los revisa
//
// Al crear: los 5 pasos se completan EN MEMORIA y la publicación se crea recién al terminar el
// paso 5 ("Publicar"), con sus horarios, fotos y documentos. Si se abandona antes, no queda nada guardado: ni
// un borrador pausado en la lista. Si falla algo al publicar, se borra lo que alcanzó a crearse y
// el usuario conserva todo lo cargado para reintentar.
// Al editar: los pasos 1 y 2 guardan al tocar "Guardar y seguir" y los pasos 3 y 4 en vivo. Los
// pasos ya son navegables porque el lote existe.
function placeDefaultsOf(props: WizardProps): PlaceInput | null {
  if (props.mode !== 'edit') return null;
  const { name, description, address, latitude, longitude } = props.lot;
  return { name, description, address, latitude, longitude };
}

function ratesDefaultsOf(props: WizardProps): RatesInput | null {
  if (props.mode !== 'edit') return null;
  const { pricePerHour, capacity, amenities, lotType } = props.lot;
  return { pricePerHour, capacity, amenities, lotType };
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
  // Solo existe al editar: al crear, el lote no se guarda hasta publicar.
  const lotId = isEdit ? props.lot.id : null;
  const [isActive, setIsActive] = useState(isEdit ? props.lot.isActive : false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // El equipo pidió cambios: la publicación se reenvía a revisión recién al terminar el asistente
  // ("Enviar a revisión"), no al guardar cada paso. El servidor (trigger
  // `parking_lots_protect_moderation`, 0072) verifica que se haya modificado lo que se pidió y,
  // si falta algo, rechaza el reenvío con `changes_not_made`. Una publicación rechazada es
  // terminal y ni siquiera llega hasta acá (lo corta `[id]/edit.tsx`).
  const needsResubmit = props.mode === 'edit' && props.lot.approvalStatus === 'changes_requested';

  // La cochera tal como la dejó el servidor tras el último guardado (en edición). Importa porque
  // guardar puede cambiarle el estado: cambiar la dirección de una cochera ya verificada le quita
  // la verificación de titularidad (migración 0082) y hay que acreditarla de nuevo.
  const [currentLot, setCurrentLot] = useState<ParkingLot | null>(isEdit ? props.lot : null);
  const mustReverify =
    props.mode === 'edit' && props.lot.ownershipVerifiedAt !== null && currentLot?.ownershipVerifiedAt === null;
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

  // Solo al crear: lo que se cargó en los pasos 3 y 4, en memoria hasta publicar.
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityDraft>(EMPTY_AVAILABILITY_DRAFT);
  const [photoDraft, setPhotoDraft] = useState<DraftPhoto[]>([]);
  const [docsDraft, setDocsDraft] = useState<DocsDraft>(EMPTY_DOCS_DRAFT);
  const [confirmExit, setConfirmExit] = useState(false);

  // Relación con el lugar: define qué documentos se piden. Se guarda al elegirla en edición; al
  // crear viaja con el alta.
  const [holderRole, setHolderRoleState] = useState<HolderRole>(isEdit ? props.lot.holderRole : 'owner');

  const reachableUpTo = isEdit || rates ? LAST_STEP : place ? 2 : 1;

  const handleHolderRoleChange = async (role: HolderRole) => {
    const previous = holderRole;
    setHolderRoleState(role);
    if (!lotId) return;
    try {
      await setHolderRole(lotId, role);
      invalidateLots();
    } catch (error) {
      setHolderRoleState(previous);
      setErrorMessage(getParkingErrorMessage(error));
    }
  };

  /** Nombres de lo que todavía falta subir, o null si está completo. */
  const missingDocsMessage = (kinds: DocumentKind[]): string | null => {
    const missing = missingDocumentRequirements(holderRole, kinds);
    if (missing.length === 0) return null;
    return `Faltan documentos de titularidad: ${missing.map((m) => m.label.toLowerCase()).join(', ')}.`;
  };

  // Edición: actualiza la cochera con los datos de los dos primeros pasos.
  const saveLot = async (id: string, nextPlace: PlaceInput, nextRates: RatesInput) => {
    const input: ParkingLotInput = { ...nextPlace, ...nextRates };
    setCurrentLot(await updateParkingLot(id, input));
    invalidateLots();
  };

  // Creación: recién acá se escribe algo en el servidor. Se crea inactiva, se le cargan horarios y
  // fotos y al final se activa, así nunca aparece a medio armar. Si algo falla, se borra todo lo
  // creado (también sus fotos) y el error sube para mostrarse; lo cargado en pantalla se conserva.
  const publishNewLot = async () => {
    if (!profile || !place || !rates) throw new Error('Faltan datos de la publicación.');
    const lot = await createParkingLot(profile.id, { ...place, ...rates }, { isActive: false, holderRole });
    try {
      for (const kind of Object.keys(docsDraft) as DocumentKind[]) {
        const draftDoc = docsDraft[kind];
        if (!draftDoc) continue;
        await uploadLotDocument({ ownerId: profile.id, parkingLotId: lot.id, kind, localUri: draftDoc.uri });
      }
      if (availabilityDraft.recurring.length > 0) {
        await addRecurringAvailabilityBulk(
          lot.id,
          availabilityDraft.recurring.map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
        );
      }
      for (const exception of availabilityDraft.exceptions) {
        await addAvailabilityException(lot.id, {
          date: exception.date,
          startTime: exception.startTime,
          endTime: exception.endTime,
          isAvailable: exception.isAvailable,
        });
      }
      for (let position = 0; position < photoDraft.length; position += 1) {
        await uploadParkingImage({
          ownerId: profile.id,
          parkingLotId: lot.id,
          localUri: photoDraft[position].publicUrl,
          position,
        });
      }
      await setParkingLotActive(lot.id, true);
    } catch (error) {
      // El borrado también limpia sus fotos y documentos del bucket.
      await deleteParkingLot(lot.id).catch(() => {});
      throw error;
    }
  };

  const handleStepOne = async (input: PlaceInput) => {
    setPlace(input);
    // En edición (o volviendo atrás después del paso 2) se guarda enseguida.
    if (lotId && rates) await saveLot(lotId, input, rates);
    setStep(2);
  };

  const handleStepTwo = async (input: RatesInput) => {
    if (!place) return;
    setRates(input);
    if (lotId) await saveLot(lotId, place, input);
    setStep(3);
  };

  const handleFinish = async () => {
    if (isFinishing) return;
    if (lotId) {
      setIsFinishing(true);
      setErrorMessage(null);
      try {
        // Reenviar a revisión, o volver a acreditar la titularidad tras cambiar la dirección, exige
        // los documentos completos; el resto de las ediciones no.
        if ((needsResubmit && !resubmitted) || mustReverify) {
          const docs = await listLotDocuments(lotId);
          const message = missingDocsMessage(docs.map((doc) => doc.kind));
          if (message) {
            setErrorMessage(message);
            return;
          }
        }
        await maybeResubmit(lotId);
      } catch (error) {
        // Falta algo de lo pedido: se queda en el asistente y se dice qué.
        setErrorMessage(getParkingErrorMessage(error));
        return;
      } finally {
        setIsFinishing(false);
      }
      invalidateLots();
      router.replace('/(owner)/parkings');
      return;
    }
    // Al crear, la publicación necesita al menos una foto (el indicador de pasos permite saltar acá
    // sin haber pasado por el paso de fotos, por eso también se valida al publicar).
    if (photoDraft.length === 0) {
      setErrorMessage(MISSING_PHOTO_MESSAGE);
      setStep(4);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    const missingMessage = missingDocsMessage(Object.keys(docsDraft) as DocumentKind[]);
    if (missingMessage) {
      setErrorMessage(missingMessage);
      return;
    }
    setIsFinishing(true);
    setErrorMessage(null);
    try {
      await publishNewLot();
      invalidateLots();
      router.replace('/(owner)/parkings');
    } catch (error) {
      setErrorMessage(
        `No se pudo publicar: ${getParkingErrorMessage(error)} No se guardó nada; revisá tu conexión y volvé a intentar.`
      );
    } finally {
      setIsFinishing(false);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      // Al crear, lo cargado vive solo en memoria: salir lo descarta, así que se confirma.
      if (!isEdit && place) {
        setConfirmExit(true);
        return;
      }
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
          lotType: props.lot.lotType,
        }
      : undefined;

  return (
    <Screen>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
              (props.mode === 'edit' && props.lot.requestedChanges.length > 0
                ? `. Tenés que modificar: ${props.lot.requestedChanges
                    .map((field) => LISTING_CHANGE_FIELD_LABELS[field])
                    .join(', ')}`
                : '') +
              '. Cuando termines, tocá "Enviar a revisión" en el último paso.'
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

        {step === 3 ? (
          <View>
            <Text style={[typography.bodyMedium, styles.stepIntro, { color: colors.onSurfaceVariant }]}>
              Definí los días y horarios en que se puede reservar.
            </Text>
            {lotId ? (
              <AvailabilityEditor parkingLotId={lotId} />
            ) : (
              <AvailabilityEditor draft={availabilityDraft} onDraftChange={setAvailabilityDraft} />
            )}
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

        {step === 4 && profile ? (
          <View>
            <Text style={[typography.bodyMedium, styles.stepIntro, { color: colors.onSurfaceVariant }]}>
              {isEdit
                ? 'Podés tener hasta 3 fotos del lugar. Tienen que ser todas distintas.'
                : 'Subí al menos 1 foto del lugar (hasta 3). Tienen que ser todas distintas.'}
            </Text>
            {lotId ? (
              <ImageManager ownerId={profile.id} parkingLotId={lotId} />
            ) : (
              <DraftImageManager photos={photoDraft} onChange={setPhotoDraft} />
            )}
            <View style={styles.stepActions}>
              <Button
                label="Siguiente"
                onPress={() => {
                  if (!isEdit && photoDraft.length === 0) {
                    setErrorMessage(MISSING_PHOTO_MESSAGE);
                    // El aviso está arriba de todo: se sube para que se vea.
                    scrollRef.current?.scrollTo({ y: 0, animated: true });
                    return;
                  }
                  setErrorMessage(null);
                  setStep(5);
                }}
              />
            </View>
          </View>
        ) : null}

        {step === 5 && profile ? (
          <View>
            {mustReverify ? (
              <Banner
                variant="info"
                message="Cambiaste la dirección o la ubicación del lugar: como puede ser otro lugar, hay que acreditar la titularidad de nuevo. Subí los documentos para que el equipo los revise."
              />
            ) : null}
            {currentLot?.approvalStatus === 'approved' && currentLot.ownershipVerifiedAt ? (
              // Los documentos se borran al verificar: queda solo la constancia.
              <Banner
                variant="success"
                message={`El equipo verificó la titularidad de este lugar el ${new Date(currentLot.ownershipVerifiedAt).toLocaleDateString('es-AR')}. Por seguridad, borramos los documentos que subiste.`}
              />
            ) : lotId ? (
              <OwnershipDocsStep
                ownerId={profile.id}
                lotType={rates?.lotType ?? 'lot'}
                holderRole={holderRole}
                onHolderRoleChange={handleHolderRoleChange}
                parkingLotId={lotId}
              />
            ) : (
              <OwnershipDocsStep
                ownerId={profile.id}
                lotType={rates?.lotType ?? 'lot'}
                holderRole={holderRole}
                onHolderRoleChange={handleHolderRoleChange}
                draft={docsDraft}
                onDraftChange={setDocsDraft}
              />
            )}
            <View style={styles.stepActions}>
              <Button
                label={needsResubmit ? 'Enviar a revisión' : isEdit ? 'Listo' : 'Publicar'}
                onPress={handleFinish}
                loading={isFinishing}
                disabled={isFinishing}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmExit}
        title="Salir sin publicar"
        message="Todavía no publicaste este espacio. Si salís ahora, se pierde lo que cargaste."
        confirmLabel="Salir"
        onConfirm={() => {
          setConfirmExit(false);
          router.replace('/(owner)/parkings');
        }}
        onCancel={() => setConfirmExit(false)}
      />

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
    // Con 5 pasos, "Disponibilidad" no entra entera en un celular angosto con el tamaño normal.
    fontSize: 10,
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
