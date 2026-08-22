import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useTheme } from '@/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancelar',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors, typography } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[typography.titleLarge, { color: colors.onSurface, marginBottom: 8 }]}>{title}</Text>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 20 }]}>{message}</Text>

          <Button label={confirmLabel} onPress={onConfirm} loading={loading} disabled={loading} />
          <View style={styles.spacer} />
          <Button label={cancelLabel} variant="text" onPress={onCancel} disabled={loading} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  spacer: {
    height: 8,
  },
});
