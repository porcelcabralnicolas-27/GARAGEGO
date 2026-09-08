/**
 * Fotos de las cocheras, como data URIs SVG generados en el momento.
 *
 * Por qué y no imágenes reales: no hace falta red (la demo anda offline), no entran binarios al
 * repo, y cada cochera tiene una imagen distinta y estable derivada de su nombre.
 */

const PALETTE = [
  ['#4b5563', '#1f2937'],
  ['#475569', '#0f172a'],
  ['#57534e', '#292524'],
  ['#3f6212', '#1a2e05'],
  ['#1e40af', '#172554'],
  ['#7c2d12', '#431407'],
] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Imagen de relleno determinista: mismo `seed` → siempre la misma imagen.
 * `label` va escrito encima para poder distinguir de un vistazo la foto 1 de la 2.
 */
export function placeholderImage(seed: string, label: string): string {
  const h = hash(seed);
  const [from, to] = PALETTE[h % PALETTE.length];
  const angle = h % 90;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#g)"/>
  <g fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="3">
    <rect x="120" y="120" width="400" height="170" rx="6"/>
    <line x1="120" y1="205" x2="520" y2="205"/>
  </g>
  <text x="320" y="322" fill="rgba(255,255,255,0.82)" font-family="system-ui, sans-serif"
        font-size="20" font-weight="600" text-anchor="middle">${escapeXml(label)}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
