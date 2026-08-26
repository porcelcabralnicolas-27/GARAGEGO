import { Pressable, Text } from 'react-native';

import { useTheme } from '@/theme';

export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, typography } = useTheme();

  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[typography.bodyMedium, { color: colors.accent, textAlign: 'center'}]}>{label}</Text>
    </Pressable>
  );
}
