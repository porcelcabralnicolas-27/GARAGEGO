import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { radius, spacing, useTheme } from '@/theme';

export type UploadedPhoto = {
  id: string;
  publicUrl: string;
};

type PhotoUploaderProps = {
  label: string;
  photos: UploadedPhoto[];
  onAdd: () => void;
  onRemove: (photo: UploadedPhoto) => void;
  /** Máximo de fotos permitidas. Al alcanzarlo se oculta el botón de agregar. */
  max?: number;
  isLoading?: boolean;
  isUploading?: boolean;
  errorMessage?: string | null;
};

// Componente puramente visual (sección 30 de la especificación). Unifica los dos gestores de
// fotos que existían —uno para estacionamientos y otro para vehículos— que eran casi idénticos
// y solo diferían en el bucket y las funciones de API que llamaban.
//
// La lógica de datos queda del lado de cada módulo: este componente solo recibe las fotos y
// avisa cuándo agregar o quitar.
export function PhotoUploader({
  label,
  photos,
  onAdd,
  onRemove,
  max,
  isLoading,
  isUploading,
  errorMessage,
}: PhotoUploaderProps) {
  const { colors, typography } = useTheme();
  const canAddMore = max === undefined || photos.length < max;

  return (
    <View>
      <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: spacing.sm }]}>
        {label}
        {max !== undefined ? ` (${photos.length}/${max})` : ''}
      </Text>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.thumbWrapper}>
              <Image source={{ uri: photo.publicUrl }} style={styles.thumb} />
              <Pressable
                onPress={() => onRemove(photo)}
                accessibilityRole="button"
                accessibilityLabel="Quitar foto"
                hitSlop={6}
                style={[styles.removeButton, { backgroundColor: colors.error }]}
              >
                <Ionicons name="close" size={14} color={colors.onError} />
              </Pressable>
            </View>
          ))}

          {canAddMore ? (
            <Pressable
              onPress={onAdd}
              disabled={isUploading}
              accessibilityRole="button"
              accessibilityLabel="Agregar foto"
              style={[styles.addButton, { borderColor: colors.outline }]}
            >
              {isUploading ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={22} color={colors.onSurfaceVariant} />
                  <Text style={[typography.label, styles.addLabel, { color: colors.onSurfaceVariant }]}>
                    Subir
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.sm,
  },
  thumbWrapper: {
    marginRight: spacing.md,
  },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 88,
    height: 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    marginTop: spacing.xs,
  },
});
