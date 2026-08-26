import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

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
    <Pressable
      onPress={onEdit}
      disabled={!onEdit}
      style={[styles.container, { backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]}
    >
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
          <Pressable onPress={onEdit} hitSlop={8} style={styles.actionButton}>
            <Ionicons name="pencil-outline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        <Pressable onPress={onDelete} hitSlop={8} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={20} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  image: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 12,
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
    gap: 16,
  },
  actionButton: {
    padding: 2,
  },
});
