import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { PhotoUploader, type UploadedPhoto } from '@/components/ui/PhotoUploader';
import { getParkingErrorMessage } from '@/features/parking/api';
import { MAX_PARKING_IMAGES } from '@/features/parking/types';
import { DUPLICATE_PHOTO_MESSAGE, fingerprintImage } from '@/lib/imageFingerprint';
import { assertImageUploadable } from '@/lib/imageMime';

/** Foto elegida pero todavía no subida: vive en memoria hasta que se publica la cochera. */
export type DraftPhoto = UploadedPhoto & { fingerprint: string };

type Props = {
  photos: DraftPhoto[];
  onChange: (next: DraftPhoto[]) => void;
};

/**
 * Fotos del asistente de publicación mientras la cochera todavía no existe. Nada se sube acá:
 * las fotos se guardan (URI local + huella) y se suben todas juntas al terminar el último paso.
 * `ImageManager` hace lo mismo contra una cochera ya creada.
 */
export function DraftImageManager({ photos, onChange }: Props) {
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAdd = async () => {
    setErrorMessage(null);
    if (photos.length >= MAX_PARKING_IMAGES) {
      setErrorMessage(`Ya llegaste al máximo de ${MAX_PARKING_IMAGES} fotos.`);
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Necesitamos permiso para acceder a tus fotos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [4, 3],
      });
      if (result.canceled || !result.assets[0]) return;

      const { uri, fileSize } = result.assets[0];
      assertImageUploadable(uri, fileSize);

      setIsChecking(true);
      const fingerprint = await fingerprintImage(uri);
      if (photos.some((photo) => photo.fingerprint === fingerprint)) {
        setErrorMessage(DUPLICATE_PHOTO_MESSAGE);
        return;
      }
      onChange([...photos, { id: uri, publicUrl: uri, fingerprint }]);
    } catch (error) {
      setErrorMessage(`No se pudo agregar la foto: ${getParkingErrorMessage(error)}`);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <PhotoUploader
      label="Fotografías"
      photos={photos}
      onAdd={handleAdd}
      onRemove={(photo) => onChange(photos.filter((p) => p.id !== photo.id))}
      max={MAX_PARKING_IMAGES}
      isUploading={isChecking}
      errorMessage={errorMessage}
    />
  );
}
