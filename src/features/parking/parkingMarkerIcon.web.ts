// Ícono de marcador personalizado (pin con "P") para los mapas de Google en web.
// Requiere que la API de Google Maps ya esté cargada (usar solo cuando isLoaded === true).
export function buildParkingMarkerIcon(colorHex: string): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
      <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.06 27.94 0 18 0z" fill="${colorHex}"/>
      <circle cx="18" cy="18" r="12" fill="#ffffff"/>
      <text x="18" y="23.5" font-family="Arial, sans-serif" font-size="15" font-weight="bold" text-anchor="middle" fill="${colorHex}">P</text>
    </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 46),
    anchor: new google.maps.Point(18, 46),
  };
}
