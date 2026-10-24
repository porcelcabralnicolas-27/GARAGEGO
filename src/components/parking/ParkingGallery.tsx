import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { ParkingImage } from '@/features/parking/types';
import { radius, spacing, useTheme } from '@/theme';

type ParkingGalleryProps = {
  images: ParkingImage[];
  height?: number;
};

// Carrusel de las fotos de la cochera: una por pantalla, a todo el ancho, con un contador y
// puntos para saltar a cada una. En web (sin gesto de deslizar con el mouse) se suman flechas.
export function ParkingGallery({ images, height = 220 }: ParkingGalleryProps) {
  const { colors, typography } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <View style={[styles.placeholder, { height, backgroundColor: colors.primaryContainer }]}>
        <Ionicons name="car" size={40} color={colors.onPrimaryContainer} />
      </View>
    );
  }

  const goTo = (target: number) => {
    const next = Math.min(Math.max(target, 0), images.length - 1);
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={[styles.container, { height }]} onLayout={handleLayout}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          accessibilityLabel={`Fotos de la cochera, ${images.length}`}
        >
          {images.map((image) => (
            <Image key={image.id} source={{ uri: image.publicUrl }} style={{ width, height }} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : null}

      {images.length > 1 ? (
        <>
          <View style={[styles.counter, { backgroundColor: colors.overlay }]}>
            <Text style={[typography.label, { color: '#FFFFFF' }]}>
              {index + 1} / {images.length}
            </Text>
          </View>

          {index > 0 ? (
            <Pressable
              onPress={() => goTo(index - 1)}
              accessibilityRole="button"
              accessibilityLabel="Foto anterior"
              style={[styles.arrow, styles.arrowLeft, { backgroundColor: colors.overlay }]}
            >
              <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}
          {index < images.length - 1 ? (
            <Pressable
              onPress={() => goTo(index + 1)}
              accessibilityRole="button"
              accessibilityLabel="Foto siguiente"
              style={[styles.arrow, styles.arrowRight, { backgroundColor: colors.overlay }]}
            >
              <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null}

          <View style={styles.dots}>
            {images.map((image, i) => (
              <Pressable
                key={image.id}
                onPress={() => goTo(i)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Ir a la foto ${i + 1}`}
                style={[styles.dot, { backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }]}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  placeholder: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowLeft: {
    left: spacing.sm,
  },
  arrowRight: {
    right: spacing.sm,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
});
