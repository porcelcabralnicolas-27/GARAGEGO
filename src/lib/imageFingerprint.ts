/**
 * Huella del contenido de una imagen, para detectar la misma foto cargada dos veces.
 *
 * Se compara el contenido y no el nombre ni la URI: el selector de imágenes copia cada foto a un
 * archivo temporal con nombre nuevo, así que la misma foto elegida dos veces llega con URIs
 * distintas. No es un hash criptográfico (no hace falta: acá no hay un atacante, solo un
 * descuido del usuario); es un hash de 64 bits más el largo en bytes, con colisiones
 * despreciables para las 3 fotos de una cochera.
 */
export function hashBytes(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${bytes.length}-${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}

/** Lee la imagen (URI local o URL pública) y devuelve su huella. Igual que al subirla, usa
 *  fetch + arrayBuffer porque funciona en web y en nativo. */
export async function fingerprintImage(uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`No se pudo leer la imagen (${response.status}).`);
  return hashBytes(new Uint8Array(await response.arrayBuffer()));
}

export const DUPLICATE_PHOTO_MESSAGE = 'Esa foto ya está cargada. Las fotos tienen que ser todas distintas.';
