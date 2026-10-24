import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import {
  deleteLotDocument,
  getParkingErrorMessage,
  listLotDocuments,
  uploadLotDocument,
} from '@/features/parking/api';
import {
  DOCUMENT_KIND_LABELS,
  HOLDER_ROLES,
  HOLDER_ROLE_LABELS,
  documentRequirements,
  type DocumentKind,
  type DocumentRequirement,
  type HolderRole,
  type LotDocument,
  type LotType,
} from '@/features/parking/types';
import { assertImageUploadable } from '@/lib/imageMime';
import { queryKeys } from '@/lib/queryKeys';
import { radius, spacing, useTheme } from '@/theme';

/** Documentos elegidos pero todavía no subidos: viven en memoria hasta publicar la cochera. */
export type DocsDraft = Partial<Record<DocumentKind, { uri: string }>>;

export const EMPTY_DOCS_DRAFT: DocsDraft = {};

const NO_DOCUMENTS: LotDocument[] = [];

const ROLE_OPTIONS = HOLDER_ROLES.map((role) => ({ value: role, label: HOLDER_ROLE_LABELS[role] }));

type Props = {
  ownerId: string;
  lotType: LotType;
  holderRole: HolderRole;
  onHolderRoleChange: (role: HolderRole) => void;
} & (
  | { parkingLotId: string; draft?: undefined; onDraftChange?: undefined }
  | { parkingLotId?: undefined; draft: DocsDraft; onDraftChange: (next: DocsDraft) => void }
);

/**
 * Paso "Titularidad" del asistente de publicación: el propietario declara su relación con el
 * lugar y sube los documentos que lo acreditan (migración 0078). El servidor es el que exige
 * que estén completos; esto le dice qué pedir según la relación elegida.
 *
 * Mismo esquema que `AvailabilityEditor`: con `parkingLotId` trabaja sobre una cochera existente
 * (cada cambio se guarda en el momento) y con `draft` lo hace en memoria, para el alta.
 */
