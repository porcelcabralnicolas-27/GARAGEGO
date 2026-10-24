import { GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ParkingPreviewSheet } from '@/components/parking/ParkingPreviewSheet';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import { buildParkingMarkerIcon, buildUserLocationIcon } from '@/features/parking/parkingMarkerIcon.web';
import { useAvailableNow } from '@/features/parking/useAvailableNow';
import {
  DEFAULT_SEARCH_RADIUS_KM,
  MAP_BROWSE_RADIUS_KM,
  lotsToFrame,
  nearbyOf,
  searchNotice,
} from '@/features/search/mapResults';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { mapOrigin } from '@/hooks/useGoBack';
import { queryKeys } from '@/lib/queryKeys';
import { radius, spacing, useTheme } from '@/theme';

type SearchParams = {
  lat: string;
  lng: string;
  radiusKm: string;
  maxPrice: string;
  minRating: string;
  /** Dirección buscada a mano: se marca en el mapa y las cocheras se buscan cerca de ella. */
  place?: string;
  /** '0' al volver de elegir un estacionamiento: el aviso de la búsqueda ya se vio y no se repite. */
  notice?: string;
};

const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

// Con una sola cochera cerca, fitBounds acercaría el mapa a nivel de calle: se limita el zoom.
const MAX_FIT_ZOOM = 15;
const MY_LOCATION_ZOOM = 16;
const FIT_PADDING = 48;

