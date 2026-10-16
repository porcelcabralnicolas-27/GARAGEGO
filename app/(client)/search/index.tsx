import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChipSelect } from '@/components/ui/ChipSelect';
import { Screen } from '@/components/ui/Screen';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { TextField } from '@/components/ui/TextField';
import { useGeocoder } from '@/features/search/useGeocoder';
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
  const geocoder = useGeocoder();

  const [address, setAddress] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

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

  // Busca una dirección escrita a mano y muestra en el mapa los estacionamientos que hay cerca
  // de ella, con los mismos filtros de distancia, precio y calificación.
  const searchAddress = async () => {
    const query = address.trim();
    if (query.length < 3 || isSearchingAddress) return;
    setIsSearchingAddress(true);
    setAddressError(null);
    try {
      const found = await geocoder.geocode(query);
      if (!found) {
        setAddressError('No encontramos esa dirección. Probá con calle, número y localidad.');
        return;
      }
      router.push({
        pathname: '/(client)',
        params: {
          lat: String(found.latitude),
          lng: String(found.longitude),
          radiusKm,
          maxPrice: maxPrice.trim(),
          minRating: minRating === '0' ? '' : minRating,
          place: found.label,
        },
      });
    } catch {
      setAddressError('No se pudo buscar la dirección. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setIsSearchingAddress(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Buscar" backHref="/(client)" />

        <TextField
          label="Buscar por dirección"
          placeholder="Ej.: Av. Mitre 1500, Avellaneda"
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            setAddressError(null);
          }}
          returnKeyType="search"
          onSubmitEditing={searchAddress}
          autoCapitalize="words"
          errorMessage={addressError ?? undefined}
        />
        <Button
          label="Buscar esta dirección en el mapa"
          onPress={searchAddress}
          loading={isSearchingAddress}
          disabled={address.trim().length < 3 || isSearchingAddress || !geocoder.isReady}
        />

        <View style={styles.spacerLarge} />
        <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>
          O buscá cerca de donde estás
        </Text>

        {location.errorMessage ? (
          <>
            <Banner message={location.errorMessage} variant={location.isApproximate ? 'info' : 'error'} />
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