export function OwnershipDocsStep({
  ownerId,
  lotType,
  holderRole,
  onHolderRoleChange,
  parkingLotId,
  draft,
  onDraftChange,
}: Props) {
  const { colors, typography } = useTheme();
  const queryClient = useQueryClient();

  const queryKey = queryKeys.parkingLots.documents(parkingLotId ?? 'draft');
  const { data: savedDocs = NO_DOCUMENTS, isError } = useQuery({
    queryKey,
    enabled: !draft,
    queryFn: () => listLotDocuments(parkingLotId as string),
  });

  const [busyRequirement, setBusyRequirement] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Cuando un requisito se cumple con más de un tipo de documento (escritura o boleta), qué tipo
  // se va a subir. Si ya hay uno cargado, se usa ese.
  const [chosenKind, setChosenKind] = useState<Record<string, DocumentKind>>({});

  const have = new Set<DocumentKind>(
    draft ? (Object.keys(draft) as DocumentKind[]) : savedDocs.map((doc) => doc.kind)
  );
  const requirements = documentRequirements(holderRole, lotType);

  const presentKindOf = (requirement: DocumentRequirement) => requirement.kinds.find((kind) => have.has(kind));
  // Lo que el usuario eligió gana; si no eligió nada, el que ya está cargado; y si no, el primero.
  const kindToUpload = (requirement: DocumentRequirement) =>
    chosenKind[requirement.id] ?? presentKindOf(requirement) ?? requirement.kinds[0];

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const handleUpload = async (requirement: DocumentRequirement) => {
    setErrorMessage(null);
    const kind = kindToUpload(requirement);
    const otherKinds = requirement.kinds.filter((k) => k !== kind);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Necesitamos permiso para acceder a tus fotos.');
        return;
      }
      // Sin recorte: un documento tiene que verse entero.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets[0]) return;

      const { uri, fileSize } = result.assets[0];
      assertImageUploadable(uri, fileSize);

      setBusyRequirement(requirement.id);
      if (draft) {
        const next = { ...draft };
        for (const other of otherKinds) delete next[other];
        next[kind] = { uri };
        onDraftChange(next);
      } else {
        await uploadLotDocument({ ownerId, parkingLotId: parkingLotId as string, kind, localUri: uri, replacesKinds: otherKinds });
        await refresh();
      }
    } catch (error) {
      setErrorMessage(`No se pudo subir el documento: ${getParkingErrorMessage(error)}`);
    } finally {
      setBusyRequirement(null);
    }
  };

  const handleRemove = async (requirement: DocumentRequirement) => {
    setErrorMessage(null);
    const kind = presentKindOf(requirement);
    if (!kind) return;

    try {
      setBusyRequirement(requirement.id);
      if (draft) {
        const next = { ...draft };
        delete next[kind];
        onDraftChange(next);
      } else {
        const doc = savedDocs.find((d) => d.kind === kind);
        if (doc) {
          await deleteLotDocument(doc);
          await refresh();
        }
      }
    } catch (error) {
      setErrorMessage(`No se pudo quitar el documento: ${getParkingErrorMessage(error)}`);
    } finally {
      setBusyRequirement(null);
    }
  };

  return (
    <View>
      <Text style={[typography.bodyMedium, styles.intro, { color: colors.onSurfaceVariant }]}>
        Para publicar, necesitamos comprobar que sos el dueño del lugar o que tenés permiso para
        ofrecerlo. Los documentos solo los ve el equipo de GarageGo, se usan únicamente para esta
        verificación y los borramos apenas la revisión termina. Tapá el número de trámite del DNI y
        cualquier dato bancario.
      </Text>

      {isError ? <Banner message="No se pudieron cargar los documentos." /> : null}
      {errorMessage ? <Banner message={errorMessage} /> : null}

      <Text style={[typography.titleMedium, styles.sectionTitle, { color: colors.onBackground }]}>
        ¿Qué relación tenés con el lugar?
      </Text>
      <ChipSelect options={ROLE_OPTIONS} value={holderRole} onChange={onHolderRoleChange} />

      <Text style={[typography.titleMedium, styles.sectionTitle, { color: colors.onBackground }]}>
        Documentos
      </Text>

      {requirements.map((requirement) => {
        const presentKind = presentKindOf(requirement);
        const isBusy = busyRequirement === requirement.id;
        const previewUri = presentKind && draft ? draft[presentKind]?.uri : undefined;
        const kindOptions = requirement.kinds.map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABELS[kind] }));

        return (
          <View
            key={requirement.id}
            style={[styles.card, { borderColor: presentKind ? colors.success : colors.outline }]}
          >
            <View style={styles.cardHeader}>
              <Ionicons
                name={presentKind ? 'checkmark-circle' : requirement.optional ? 'ellipse-outline' : 'alert-circle-outline'}
                size={22}
                color={presentKind ? colors.success : colors.onSurfaceVariant}
              />
              <Text style={[typography.bodyLarge, styles.cardTitle, { color: colors.onSurface }]}>
                {requirement.label}
              </Text>
            </View>
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{requirement.hint}</Text>

            {requirement.kinds.length > 1 ? (
              <View style={styles.kindChips}>
                <ChipSelect
                  options={kindOptions}
                  value={kindToUpload(requirement)}
                  onChange={(kind) => setChosenKind((current) => ({ ...current, [requirement.id]: kind }))}
                />
              </View>
            ) : null}

            {presentKind ? (
              <View style={styles.presentRow}>
                {previewUri ? <Image source={{ uri: previewUri }} style={styles.preview} /> : null}
                <Text style={[typography.bodyMedium, { color: colors.success }]}>
                  Cargado · {DOCUMENT_KIND_LABELS[presentKind]}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button
                label={presentKind ? 'Reemplazar' : 'Subir foto'}
                variant="outlined"
                size="compact"
                icon="camera-outline"
                onPress={() => handleUpload(requirement)}
                loading={isBusy}
              />
              {presentKind ? (
                <Button
                  label="Quitar"
                  variant="text"
                  size="compact"
                  onPress={() => handleRemove(requirement)}
                  disabled={isBusy}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    flex: 1,
  },
  kindChips: {
    marginTop: spacing.sm,
  },
  presentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  preview: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
