import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { ParkingCard } from '@/components/parking/ParkingCard';
import { Banner } from '@/components/ui/Banner';
import { Screen } from '@/components/ui/Screen';
import { getCoverImageUrls, listMyParkingLots } from '@/features/parking/api';
import type { ParkingLot } from '@/features/parking/types';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerParkingsScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [coverImages, setCoverImages] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    setIsLoading(true);
    setErrorMessage(null);
    listMyParkingLots(profile.id)
      .then(async (data) => {
        setLots(data);
        setCoverImages(await getCoverImageUrls(data.map((lot) => lot.id)));
      })
      .catch(() => setErrorMessage('No se pudieron cargar tus estacionamientos.'))
      .finally(() => setIsLoading(false));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[typography.displayLarge, { color: colors.onBackground }]}>Mis estacionamientos</Text>
        <Pressable onPress={() => router.push('/(owner)/parkings/create')} hitSlop={8}>
          <Ionicons name="add-circle" size={32} color={colors.accent} />
        </Pressable>
      </View>

      {errorMessage ? <Banner message={errorMessage} /> : null}

      {!isLoading && lots.length === 0 && !errorMessage ? (
        <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Todavía no publicaste ningún estacionamiento. Tocá el + para crear el primero.
        </Text>
      ) : null}

      <FlatList
        data={lots}
        keyExtractor={(item) => item.id}
        refreshing={isLoading}
        onRefresh={load}
        renderItem={({ item }) => (
          <ParkingCard
            name={item.name}
            address={item.address}
            pricePerHour={item.pricePerHour}
            ratingAvg={item.ratingAvg}
            isActive={item.isActive}
            imageUrl={coverImages[item.id]}
            onPress={() => router.push({ pathname: '/(owner)/parkings/[id]/edit', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
});
