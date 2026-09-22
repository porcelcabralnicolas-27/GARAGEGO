/**
 * Extensión y content-type para subir una foto (de cochera o de vehículo) a Storage, a partir
 * de la URI local que devuelve el selector de imágenes.
 *
 * `jpg` es una extensión de archivo válida pero NO es un tipo MIME: el tipo correcto es
 * `image/jpeg`. Mandar `image/jpg` como `contentType` es nombre no estándar — casi todo lo
 * acepta igual, pero no es lo que dice la especificación, así que se normaliza acá.
 */
export function guessImageContentType(localUri: string): { extension: string; contentType: string } {
  const match = /\.(\w+)$/.exec(localUri);
  const extension = (match ? match[1] : 'jpg').toLowerCase();
  const contentType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
  return { extension, contentType };
}
