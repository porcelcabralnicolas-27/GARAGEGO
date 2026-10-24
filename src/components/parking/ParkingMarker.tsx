import { Image } from 'react-native';
import { Marker, type LatLng } from 'react-native-maps';

import { PIN_SIZE, pinImageFor } from '@/features/parking/pinImages';
import type { LotType } from '@/features/parking/types';

type ParkingMarkerProps = {
  coordinate: LatLng;
  title: string;
  description: string;
  /** Cochera de casa o estacionamiento: cambia el ícono del pin. */
  lotType: LotType;
  /** false = cerrada o llena ahora: el pin se ve gris. `undefined` (sin dato) se pinta como disponible. */
  isAvailableNow?: boolean;
  onPress: () => void;
};

export function ParkingMarker({ coordinate, title, description, lotType, isAvailableNow, onPress }: ParkingMarkerProps) {
  return (
    <Marker
      coordinate={coordinate}
      title={title}
      description={description}
      onCalloutPress={onPress}
      // El ancla en el centro de la chapa (no en la punta): el pin es un círculo, no una gota.
      anchor={{ x: 0.5, y: 0.5 }}
    >
      {/* Casa o edificio con cocheras, en verde si se puede usar ahora y en gris si no. */}
      <Image source={pinImageFor(lotType, isAvailableNow)} style={{ width: PIN_SIZE, height: PIN_SIZE }} />
    </Marker>
  );
}
