import { lightColors } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

export { typography, spacing, radius, shadows };
export type { ThemeColors } from './colors';

export function useTheme() {
  // Modo oscuro fuera de alcance: la especificación de Figma solo define la paleta clara,
  // así que la app se muestra siempre en claro sin importar el tema del sistema.
  // Para reactivarlo: leer useColorScheme() de react-native y elegir entre lightColors y
  // darkColors (que ya está migrada a la paleta azul en colors.ts).
  return { colors: lightColors, typography, spacing, radius, shadows };
}
