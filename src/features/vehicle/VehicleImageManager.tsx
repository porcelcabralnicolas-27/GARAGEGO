import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { PhotoUploader, type UploadedPhoto } from '@/components/ui/PhotoUploader';
import { queryKeys } from '@/lib/queryKeys';

import { deleteVehicleImage, getVehicleErrorMessage, listVehicleImages, uploadVehicleImage } from './api';
import type { VehicleImage } from './types';

export function VehicleImageManager({ ownerId, vehicleId }: { ownerId: string; vehicleId: string }) {
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // La foto de portada de "Mis vehículos" sale de una query aparte, cuya clave son los ids de
  // los vehículos: agregar o borrar fotos no cambia esos ids, así que hay que invalidarla a
  // mano para que la lista no quede mostrando la portada vieja.
  const refreshCovers = () => queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });

  useEffect(() => {
    listVehicleImages(vehicleId)
      .then(setImages)
      .catch(() => setErrorMessage('No se pudieron cargar las fotos.'))
      .finally(() => setIsLoading(false));
  }, [vehicleId]);

  const handleAddImage = async () => {
    setErrorMessage(null);
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

      setIsUploading(true);
      const image = await uploadVehicleImage({
        ownerId,
        vehicleId,
        localUri: result.assets[0].uri,
        position: images.length,
      });
      setImages((prev) => [...prev, image]);
      refreshCovers();
    } catch (error) {
      setErrorMessage(`No se pudo subir la foto: ${getVehicleErrorMessage(error)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async (photo: UploadedPhoto) => {
    const image = images.find((i) => i.id === photo.id);
    if (!image) return;

    setErrorMessage(null);
    try {
      await deleteVehicleImage(image);
      setImages((prev) => prev.filter((i) => i.id !== image.id));
      refreshCovers();
    } catch (error) {
      setErrorMessage(`No se pudo eliminar la foto: ${getVehicleErrorMessage(error)}`);
    }
  };

  return (
    <PhotoUploader
      label="Fotos del vehículo"
      photos={images}
      onAdd={handleAddImage}
      onRemove={handleRemoveImage}
      isLoading={isLoading}
      isUploading={isUploading}
      errorMessage={errorMessage}
    />
  );
}
