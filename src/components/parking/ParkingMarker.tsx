import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Marker, type LatLng } from 'react-native-maps';

import { useTheme } from '@/theme';

type ParkingMarkerProps = {
  coordinate: LatLng;
  title: string;
  description: string;
  onPress: () => void;
};

export function ParkingMarker({ coordinate, title, description, onPress }: ParkingMarkerProps) {
  const { colors } = useTheme();

  return (
    <Marker coordinate={coordinate} title={title} description={description} onCalloutPress={onPress}>
      {/* Pin lima como en el Figma. El ícono va en `onPrimary` (oscuro) y no en blanco:
          sobre el lima el blanco queda en 1.6:1 y se pierde de vista. */}
      <View style={[styles.pin, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
        <Ionicons name="car" size={16} color={colors.onPrimary} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
