import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { radius, useTheme } from '@/theme';

// Botón de volver de 48×48 con ícono de 24, según la sección 9 de la especificación.
// Antes era una fila con la palabra "Volver"; ahora es solo el ícono, así que lleva
// accessibilityLabel para que los lectores de pantalla sigan anunciándolo.
export function BackButton({ href }: { href: Href }) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.replace(href)}
      accessibilityRole="button"
      accessibilityLabel="Volver"
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
      ]}
    >
      <Ionicons name="arrow-back" size={24} color={colors.onBackground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginLeft: -12, // el ícono queda alineado con el margen de la pantalla, no la caja táctil
    marginBottom: 8,
  },
});
