import { useColorScheme } from 'react-native';

import { darkColors, lightColors } from './colors';
import { typography } from './typography';

export { typography };

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return { colors, typography, scheme: scheme ?? 'light' };
}
