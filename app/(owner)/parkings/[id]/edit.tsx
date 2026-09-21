import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { deleteParkingLot, getParkingErrorMessage, getParkingLot } from '@/features/parking/api';
import { ParkingListingWizard } from '@/features/parking/ParkingListingWizard';
import type { ParkingLot } from '@/features/parking/types';
import { spacing, useTheme } from '@/theme';

export default function EditParkingScreen() {
  const { colors, typography } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [lot, setLot] = useState<ParkingLot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getParkingLot(id)
      .then(setLot)
      .catch(() => setErrorMessage('No se pudo cargar la publicación.'));
  }, [id]);

  if (errorMessage) {
    return (
      <Screen>
        <Banner message={errorMessage} />
      </Screen>
    );
  }

  if (!lot) {
    return (
      <Screen>
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>Cargando…</Text>
      </Screen>
    );
  }

  // Una publicación rechazada es definitiva: no se puede editar ni volver a enviar a revisión
  // (el trigger `parking_lots_protect_moderation` lo garantiza del lado del servidor). Solo
  // queda eliminarla y, si corresponde, crear una nueva.
  if (lot.approvalStatus === 'rejected') {
    return <RejectedListingNotice lot={lot} />;
  }

  return <ParkingListingWizard mode="edit" lot={lot} />;
}

function RejectedListingNotice({ lot }: { lot: ParkingLot }) {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteParkingLot(lot.id);
      router.replace('/(owner)/parkings');
    } catch (error) {
      setErrorMessage(getParkingErrorMessage(error));
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Publicación rechazada" onBack={() => router.replace('/(owner)/parkings')} />

      {errorMessage ? <Banner message={errorMessage} /> : null}

      <Text style={[typography.titleMedium, { color: colors.onSurface, marginBottom: spacing.xs }]}>
        {lot.name}
      </Text>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: spacing.lg }]}>
        {lot.address}
      </Text>

      <View style={[styles.reasonBox, { borderColor: colors.outline }]}>
        <Text style={[typography.label, { color: colors.error, marginBottom: spacing.xs }]}>
          MOTIVO DEL RECHAZO
        </Text>
        <Text style={[typography.bodyMedium, { color: colors.onSurface }]}>
          {lot.rejectionReason ?? 'El equipo no dejó un detalle.'}
        </Text>
      </View>

      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: spacing.lg }]}>
        Esta publicación no se puede modificar ni volver a enviar a revisión. Si querés intentarlo
        de nuevo, eliminala y creá una nueva.
      </Text>

      <Button label="Eliminar publicación" variant="outlined" onPress={() => setConfirmDelete(true)} />

      <ConfirmDialog
        visible={confirmDelete}
        title="Eliminar publicación"
        message="¿Seguro que querés eliminar este estacionamiento? Deja de publicarse y no se puede deshacer. Si ya tuvo reservas, su historial se conserva."
        confirmLabel="Eliminar"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reasonBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
});