// Versión web de la pestaña Inicio: react-native-maps (usado en app/(client)/index.tsx) no tiene
// soporte para web, así que acá se usa la API de JavaScript de Google Maps directamente.
export default function ClientHomeWebScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;
  const hasCoordinates = latitude !== null && longitude !== null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // El aviso de la búsqueda se oculta apenas se elige un estacionamiento.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Objeto estable: GoogleMap vuelve a centrar el mapa cada vez que `center` cambia de identidad, y
  // un objeto nuevo en cada render lo recentraba con cada refresco de datos (la disponibilidad se
  // vuelve a pedir cada minuto), pisando el encuadre y el movimiento que hiciera la persona.
  const mapCenter = useMemo(
    () => (latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null),
    [latitude, longitude]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'garagego-google-maps-web',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });

  // Inicio (sin filtros) y la búsqueda por dirección muestran TODOS los estacionamientos. Solo
  // cuando se eligió una distancia en Buscar ("Ver en mapa") el mapa se limita a ese radio.
  const isRadiusSearch = Boolean(params.radiusKm) && !params.place;
  const searchRadiusKm = Number(params.radiusKm) || DEFAULT_SEARCH_RADIUS_KM;
  const filters = {
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    radiusKm: isRadiusSearch ? searchRadiusKm : MAP_BROWSE_RADIUS_KM,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : null,
    minRating: params.minRating ? Number(params.minRating) : null,
  };
  const { data: results = [], isError, isSuccess } = useQuery({
    queryKey: queryKeys.parkingLots.nearby(filters),
    queryFn: () => searchParkingLots(filters),
    enabled: hasCoordinates,
  });
  const errorMessage = isError ? 'No se pudieron cargar los estacionamientos.' : null;

  const selected = results.find((r) => r.id === selectedId) ?? null;
  const nearbyCount = nearbyOf(results, searchRadiusKm).length;
  const showNotice = Boolean(params.place) && isSuccess && params.notice !== '0' && !noticeDismissed;

  // Verde = se puede usar ahora (en horario y con lugar); gris = cerrada o llena en este momento.
  const availableNow = useAvailableNow(results.map((r) => r.id));

  // Ubicación real del dispositivo, para dibujar el punto "estás acá". Con la ubicación por defecto
  // (sin permiso) no se dibuja: marcar el Obelisco como "tu posición" sería mentirle al usuario.
  const myPosition =
    !currentLocation.isApproximate && currentLocation.latitude !== null && currentLocation.longitude !== null
      ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
      : null;

  const centerOnMe = () => {
    if (!map || !myPosition) return;
    map.panTo(myPosition);
    map.setZoom(MY_LOCATION_ZOOM);
  };

  // Encuadra el mapa para que entren la ubicación de búsqueda y los estacionamientos del radio. Si no
  // hay ninguno dentro del radio, entran los más cercanos de afuera (el resto igual está en el mapa).
  // Se recalcula solo cuando cambia ese conjunto, no con cada render, para no pisar el zoom que el
  // usuario ajusta a mano.
  const framed = lotsToFrame(results, searchRadiusKm);
  const resultsKey = framed.map((r) => r.id).join(',');
  useEffect(() => {
    if (!map || latitude === null || longitude === null || framed.length === 0) return;
    const bounds = new google.maps.LatLngBounds({ lat: latitude, lng: longitude });
    for (const lot of framed) bounds.extend({ lat: lot.latitude, lng: lot.longitude });
    map.fitBounds(bounds, FIT_PADDING);
    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
    });
    return () => listener.remove();
    // `results`, `latitude` y `longitude` entran por resultsKey y por los params de la búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, resultsKey, latitude, longitude]);

  if (!GOOGLE_MAPS_WEB_API_KEY) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
        <Banner message="Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY en .env para ver el mapa en la versión web." />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
        <Banner message="No se pudo cargar Google Maps." />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {/* El logo hace de identidad de la pantalla; antes había un saludo "HOLA, {nombre}". */}
        <Logo />
        <SearchBar placeholder="¿A dónde vas?" onPress={() => router.push('/(client)/search')} />
      </View>

      {errorMessage ? (
        <View style={styles.banner}>
          <Banner message={errorMessage} />
        </View>
      ) : null}
      {showNotice && params.place ? (
        <View style={styles.banner}>
          <Banner
            variant="info"
            message={searchNotice({
              place: params.place,
              radiusKm: searchRadiusKm,
              nearbyCount,
              totalCount: results.length,
            })}
          />
        </View>
      ) : null}
      {!hasCoordinates && currentLocation.errorMessage ? (
        <View style={styles.banner}>
          <Banner message={currentLocation.errorMessage} />
        </View>
      ) : null}
      {/* Sin permiso de ubicación se usa el centro de Buenos Aires: se avisa, pero no es un error. */}
      {currentLocation.isApproximate && !Number.isFinite(paramLat) && currentLocation.errorMessage ? (
        <View style={styles.banner}>
          <Banner message={currentLocation.errorMessage} variant="info" />
        </View>
      ) : null}

      {isLoaded && latitude !== null && longitude !== null ? (
        <View style={styles.mapWrapper}>
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter ?? undefined}
            zoom={13}
            onLoad={setMap}
            onUnmount={() => setMap(null)}
          >
            {params.place && mapCenter ? <MarkerF position={mapCenter} title={params.place} zIndex={999} /> : null}
            {myPosition ? (
              <MarkerF
                position={myPosition}
                icon={buildUserLocationIcon()}
                title="Estás acá"
                clickable={false}
                zIndex={1000}
              />
            ) : null}
            {results.map((lot) => (
              <MarkerF
                key={lot.id}
                position={{ lat: lot.latitude, lng: lot.longitude }}
                icon={buildParkingMarkerIcon(lot.lotType, availableNow[lot.id])}
                onClick={() => {
                  setSelectedId(lot.id);
                  setNoticeDismissed(true);
                }}
              />
            ))}
          </GoogleMap>

          {myPosition ? (
            <Pressable
              onPress={centerOnMe}
              accessibilityLabel="Centrar el mapa en mi ubicación"
              style={[styles.locateButton, { backgroundColor: colors.surface }]}
            >
              <Ionicons name="locate" size={22} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {selected ? (
        <ParkingPreviewSheet
          lot={selected}
          isAvailableNow={availableNow[selected.id]}
          onClose={() => setSelectedId(null)}
          onViewDetail={() =>
            router.push({
              pathname: '/(client)/search/parking/[id]',
              params: { id: selected.id, from: mapOrigin({ ...params, notice: '0' }) },
            })
          }
          onBook={() =>
            router.push({
              pathname: '/(client)/search/booking/[parkingId]',
              params: { parkingId: selected.id, from: mapOrigin({ ...params, notice: '0' }) },
            })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    // Separa el logo del buscador (antes lo hacía el margen del saludo).
    gap: spacing.md,
  },
  banner: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  locateButton: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xl,
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Sombra para que se despegue del mapa.
    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
  },
  mapWrapper: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
});
