import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';

import { PhotoUploader, type UploadedPhoto } from '@/components/ui/PhotoUploader';
import {
  deleteParkingImage,
  getParkingErrorMessage,
  listParkingImages,
  uploadParkingImage,
} from '@/features/parking/api';
import { MAX_PARKING_IMAGES, type ParkingImage } from '@/features/parking/types';
import { DUPLICATE_PHOTO_MESSAGE, fingerprintImage } from '@/lib/imageFingerprint';
import { assertImageUploadable } from '@/lib/imageMime';
import { queryKeys } from '@/lib/queryKeys';

const NO_IMAGES: ParkingImage[] = [];

export function ImageManager({ ownerId, parkingLotId }: { ownerId: string; parkingLotId: string }) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryKey = queryKeys.parkingLots.images(parkingLotId);
  const { data: images = NO_IMAGES, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => listParkingImages(parkingLotId),
  });

  // Las fotos también salen en la ficha pública y en la portada de la lista de cocheras: se
  // invalida todo el grupo para que ninguna de esas pantallas siga mostrando las anteriores.
  const applyChange = (update: (current: ParkingImage[]) => ParkingImage[]) => {
    queryClient.setQueryData<ParkingImage[]>(queryKey, (current = []) => update(current));
    queryClient.invalidateQueries({ queryKey: queryKeys.parkingLots.all });
  };

  // Huellas de las fotos ya subidas, para no volver a bajarlas cada vez que se agrega una.
  const savedFingerprints = useRef(new Map<string, string>());

  const isDuplicateOfExisting = async (localUri: string): Promise<boolean> => {
    const candidate = await fingerprintImage(localUri);
    for (const image of images) {
      let known = savedFingerprints.current.get(image.id);
      if (!known) {
        try {
          known = await fingerprintImage(image.publicUrl);
        } catch {
          // Si una foto ya guardada no se puede leer, no se frena la subida por eso.
          continue;
        }
        savedFingerprints.current.set(image.id, known);
      }
      if (known === candidate) return true;
    }
    return false;
  };

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
      if (await isDuplicateOfExisting(result.assets[0].uri)) {
        setErrorMessage(DUPLICATE_PHOTO_MESSAGE);
        return;
      }
      const image = await uploadParkingImage({
        ownerId,
        parkingLotId,
        localUri: result.assets[0].uri,
        position: images.length,
      });
      applyChange((current) => [...current, image]);
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
      applyChange((current) => current.filter((i) => i.id !== image.id));
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
      errorMessage={errorMessage ?? (isError ? 'No se pudieron cargar las fotos.' : null)}
    />
  );
}
