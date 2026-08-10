// Paleta base Material Design 3. Ajustar a la identidad visual definitiva de GarageGo.
export const lightColors = {
  primary: '#2E5AAC',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D9E2FF',
  onPrimaryContainer: '#001A41',
  secondary: '#565F71',
  onSecondary: '#FFFFFF',
  background: '#FDFBFF',
  onBackground: '#1A1B1F',
  surface: '#FDFBFF',
  onSurface: '#1A1B1F',
  surfaceVariant: '#E1E2EC',
  onSurfaceVariant: '#44474F',
  outline: '#74777F',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  success: '#1E6B3A',
} as const;

export const darkColors = {
  primary: '#AEC6FF',
  onPrimary: '#002E69',
  primaryContainer: '#164094',
  onPrimaryContainer: '#D9E2FF',
  secondary: '#BEC6DC',
  onSecondary: '#283141',
  background: '#111318',
  onBackground: '#E3E2E6',
  surface: '#111318',
  onSurface: '#E3E2E6',
  surfaceVariant: '#44474F',
  onSurfaceVariant: '#C4C6D0',
  outline: '#8E9099',
  error: '#FFB4AB',
  onError: '#690005',
  success: '#8CD9A2',
} as const;

export type ThemeColors = typeof lightColors;
