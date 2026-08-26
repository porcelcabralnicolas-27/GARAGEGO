import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { useTheme } from '@/theme';

import { deleteVehicleImage, listVehicleImages, uploadVehicleImage } from './api';
import type { VehicleImage } from './types';

export function VehicleImageManager({ ownerId, vehicleId }: { ownerId: string; vehicleId: string }) {
  const { colors, typography } = useTheme();
  const [images, setImages] = useState<VehicleImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    } catch (error) {
      setErrorMessage(
        error && typeof error === 'object' && 'message' in error
          ? `No se pudo subir la foto: ${String((error as { message: unknown }).message)}`
          : 'No se pudo subir la foto. Intenta nuevamente.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async (image: VehicleImage) => {
    setErrorMessage(null);
    try {
      await deleteVehicleImage(image);
      setImages((prev) => prev.filter((i) => i.id !== image.id));
    } catch {
      setErrorMessage('No se pudo eliminar la foto.');
    }
  };

  return (
    <View>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Fotos del vehículo</Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {images.map((image) => (
            <View key={image.id} style={styles.thumbWrapper}>
              <Image source={{ uri: image.publicUrl }} style={styles.thumb} />
              <Pressable
                onPress={() => handleRemoveImage(image)}
                style={[styles.removeButton, { backgroundColor: colors.error }]}
              >
                <Ionicons name="close" size={14} color={colors.onError} />
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={handleAddImage}
            disabled={isUploading}
            style={[styles.addButton, { borderColor: colors.outline }]}
          >
            {isUploading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Ionicons name="add" size={28} color={colors.onSurfaceVariant} />
            )}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 8,
  },
  thumbWrapper: {
    marginRight: 10,
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 88,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
