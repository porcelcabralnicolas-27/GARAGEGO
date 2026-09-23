import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { PhotoUploader, type UploadedPhoto } from '@/components/ui/PhotoUploader';
import {
  deleteParkingImage,
  getParkingErrorMessage,
  listParkingImages,
  uploadParkingImage,
} from '@/features/parking/api';
import { MAX_PARKING_IMAGES, type ParkingImage } from '@/features/parking/types';
import { assertImageUploadable } from '@/lib/imageMime';

export function ImageManager({ ownerId, parkingLotId }: { ownerId: string; parkingLotId: string }) {
  const [images, setImages] = useState<ParkingImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    listParkingImages(parkingLotId)
      .then(setImages)
      .catch(() => setErrorMessage('No se pudieron cargar las fotos.'))
      .finally(() => setIsLoading(false));
  }, [parkingLotId]);

  const handleAddImage = async () => {
    setErrorMessage(null);
    if (images.length >= MAX_PARKING_IMAGES) {
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

      assertImageUploadable(result.assets[0].uri, result.assets[0].fileSize);

      setIsUploading(true);
      const image = await uploadParkingImage({
        ownerId,
        parkingLotId,
        localUri: result.assets[0].uri,
        position: images.length,
      });
      setImages((prev) => [...prev, image]);
    } catch (error) {
      setErrorMessage(`No se pudo subir la foto: ${getParkingErrorMessage(error)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async (photo: UploadedPhoto) => {
    const image = images.find((i) => i.id === photo.id);
    if (!image) return;

    setErrorMessage(null);
    try {
      await deleteParkingImage(image);
      setImages((prev) => prev.filter((i) => i.id !== image.id));
    } catch (error) {
      setErrorMessage(`No se pudo eliminar la foto: ${getParkingErrorMessage(error)}`);
    }
  };

  return (
    <PhotoUploader
      label="Fotografías"
      photos={images}
      onAdd={handleAddImage}
      onRemove={handleRemoveImage}
      max={MAX_PARKING_IMAGES}
      isLoading={isLoading}
      isUploading={isUploading}
      errorMessage={errorMessage}
    />
  );
}
