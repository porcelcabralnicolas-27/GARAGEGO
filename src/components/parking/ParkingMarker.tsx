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
      <View style={[styles.pin, { backgroundColor: colors.accent, borderColor: '#FFFFFF' }]}>
        <Ionicons name="car" size={16} color="#FFFFFF" />
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
