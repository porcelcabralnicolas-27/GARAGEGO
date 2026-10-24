// Paleta GarageGo — verde lima, según las pantallas de Figma.
//
// Fuente: el `tailwind.config` embebido en el código exportado del Figma define la paleta
// de marca de forma explícita (brand.green #bdd655, dark #333333, gray #888888,
// lightGray #f8f9fa, bg #fafafa). El export contiene variantes cercanas del verde
// (#C3D94E, #C7D94F, #AACC44…) que son ruido del generador: #BDD655 es el canónico,
// con 38 apariciones contra 3 de la siguiente.
//
// Se conservan los nombres de token que ya usaba el proyecto (convención Material:
// `onSurface`, `outline`, `surfaceVariant`) en vez de renombrarlos: son 65 archivos
// consumiendo estos nombres y el renombre no aporta nada funcional.
//
// ── Desviación deliberada del Figma: contraste ──────────────────────────────────────
// El lima de marca es muy claro (luminancia relativa 0.60). El Figma lo combina con
// texto blanco (`bg-brand-green text-white`) y lo usa como color de texto sobre blanco
// (`text-brand-green`); ambas combinaciones dan ~1.6:1, muy por debajo del mínimo AA de
// 4.5:1 — es visible en el propio mockup, donde el botón "ACCEDER" se lee lavado.
// Por eso el lima exacto se conserva para RELLENOS (`primary`), pero:
//   - `onPrimary` es texto oscuro, no blanco  → 10.1:1
//   - `accent` (texto/íconos de marca sobre fondo claro) es un lima oscurecido → 5.5:1
// Para volver al Figma literal alcanza con poner `onPrimary: '#FFFFFF'` y `accent: primary`.
export const lightColors = {
  /** Verde lima de marca. Solo para rellenos: botones, pines, chips, indicadores. */
  primary: '#BDD655',
  /** Texto/íconos sobre `primary`. Oscuro por contraste (ver nota arriba). */
  onPrimary: '#1A1A2E',
  /** Fondo lima muy claro para chips y contenedores destacados. */
  primaryContainer: '#EDF3D5',
  onPrimaryContainer: '#46530F',
  /** Color de marca para TEXTO e íconos sobre fondos claros: links, precios, tabs activos. */
  accent: '#6E8419',
  /** `brand.bg` del Figma. */
  background: '#FAFAFA',
  onBackground: '#333333',
  surface: '#FFFFFF',
  /** `brand.dark` del Figma. Equivale a `textPrimary`. */
  onSurface: '#333333',
  /** Fondo de controles secundarios (p. ej. el botón de volver). Equivale a `surfaceAlt`. */
  surfaceVariant: '#F3F4F6',
  /** Texto secundario. Equivale a `textSecondary`. El Figma alterna #888888 y #6B7280;
   *  se toma el más oscuro de los dos, que es el único que alcanza AA (5.3:1). */
  onSurfaceVariant: '#6B7280',
  /** Bordes y separadores. Equivale a `border`. */
  outline: '#E5E7EB',
  /** Borde de elementos enfocados o seleccionados. */
  outlineFocus: '#BDD655',
  /** Fondo de barras de progreso y pistas de controles. */
  track: '#E5E7EB',
  /** Fondo de overlays de modales y diálogos. */
  overlay: 'rgba(0,0,0,0.5)',
  error: '#EF4444',
  onError: '#FFFFFF',
  success: '#3BCA6B',
} as const;

// Paleta oscura: fuera de alcance por ahora. El Figma solo define la paleta clara, así que
// `useTheme()` devuelve siempre `lightColors` (ver theme/index.ts). Se conserva esta
// definición para poder reactivar el modo oscuro sin rehacer el trabajo: alcanza con volver
// a leer el esquema del sistema en useTheme. Sobre fondo oscuro el lima sí tiene contraste
// suficiente, así que acá `accent` es el verde de marca sin oscurecer.
export const darkColors: ThemeColors = {
  primary: '#BDD655',
  onPrimary: '#1A1A2E',
  primaryContainer: '#46530F',
  onPrimaryContainer: '#EDF3D5',
  accent: '#BDD655',
  background: '#141221',
  onBackground: '#E8E8EA',
  surface: '#1A1A2E',
  onSurface: '#E8E8EA',
  surfaceVariant: '#2A2A3E',
  onSurfaceVariant: '#A0A0AE',
  outline: '#3A3A4E',
  outlineFocus: '#BDD655',
  track: '#3A3A4E',
  overlay: 'rgba(0,0,0,0.6)',
  error: '#FF6B6B',
  onError: '#1A1A2E',
  success: '#4ADE80',
};

// Los valores se tipan como string y no como literales: `lightColors` usa `as const` para
// que el objeto sea inmutable, pero cualquier paleta con las mismas claves es válida.
export type ThemeColors = Record<keyof typeof lightColors, string>;
