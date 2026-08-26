// Paleta GarageGo — amarillo pastel (#FFEE8C) como color de marca, inspirada en el diseño de Figma compartido.
// Los botones usan texto oscuro sobre amarillo (no blanco) porque el amarillo pastel es muy claro
// para dar suficiente contraste con texto blanco.
export const lightColors = {
  primary: '#FFEE8C',
  onPrimary: '#332B00',
  primaryContainer: '#FFF6C9',
  onPrimaryContainer: '#4A3F00',
  // Versión más saturada/oscura del amarillo, solo para texto e íconos sobre fondos claros
  // (links, precios, tabs activos): el amarillo pastel puro no tiene contraste suficiente como texto.
  accent: '#8A6D00',
  secondary: '#8A7F55',
  onSecondary: '#FFFFFF',
  background: '#FFFDF6',
  onBackground: '#211E12',
  surface: '#FFFFFF',
  onSurface: '#211E12',
  surfaceVariant: '#F3EFDD',
  onSurfaceVariant: '#5B5540',
  outline: '#DDD5B3',
  error: '#BA1A1A',
  onError: '#FFFFFF',
  success: '#1E6B3A',
} as const;

export const darkColors = {
  primary: '#F0DE72',
  onPrimary: '#392F00',
  primaryContainer: '#544600',
  onPrimaryContainer: '#FFEE8C',
  // En modo oscuro el amarillo del botón ya tiene contraste de sobra como texto, así que coincide con primary.
  accent: '#F0DE72',
  secondary: '#D3C7A0',
  onSecondary: '#3A3320',
  background: '#18160D',
  onBackground: '#EAE6D5',
  surface: '#18160D',
  onSurface: '#EAE6D5',
  surfaceVariant: '#4B4530',
  onSurfaceVariant: '#D4CAA8',
  outline: '#9B937A',
  error: '#FFB4AB',
  onError: '#690005',
  success: '#8CD9A2',
} as const;

export type ThemeColors = typeof lightColors;
