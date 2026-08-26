import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type StarRatingProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
};

export function StarRating({ value, onChange, size = 28 }: StarRatingProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onChange?.(star)} disabled={!onChange} hitSlop={4}>
          <Ionicons
            name={star <= value ? 'star' : 'star-outline'}
            size={size}
            color={colors.accent}
            style={styles.icon}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  icon: {
    marginRight: 4,
  },
});
