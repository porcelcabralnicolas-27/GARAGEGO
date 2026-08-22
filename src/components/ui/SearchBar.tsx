import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme';

export function SearchBar({ placeholder, onPress }: { placeholder: string; onPress: () => void }) {
  const { colors, typography } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.bar, { backgroundColor: colors.surface, borderColor: colors.outline }]}
    >
      <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
      <Text style={[typography.bodyLarge, { color: colors.onSurfaceVariant, marginLeft: 10 }]}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
});
