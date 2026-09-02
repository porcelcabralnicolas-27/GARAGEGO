// Radios de borde del sistema de diseño, según las pantallas de Figma.
//
// El Figma usa una escala más ancha que los 3 valores que definía el documento de
// especificación, y sobre todo la usa distinto: los botones son píldoras (`rounded-full`)
// y los inputs de autenticación son muy redondeados (`rounded-3xl`), no de radio medio.
// Correspondencia con las clases Tailwind del export:
//   sm  → rounded-lg   (chips, badges, etiquetas de precio)
//   md  → rounded-xl   (botón de volver, controles chicos)
//   lg  → rounded-2xl  (tarjetas de lista)
//   xl  → rounded-3xl  (inputs, hojas inferiores, contenedores grandes)
//   pill→ rounded-full (botones de acción, avatares, indicadores)
export const radius = {
  /** Chips, badges, etiquetas de precio. */
  sm: 8,
  /** Controles chicos: botón de volver, íconos con fondo. */
  md: 12,
  /** Tarjetas de lista: reservas, vehículos, conversaciones. */
  lg: 16,
  /** Inputs, hojas inferiores y contenedores grandes. */
  xl: 24,
  /** Botones de acción, avatares, indicadores circulares. */
  pill: 9999,
} as const;

export type Radius = typeof radius;
