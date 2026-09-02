import { Platform, type ViewStyle } from 'react-native';

// Sombras del sistema de diseño. Antes no había ninguna en toda la app: las tarjetas se
// separaban del fondo solo con un borde de 1px.
//
// React Native no tiene una API única, así que cada plataforma usa la suya:
//   - Android: `elevation` (además determina el orden de apilado).
//   - Web: `boxShadow`. react-native-web todavía acepta las props `shadow*`, pero desde la
//     versión 0.21 avisa que están deprecadas, así que se le pasa el valor CSS directo.
//   - iOS: las props `shadow*`.

type ShadowSpec = {
  /** Valor de elevation para Android. */
  elevation: number;
  /** Opacidad de la sombra en iOS y web. */
  opacity: number;
  /** Difuminado de la sombra en iOS y web. */
  blur: number;
  /** Desplazamiento vertical en iOS y web. */
  offsetY: number;
};

function build({ elevation, opacity, blur, offsetY }: ShadowSpec): ViewStyle {
  if (Platform.OS === 'android') return { elevation };

  if (Platform.OS === 'web') {
    return { boxShadow: `0px ${offsetY}px ${blur}px rgba(0, 0, 0, ${opacity})` } as ViewStyle;
  }

  return {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: blur,
  };
}

export const shadows = {
  /** Sin sombra. Útil para apagar la sombra de un componente vía prop. */
  none: {} as ViewStyle,
  /** Tarjetas en reposo: listas de estacionamientos, reservas, vehículos, notificaciones.
   *  Valores tomados del `shadow-card` del Figma: `0 4px 15px rgba(0, 0, 0, 0.05)`. */
  card: build({ elevation: 2, opacity: 0.05, blur: 15, offsetY: 4 }),
  /** Elementos que flotan sobre el contenido: FAB, tarjeta inferior sobre el mapa. */
  raised: build({ elevation: 6, opacity: 0.1, blur: 16, offsetY: 4 }),
  /** Diálogos y hojas modales. */
  overlay: build({ elevation: 12, opacity: 0.16, blur: 24, offsetY: 8 }),
} as const;

export type Shadows = typeof shadows;
