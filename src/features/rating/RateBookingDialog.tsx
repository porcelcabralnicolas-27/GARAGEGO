import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { TextField } from '@/components/ui/TextField';
import { createRating, getRatingErrorMessage } from '@/features/rating/api';
import { useTheme } from '@/theme';

type RateBookingDialogProps = {
  visible: boolean;
  bookingId: string;
  parkingLotId: string;
  userId: string;
  parkingLotName: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function RateBookingDialog({
  visible,
  bookingId,
  parkingLotId,
  userId,
  parkingLotName,
  onClose,
  onSuccess,
}: RateBookingDialogProps) {
  const { colors, typography } = useTheme();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setScore(0);
    setComment('');
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (score < 1) {
      setErrorMessage('Elegí una puntuación de 1 a 5 estrellas.');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await createRating({
        bookingId,
        parkingLotId,
        userId,
        score,
        comment: comment.trim() ? comment.trim() : null,
      });
      setScore(0);
      setComment('');
      onSuccess();
    } catch (error) {
      setErrorMessage(getRatingErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[typography.titleLarge, { color: colors.onSurface, marginBottom: 4 }]}>Calificar</Text>
          <Text style={[typography.bodyMedium, { color: colors.onSurfaceVariant, marginBottom: 16 }]}>
            {parkingLotName}
          </Text>

          {errorMessage ? <Banner message={errorMessage} /> : null}

          <StarRating value={score} onChange={setScore} />

          <View style={styles.spacer} />

          <TextField
            label="Comentario (opcional)"
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder="¿Cómo fue tu experiencia?"
          />

          <Button label="Enviar calificación" onPress={handleSubmit} loading={isSubmitting} disabled={isSubmitting} />
          <View style={styles.spacer} />
          <Button label="Cancelar" variant="text" onPress={handleClose} disabled={isSubmitting} />
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
    height: 12,
  },
});
