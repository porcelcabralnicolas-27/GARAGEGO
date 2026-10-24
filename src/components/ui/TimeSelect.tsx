import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

const OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const hours = Math.floor(i / 2)
    .toString()
    .padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

type TimeSelectProps = {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

/**
 * Selector de hora en pasos de 30 minutos, formato 24 h. Se ve como un TextField pero al
 * tocarlo abre una lista en un Modal (mismo patrón visual que ConfirmDialog), en vez de dejar
 * que el usuario escriba una hora a mano.
 */
export function TimeSelect({ label, value, placeholder = 'Elegir hora', onChange }: TimeSelectProps) {
  const { colors, typography } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (time: string) => {
    onChange(time);
    setIsOpen(false);
  };

  return (
    <View>
      {label ? <Text style={[typography.label, { color: colors.onSurfaceVariant, marginBottom: 8 }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setIsOpen(true)}
        style={[styles.field, { borderColor: colors.outline, backgroundColor: colors.surface }]}
      >
        <Text style={[typography.bodyLarge, { color: value ? colors.onSurface : colors.onSurfaceVariant }]}>
          {value || placeholder}
        </Text>
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setIsOpen(false)}>
          {/* Pressable propio para que tocar el card no cierre el modal (el toque no llega al overlay). */}
          <Pressable style={[styles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
            {label ? (
              <Text style={[typography.titleLarge, { color: colors.onSurface, marginBottom: 12 }]}>{label}</Text>
            ) : null}
            <FlatList
              data={OPTIONS}
              keyExtractor={(item) => item}
              style={styles.list}
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={[styles.option, selected ? { backgroundColor: colors.primaryContainer } : null]}
                  >
                    <Text
                      style={[
                        typography.bodyLarge,
                        { color: selected ? colors.onPrimaryContainer : colors.onSurface },
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    borderRadius: 16,
    padding: 24,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
