import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { useTheme } from '@/theme';

const RADIUS_OPTIONS = [
  { value: '2', label: '2 km' },
  { value: '5', label: '5 km' },
  { value: '10', label: '10 km' },
  { value: '20', label: '20 km' },
];

const RATING_OPTIONS = [
  { value: '0', label: 'Cualquiera' },
  { value: '3', label: '3+ estrellas' },
  { value: '4', label: '4+ estrellas' },
];

export default function SearchScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const location = useCurrentLocation();

  const [radiusKm, setRadiusKm] = useState('5');
  const [maxPrice, setMaxPrice] = useState('');
  const [minRating, setMinRating] = useState('0');

  const goToResults = (view: 'list' | 'map') => {
    if (location.latitude === null || location.longitude === null) return;
    router.push({
      pathname: view === 'list' ? '/(client)/search/list' : '/(client)',
      params: {
        lat: String(location.latitude),
        lng: String(location.longitude),
        radiusKm,
        maxPrice: maxPrice.trim(),
        minRating: minRating === '0' ? '' : minRating,
      },
    });
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Buscar" backHref="/(client)" />

        {location.errorMessage ? (
          <>
            <Banner message={location.errorMessage} />
            <Button label="Reintentar ubicación" variant="outlined" onPress={location.retry} />
            <View style={styles.spacer} />
          </>
        ) : null}

        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Distancia</Text>
        <ChipSelect options={RADIUS_OPTIONS} value={radiusKm} onChange={setRadiusKm} />

        <View style={styles.spacer} />

        <TextField
          label="Precio máximo por hora (opcional)"
          keyboardType="decimal-pad"
          placeholder="Sin límite"
          value={maxPrice}
          onChangeText={setMaxPrice}
        />

        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>Calificación mínima</Text>
        <ChipSelect options={RATING_OPTIONS} value={minRating} onChange={setMinRating} />

        <View style={styles.spacerLarge} />

        <Button
          label="Ver en lista"
          onPress={() => goToResults('list')}
          disabled={location.isLoading || !location.latitude}
          loading={location.isLoading}
        />
        <View style={styles.spacer} />
        <Button
          label="Ver en mapa"
          variant="outlined"
          onPress={() => goToResults('map')}
          disabled={location.isLoading || !location.latitude}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: {
    height: 16,
  },
  spacerLarge: {
    height: 24,
  },
});
