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

/** Mismo límite que la migración 0058 (`storage.buckets.file_size_limit`, `allowed_mime_types`)
 *  para las fotos de cochera y de vehículo. Se valida acá ANTES de subir, además de en el
 *  bucket, para no gastar el upload en un archivo que el servidor va a rechazar igual. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const ALLOWED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Valida una imagen elegida en el picker antes de subirla.
 *
 * `fileSizeBytes` es el `fileSize` que devuelve expo-image-picker: no siempre está disponible
 * (algunos `blob:` de web no lo traen), así que si es `undefined` se salta el chequeo de
 * tamaño y queda el bucket como única red. Tira un `Error` con mensaje en español, listo para
 * mostrar (los `get*ErrorMessage` de cada feature lo dejan pasar tal cual).
 */
export function assertImageUploadable(localUri: string, fileSizeBytes: number | undefined | null): void {
  const { contentType } = guessImageContentType(localUri);
  if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
    throw new Error('Ese tipo de archivo no está permitido. Usá una foto JPG, PNG o WEBP.');
  }
  if (typeof fileSizeBytes === 'number' && fileSizeBytes > MAX_IMAGE_BYTES) {
    throw new Error('La foto pesa demasiado. El máximo es 5 MB.');
  }
}
