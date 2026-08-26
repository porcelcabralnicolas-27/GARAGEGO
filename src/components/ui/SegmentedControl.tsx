import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: [Option<T>, Option<T>];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<T>) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceVariant }]}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => !disabled && onChange(option.value)}
            style={[
              styles.segment,
              isSelected && { backgroundColor: colors.primary },
            ]}
          >
            <Text
              style={[
                typography.titleMedium,
                { color: isSelected ? colors.onPrimary : colors.onSurfaceVariant },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 24,
    padding: 4,
  },
  segment: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
