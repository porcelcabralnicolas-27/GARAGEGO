import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { formatPricePerHour } from '@/lib/money';
import { IconButton } from '@/components/ui/IconButton';
import { LOT_TYPE_LABELS, type ParkingLotWithDistance } from '@/features/parking/types';
import { radius, shadows, spacing, useTheme } from '@/theme';

type ParkingPreviewSheetProps = {
  lot: ParkingLotWithDistance;
  /** Si se puede usar ahora mismo. `undefined` = se desconoce y no se muestra nada. */
  isAvailableNow?: boolean;
  onClose: () => void;
  onViewDetail: () => void;
  onBook: () => void;
};

// Hoja que aparece sobre el mapa al elegir un estacionamiento.
//
// Sigue la pantalla "Reserva tu lugar" del Figma: anclada al borde inferior a todo el ancho,
// redondeada solo arriba, con el detalle del lugar en una tarjeta delineada y una única acción
// principal. Se aparta del Figma en dos puntos, a propósito:
//   - conserva rating y distancia, que el mockup no muestra pero son el criterio con el que se
//     elige entre un estacionamiento y otro;
//   - conserva "Ver detalle" como acción secundaria, porque es el único acceso a la ficha
//     completa desde el mapa.
//
// Vive acá y no dentro de la pantalla de Inicio porque la usan las dos versiones del mapa,
// la nativa y la web, que son archivos separados.
export function ParkingPreviewSheet({ lot, isAvailableNow, onClose, onViewDetail, onBook }: ParkingPreviewSheetProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.sheet, shadows.raised, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <Text style={[typography.displayLarge, styles.title, { color: colors.onSurface }]} numberOfLines={1}>
          Reserva tu lugar
        </Text>
        <IconButton name="close" size={18} onPress={onClose} accessibilityLabel="Cerrar" />
      </View>

      <View style={[styles.detail, { borderColor: colors.outline }]}>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{LOT_TYPE_LABELS[lot.lotType]}</Text>
        <Text style={[typography.titleLarge, { color: colors.onSurface }]} numberOfLines={1}>
          {lot.name}
        </Text>
        <Text style={[typography.bodyMedium, styles.address, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {lot.address}
        </Text>

        {isAvailableNow !== undefined ? (
          <View style={styles.availability}>
            <View
              style={[
                styles.availabilityDot,
                { backgroundColor: isAvailableNow ? colors.success : colors.onSurfaceVariant },
              ]}
            />
            <Text style={[typography.label, { color: isAvailableNow ? colors.accent : colors.onSurfaceVariant }]}>
              {isAvailableNow ? 'Disponible ahora' : 'No disponible ahora · podés reservar para más tarde'}
            </Text>
          </View>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.outline }]} />

        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Ionicons name="star" size={14} color={colors.onSurfaceVariant} />
            <Text style={[typography.label, styles.metaText, { color: colors.onSurfaceVariant }]}>
              {lot.ratingAvg.toFixed(1)}
            </Text>
          </View>

          <View style={styles.meta}>
            <Ionicons name="navigate-outline" size={14} color={colors.onSurfaceVariant} />
            <Text style={[typography.label, styles.metaText, { color: colors.onSurfaceVariant }]}>
              {lot.distanceKm.toFixed(1)} km
            </Text>
          </View>

          <Text style={[typography.titleMedium, styles.price, { color: colors.accent }]}>
            {formatPricePerHour(lot.pricePerHour)}
          </Text>
        </View>
      </View>

      <Button label="Continuar" onPress={onBook} fullWidth />
      <Button label="Ver detalle" variant="text" onPress={onViewDetail} fullWidth />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    flex: 1,
  },
  detail: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  address: {
    marginTop: spacing.xs,
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: spacing.xs,
  },
  price: {
    marginLeft: 'auto',
  },
});
