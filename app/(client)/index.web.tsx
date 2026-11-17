import { GoogleMap, MarkerF, OverlayView, OverlayViewF, useJsApiLoader } from '@react-google-maps/api';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ParkingPreviewSheet } from '@/components/parking/ParkingPreviewSheet';
import { Banner } from '@/components/ui/Banner';
import { Logo } from '@/components/ui/Logo';
import { SearchBar } from '@/components/ui/SearchBar';
import { searchParkingLots } from '@/features/parking/api';
import { buildParkingMarkerIcon, buildUserLocationIcon } from '@/features/parking/parkingMarkerIcon.web';
import { PIN_SIZE } from '@/features/parking/pinImages';
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

  // Igual que en el celular (app/(client)/index.tsx): tocar un pin abre primero un cartel chico con
  // el nombre, la tarifa y la calificación (`calloutId`), y recién tocando el cartel aparece la hoja
  // con toda la información (`selectedId`).
  const [calloutId, setCalloutId] = useState<string | null>(null);
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
  const errorMessage = isError ? t('No se pudieron cargar los estacionamientos.') : null;

  const selected = results.find((r) => r.id === selectedId) ?? null;
  const callout = results.find((r) => r.id === calloutId) ?? null;
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

  // Lleva el mapa a la cochera en un solo movimiento (centro y zoom a la vez), dejándola visible
  // por encima de la hoja. La cuenta es la misma que en el celular (src/features/search/mapCamera.ts).
  const zoomToLot = (lot: { latitude: number; longitude: number }) => {
    if (!map) return;
    // Se espera a que la hoja esté dibujada para medir cuánto del mapa tapa.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const mapRect = map.getDiv().getBoundingClientRect();
        const sheet = document.querySelector('[data-testid="parking-preview-sheet"]');
        const camera = lotCamera(lot, map.getZoom() ?? 0, {
          mapTop: mapRect.top,
          mapHeight: mapRect.height,
          visibleBottom: sheet ? sheet.getBoundingClientRect().top : mapRect.bottom,
        });
        map.moveCamera({ center: { lat: camera.center.latitude, lng: camera.center.longitude }, zoom: camera.zoom });
      })
    );
  };

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
        <Banner message={t('Falta configurar EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY en .env para ver el mapa en la versión web.')} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 20 }]}>
        <Banner message={t('No se pudo cargar Google Maps.')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            // Tocar el mapa fuera de un pin cierra el cartel y la hoja, como en el celular.
            onClick={() => {
              setCalloutId(null);
              setSelectedId(null);
            }}
          >
            {params.place && mapCenter ? <MarkerF position={mapCenter} title={params.place} zIndex={999} /> : null}
            {myPosition ? (
              <MarkerF
                position={myPosition}
                icon={buildUserLocationIcon()}
                title={t('Estás acá')}
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
                  setCalloutId(lot.id);
                  setNoticeDismissed(true);
                  // Como Google Maps en Android: el mapa se centra en el pin, así el cartel nunca
                  // queda recortado por un borde.
                  map?.panTo({ lat: lot.latitude, lng: lot.longitude });
                }}
              />
            ))}
            {callout ? (
              <OverlayViewF
                key={callout.id}
                position={{ lat: callout.latitude, lng: callout.longitude }}
                mapPaneName={OverlayView.FLOAT_PANE}
                // Centrado sobre el pin (que se ancla en su centro), con la flecha tocando su borde.
                getPixelPositionOffset={(width, height) => ({ x: -width / 2, y: -(height + PIN_SIZE / 2) })}
              >
                <MarkerCallout
                  title={callout.name}
                  description={`${formatPricePerHour(callout.pricePerHour)} · ★ ${callout.ratingAvg.toFixed(1)}`}
                  onPress={() => {
                    setSelectedId(callout.id);
                    zoomToLot(callout);
                  }}
                />
              </OverlayViewF>
            ) : null}
          </GoogleMap>

          {myPosition ? (
            <Pressable
              onPress={centerOnMe}
              accessibilityLabel={t('Centrar el mapa en mi ubicación')}
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

/**
 * Cartel blanco sobre el pin, con la misma información y el mismo aspecto que el globo de Google
 * Maps en Android (título en negrita, tarifa y calificación debajo, flecha hacia el pin).
 */
function MarkerCallout({ title, description, onPress }: { title: string; description: string; onPress: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  // Sin `preventMapHitsAndGesturesFrom`, el clic llega también al mapa, que cerraría el cartel en el
  // mismo momento. Esa función corta la propagación en el propio elemento, y React escucha los
  // eventos en la raíz: por eso el clic se escucha con un listener nativo y no con onClick.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    google.maps.OverlayView.preventMapHitsAndGesturesFrom(element);
    const handleClick = () => onPressRef.current();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') onPressRef.current();
    };
    element.addEventListener('click', handleClick);
    element.addEventListener('keydown', handleKey);
    return () => {
      element.removeEventListener('click', handleClick);
      element.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${description}`}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 7px rgba(0, 0, 0, 0.3)',
          maxWidth: 240,
          textAlign: 'center',
          fontFamily: 'Roboto, Arial, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#202124',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#5f6368', marginTop: 2, whiteSpace: 'nowrap' }}>{description}</div>
      </div>
      {/* Flecha hacia el pin */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid #ffffff',
          filter: 'drop-shadow(0 2px 1px rgba(0, 0, 0, 0.15))',
        }}
      />
    </div>
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
