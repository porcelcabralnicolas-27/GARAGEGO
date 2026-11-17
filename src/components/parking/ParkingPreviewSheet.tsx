import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { Button } from '@/components/ui/Button';
import { formatPricePerHour } from '@/lib/money';
import { IconButton } from '@/components/ui/IconButton';
import { LOT_TYPE_LABELS, type ParkingLotWithDistance } from '@/features/parking/types';
import { radius, shadows, spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

type ParkingPreviewSheetProps = {
  lot: ParkingLotWithDistance;
  /** Si se puede usar ahora mismo. `undefined` = se desconoce y no se muestra nada. */
  isAvailableNow?: boolean;
  onClose: () => void;
  onViewDetail: () => void;
  onBook: () => void;
  /** Para que el mapa nativo sepa cuánto tapa la hoja al acercarse a la cochera. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

// Hoja que aparece sobre el mapa al elegir un estacionamiento.
//
// Sigue la pantalla "Reserva tu lugar" del Figma (anclada abajo a todo el ancho, redondeada solo
// arriba), en una versión compacta: tiene que dejar ver el pin y su cartel en el mapa de arriba.
// Por eso los datos van sin recuadro y las dos acciones comparten una fila. Conserva rating y
// distancia (el criterio con el que se elige entre un estacionamiento y otro) y "Ver detalle", el
// único acceso a la ficha completa desde el mapa.
//
// Vive acá y no dentro de la pantalla de Inicio porque la usan las dos versiones del mapa,
// la nativa y la web, que son archivos separados.
export function ParkingPreviewSheet({
  lot,
  isAvailableNow,
  onClose,
  onViewDetail,
  onBook,
  onLayout,
}: ParkingPreviewSheetProps) {
  const { colors, typography } = useTheme();

  return (
    // El testID lo usa el mapa web (y onLayout el nativo) para saber cuánto tapa la hoja al
    // acercarse a la cochera.
    <View
      testID="parking-preview-sheet"
      onLayout={onLayout}
      style={[styles.sheet, shadows.raised, { backgroundColor: colors.surface }]}
    >
      <View style={styles.header}>
        <Text style={[typography.label, styles.title, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {t('Reserva tu lugar').toUpperCase()}
        </Text>
        <IconButton name="close" size={18} onPress={onClose} accessibilityLabel={t('Cerrar')} />
      </View>

      <View style={styles.nameRow}>
        <Text style={[typography.titleMedium, styles.name, { color: colors.onSurface }]} numberOfLines={1}>
          {lot.name}
        </Text>
        <Text style={[typography.titleMedium, { color: colors.accent }]}>{formatPricePerHour(lot.pricePerHour)}</Text>
      </View>
      <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
        {lot.address}
      </Text>

      <View style={styles.metaRow}>
        <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{LOT_TYPE_LABELS[lot.lotType]}</Text>
        <View style={styles.meta}>
          <Ionicons name="star" size={13} color={colors.onSurfaceVariant} />
          <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{lot.ratingAvg.toFixed(1)}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="navigate-outline" size={13} color={colors.onSurfaceVariant} />
          <Text style={[typography.label, { color: colors.onSurfaceVariant }]}>{lot.distanceKm.toFixed(1)} km</Text>
        </View>
      </View>

      {isAvailableNow !== undefined ? (
        <View style={styles.availability}>
          <View
            style={[styles.availabilityDot, { backgroundColor: isAvailableNow ? colors.success : colors.onSurfaceVariant }]}
          />
          <Text
            style={[typography.label, styles.availabilityText, { color: isAvailableNow ? colors.accent : colors.onSurfaceVariant }]}
            numberOfLines={1}
          >
            {isAvailableNow ? t('Disponible ahora') : t('No disponible ahora · podés reservar para más tarde')}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label={t('Ver detalle')} variant="outlined" onPress={onViewDetail} />
        </View>
        <View style={styles.action}>
          <Button label={t('Continuar')} onPress={onBook} />
        </View>
      </View>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  availability: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  availabilityText: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
});
