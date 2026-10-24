// Escala tipográfica del sistema de diseño (sección 5 de la especificación).
//
// Con fuentes propias, React Native no deriva los pesos: `fontWeight: '600'` sobre una familia
// custom se ignora o falla según la plataforma. Por eso cada estilo nombra la familia exacta
// del peso que necesita (Inter_400Regular, Inter_600SemiBold, Inter_700Bold), que es como se
// registran en app/_layout.tsx.
export const fontFamilies = {
  regular: 'Inter_400Regular',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography = {
  /** Título principal de pantalla. */
  displayLarge: { fontFamily: fontFamilies.bold, fontSize: 34, lineHeight: 42 },
  /** Subtítulo y títulos de diálogo. */
  titleLarge: { fontFamily: fontFamilies.semiBold, fontSize: 22, lineHeight: 28 },
  /** Título de tarjeta y etiquetas de botón. */
  titleMedium: { fontFamily: fontFamilies.semiBold, fontSize: 17, lineHeight: 24 },
  /** Texto de cuerpo y contenido de inputs. */
  bodyLarge: { fontFamily: fontFamilies.regular, fontSize: 16, lineHeight: 24 },
  /** Texto secundario: descripciones, direcciones, metadatos. */
  bodyMedium: { fontFamily: fontFamilies.regular, fontSize: 15, lineHeight: 22 },
  /** Etiquetas de formulario y metadata pequeña. */
  label: { fontFamily: fontFamilies.semiBold, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
} as const;
