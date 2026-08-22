import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type ChipOption<T extends string> = { value: T; label: string };

export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              { borderColor: colors.outline, backgroundColor: isSelected ? colors.primary : 'transparent' },
            ]}
          >
            <Text style={[typography.label, { color: isSelected ? colors.onPrimary : colors.onSurfaceVariant }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
});
