import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import { ParkingMarker } from '@/components/parking/ParkingMarker';
import { ParkingPreviewSheet } from '@/components/parking/ParkingPreviewSheet';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import { useAvailableNow } from '@/features/parking/useAvailableNow';
import {
  DEFAULT_SEARCH_RADIUS_KM,
  MAP_BROWSE_RADIUS_KM,
  lotsToFrame,
  nearbyOf,
  searchNotice,
} from '@/features/search/mapResults';
import { lotCamera } from '@/features/search/mapCamera';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { mapOrigin } from '@/hooks/useGoBack';
import { formatPricePerHour } from '@/lib/money';
import { queryKeys } from '@/lib/queryKeys';
import { radius, spacing, useTheme } from '@/theme';
import { t } from '@/lib/i18n';

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

/** Zoom con el que se abre el mapa (y al que vuelve al tocar Inicio). */
const INITIAL_DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

export default function ClientHomeScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const params = useLocalSearchParams<SearchParams>();
  const currentLocation = useCurrentLocation();

  // Llegar acá sin pasar por Buscar (uso normal de la pestaña Inicio) no trae params de lat/lng.
  // En ese caso se usa la ubicación actual del dispositivo.
  const paramLat = params.lat ? Number(params.lat) : NaN;
  const paramLng = params.lng ? Number(params.lng) : NaN;
  const latitude = Number.isFinite(paramLat) ? paramLat : currentLocation.latitude;
  const longitude = Number.isFinite(paramLng) ? paramLng : currentLocation.longitude;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // El aviso de la búsqueda se oculta apenas se elige un estacionamiento.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const mapRef = useRef<MapView>(null);
  // Cada vez que se toca la pestaña Inicio, el mapa vuelve a la vista con la que se abre la app:
  // sin hoja y con la región inicial (el layout borra además los filtros de una búsqueda).
  const [resetCount, setResetCount] = useState(0);
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener('tabPress' as never, () => {
        setSelectedId(null);
        setResetCount((count) => count + 1);
      }),
    [navigation]
  );

  // Al tocar el cartel, el mapa va directo a la cochera y la deja visible por encima de la hoja,
  // igual que en la web (src/features/search/mapCamera.ts). Para eso hace falta saber dónde está el
  // mapa y dónde empieza la hoja; la hoja recién se mide cuando aparece, así que el movimiento
  // queda pendiente hasta ese momento.
  const mapLayoutRef = useRef<LayoutRectangle | null>(null);
  const sheetTopRef = useRef<number | null>(null);
  const pendingZoomRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const runPendingZoom = async () => {
    const lot = pendingZoomRef.current;
    const mapLayout = mapLayoutRef.current;
    const sheetTop = sheetTopRef.current;
    if (!lot || !mapLayout || sheetTop === null || !mapRef.current) return;
    pendingZoomRef.current = null;
    const current = await mapRef.current.getCamera().catch(() => null);
    const camera = lotCamera(lot, current?.zoom ?? 0, {
      mapTop: mapLayout.y,
      mapHeight: mapLayout.height,
      visibleBottom: sheetTop,
    });
    mapRef.current?.animateCamera({ center: camera.center, zoom: camera.zoom }, { duration: 500 });
  };

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
    enabled: latitude !== null && longitude !== null,
  });
  const errorMessage = isError ? t('No se pudieron cargar los estacionamientos.') : null;

  const selected = results.find((r) => r.id === selectedId) ?? null;
  if (!selected) sheetTopRef.current = null;
  const nearbyCount = nearbyOf(results, searchRadiusKm).length;
  const showNotice = Boolean(params.place) && isSuccess && params.notice !== '0' && !noticeDismissed;

  // Sin nada dentro del radio, el mapa se encuadra para que se vean los estacionamientos más
  // cercanos de afuera, en vez de quedarse sobre una zona vacía. Solo cuando se ven todos: con una
  // distancia elegida, el mapa muestra lo que entra en ese radio y nada más.
  const framed = isSuccess && !isRadiusSearch ? lotsToFrame(results, searchRadiusKm) : [];
  const framedKey = framed.map((lot) => lot.id).join(',');
  useEffect(() => {
    if (isRadiusSearch || nearbyCount > 0 || framed.length === 0 || latitude === null || longitude === null) return;
    mapRef.current?.fitToCoordinates(
      [{ latitude, longitude }, ...framed.map((lot) => ({ latitude: lot.latitude, longitude: lot.longitude }))],
      { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
    );
    // Solo cuando cambia el conjunto de estacionamientos encuadrados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framedKey, nearbyCount]);

  // La vuelta a la vista inicial (después de render, ya con los filtros borrados): la misma región
  // con la que se arma el mapa y, si correspondía, el encuadre de los estacionamientos de afuera.
  useEffect(() => {
    if (resetCount === 0 || latitude === null || longitude === null) return;
    mapRef.current?.animateToRegion({ latitude, longitude, ...INITIAL_DELTA }, 400);
    if (!isRadiusSearch && nearbyCount === 0 && framed.length > 0) {
      mapRef.current?.fitToCoordinates(
        [{ latitude, longitude }, ...framed.map((lot) => ({ latitude: lot.latitude, longitude: lot.longitude }))],
        { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true }
      );
    }
    // Solo cuando se toca Inicio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCount]);

  // Verde = se puede usar ahora (en horario y con lugar); gris = cerrada o llena en este momento.
  const availableNow = useAvailableNow(results.map((r) => r.id));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background }}>
        <View style={styles.header}>
          {/* El logo hace de identidad de la pantalla; antes había un saludo "HOLA, {nombre}". */}
          <Logo />
          <SearchBar placeholder={t('¿A dónde vas?')} onPress={() => router.push('/(client)/search')} />
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
        {latitude === null && currentLocation.errorMessage ? (
          <View style={styles.banner}>
            <Banner message={currentLocation.errorMessage} />
          </View>
        ) : null}
      </SafeAreaView>

      {latitude !== null && longitude !== null ? (
        <View
          style={styles.mapWrapper}
          onLayout={(event) => {
            mapLayoutRef.current = event.nativeEvent.layout;
          }}
        >
        <MapView
          ref={mapRef}
          // `initialRegion` solo se lee al montar: con la `key` el mapa se vuelve a armar (y se
          // reubica) cuando cambia el punto de búsqueda, por ejemplo al buscar otra dirección.
          key={`${latitude}:${longitude}`}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          // Punto azul del sistema con la posición real, que se mueve mientras caminás, y el
          // botón para volver a centrar el mapa en vos.
          showsUserLocation
          showsMyLocationButton
          initialRegion={{ latitude, longitude, ...INITIAL_DELTA }}
          // Tocar el mapa fuera de un marcador cierra la tarjeta de vista previa.
          onPress={() => setSelectedId(null)}
        >
          {params.place ? (
            <Marker coordinate={{ latitude, longitude }} title={params.place} pinColor="blue" />
          ) : null}
          {results.map((lot) => (
            <ParkingMarker
              key={lot.id}
              coordinate={{ latitude: lot.latitude, longitude: lot.longitude }}
              title={lot.name}
              description={`${formatPricePerHour(lot.pricePerHour)} · ★ ${lot.ratingAvg.toFixed(1)}`}
              lotType={lot.lotType}
              isAvailableNow={availableNow[lot.id]}
              // Antes navegaba directo al detalle; ahora muestra la tarjeta inferior primero,
              // así se puede comparar entre marcadores sin salir del mapa.
              onPress={() => {
                setSelectedId(lot.id);
                setNoticeDismissed(true);
                pendingZoomRef.current = { latitude: lot.latitude, longitude: lot.longitude };
                // Si la hoja ya estaba abierta (otra cochera), no se vuelve a medir: se mueve ya.
                void runPendingZoom();
              }}
            />
          ))}
        </MapView>
        </View>
      ) : (
        <View style={styles.centerFill}>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant }]}>{t('Obteniendo tu ubicación…')}</Text>
        </View>
      )}

      {selected ? (
        <ParkingPreviewSheet
          lot={selected}
          isAvailableNow={availableNow[selected.id]}
          onLayout={(event) => {
            // La hoja está anclada abajo del mismo contenedor que el mapa: su `y` es dónde empieza.
            sheetTopRef.current = event.nativeEvent.layout.y;
            void runPendingZoom();
          }}
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
  // El recorte va en el contenedor y no en el MapView: en Android un borderRadius aplicado
  // directamente sobre el mapa no recorta la superficie nativa.
  mapWrapper: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
