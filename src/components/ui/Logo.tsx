import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type LogoProps = {
  size?: 'large' | 'medium';
};

export function Logo({ size = 'large' }: LogoProps) {
  const { colors } = useTheme();
  const fontSize = size === 'large' ? 30 : 20;

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { fontSize, color: colors.onBackground }]}>Garage</Text>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Text style={[styles.text, { fontSize, color: colors.onPrimary }]}>Go</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badge: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginLeft: 2,
  },
});
