import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

type ChipOption<T extends string> = { value: T; label: string };

type ChipSelectProps<T extends string> =
  | {
      options: ChipOption<T>[];
      value: T;
      onChange: (value: T) => void;
      multiple?: false;
    }
  | {
      options: ChipOption<T>[];
      value: T[];
      onChange: (value: T[]) => void;
      multiple: true;
    };

export function ChipSelect<T extends string>(props: ChipSelectProps<T>) {
  const { colors, typography } = useTheme();
  const { options } = props;

  const isSelected = (optionValue: T) =>
    props.multiple ? props.value.includes(optionValue) : props.value === optionValue;

  const handlePress = (optionValue: T) => {
    if (props.multiple) {
      const next = props.value.includes(optionValue)
        ? props.value.filter((v) => v !== optionValue)
        : [...props.value, optionValue];
      props.onChange(next);
      return;
    }
    props.onChange(optionValue);
  };

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => handlePress(option.value)}
            style={[
              styles.chip,
              { borderColor: colors.outline, backgroundColor: selected ? colors.primary : 'transparent' },
            ]}
          >
            <Text style={[typography.label, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}>
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
