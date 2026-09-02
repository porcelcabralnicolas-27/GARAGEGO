// Escala de espaciado del sistema de diseño (sección 6 de la especificación).
// Usar estos tokens en vez de números sueltos en los StyleSheet: el código tenía
// valores fuera de escala (2, 10, 14, 20) que rompían la consistencia visual.
export const spacing = {
  /** Separación mínima: entre un ícono y su texto, o una etiqueta y su valor. */
  xs: 4,
  /** Separación interna pequeña: padding de chips, gaps dentro de una fila. */
  sm: 8,
  /** Separación de controles: entre botones, entre campos de un formulario. */
  md: 12,
  /** Padding estándar: márgenes laterales de pantalla, padding de tarjetas. */
  lg: 16,
  /** Separación entre bloques de contenido dentro de una misma sección. */
  xl: 24,
  /** Separación entre secciones de una pantalla. */
  xxl: 32,
} as const;

export type Spacing = typeof spacing;
