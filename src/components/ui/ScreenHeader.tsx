import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing, useTheme } from '@/theme';

type ScreenHeaderProps = {
  /** Se muestra centrado y en mayúsculas. */
  title: string;
  /** Destino del botón de volver. Sin esto ni `onBack`, la fila no lleva botón. */
  backHref?: Href;
  /** Acción de volver a medida (p. ej. retroceder un paso en un asistente). Tiene prioridad
   *  sobre `backHref`. */
  onBack?: () => void;
  /** Contenido opcional del extremo derecho: un IconButton, un enlace, etc. */
  action?: ReactNode;
};

// Encabezado común de las pantallas: [volver] [TÍTULO CENTRADO] [acción].
//
// Reemplaza el patrón que estaba repetido a mano en una decena de pantallas (un BackButton
// suelto y debajo un Text con `displayLarge` alineado a la izquierda). En el Figma el título
// va centrado, chico y en mayúsculas, con el botón de volver sobre un cuadrado gris.
//
// Los dos extremos reservan siempre el mismo ancho aunque estén vacíos: así el título queda
// ópticamente centrado en la pantalla y no se corre según haya o no acción a la derecha.
export function ScreenHeader({ title, backHref, onBack, action }: ScreenHeaderProps) {
  const router = useRouter();
  const { colors, typography } = useTheme();

  const handleBack = onBack ?? (backHref ? () => router.replace(backHref) : null);

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {handleBack ? (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={8}
            style={({ pressed }) => [
              styles.back,
              { backgroundColor: colors.surfaceVariant, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
        ) : null}
      </View>

      <Text
        style={[typography.titleMedium, styles.title, { color: colors.onSurface }]}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title.toUpperCase()}
      </Text>

      <View style={[styles.side, styles.sideRight]}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  side: {
    width: 48,
    justifyContent: 'center',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  back: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    letterSpacing: 1,
  },
});
