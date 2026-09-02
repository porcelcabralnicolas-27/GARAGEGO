import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { radius, spacing, useTheme } from '@/theme';

import type { Vehicle } from './types';

export function VehicleListItem({
  vehicle,
  imageUrl,
  onEdit,
  onDelete,
}: {
  vehicle: Vehicle;
  imageUrl?: string | null;
  /** Opcional: en las pantallas sin flujo de edición la fila no es pulsable. */
  onEdit?: () => void;
  onDelete: () => void;
}) {
  const { colors, typography } = useTheme();

  const details = [vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ');

  return (
    <Card onPress={onEdit} padding="md" accessibilityLabel={`Vehículo ${vehicle.plate}`}>
      <View style={styles.row}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.primaryContainer }]}>
            <Ionicons name="car" size={24} color={colors.onPrimaryContainer} />
          </View>
        )}

        <View style={styles.info}>
          <Text style={[typography.titleMedium, { color: colors.onSurface }]}>{vehicle.plate}</Text>
          {details ? (
            <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{details}</Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          {onEdit ? (
            <IconButton
              name="pencil-outline"
              onPress={onEdit}
              accessibilityLabel={`Editar vehículo ${vehicle.plate}`}
            />
          ) : null}
          <IconButton
            name="trash-outline"
            onPress={onDelete}
            accessibilityLabel={`Eliminar vehículo ${vehicle.plate}`}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    marginRight: spacing.lg,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
