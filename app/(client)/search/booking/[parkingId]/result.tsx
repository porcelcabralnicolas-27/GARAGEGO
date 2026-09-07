import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { spacing, useTheme } from '@/theme';

// Pantalla de cierre del flujo de pago, en sus dos variantes ("¡Pago realizado con éxito!" y
// "Ha ocurrido un error" en el Figma). Es una sola pantalla y no dos porque comparten toda la
// estructura: ícono grande, título, texto y un par de botones.
//
// Se llega acá con `replace` en el caso de éxito (para que volver atrás no reabra la pantalla
// de pago con la reserva ya cobrada) y con `push` en el de error (para que "Volver a intentar"
// sea un `back` que conserva los datos ya elegidos).
export default function BookingResultScreen() {
  const router = useRouter();
  const { colors, typography } = useTheme();
  const { parkingId, status, reason, bookingId } = useLocalSearchParams<{
    parkingId: string;
    status: 'success' | 'error';
    reason?: string;
    bookingId?: string;
  }>();

  const isSuccess = status === 'success';

  return (
    <Screen>
      <View style={styles.container}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isSuccess ? colors.primaryContainer : colors.surfaceVariant },
          ]}
        >
          <Ionicons
            name={isSuccess ? 'checkmark' : 'alert'}
            size={64}
            color={isSuccess ? colors.onPrimaryContainer : colors.error}
          />
        </View>

        <Text style={[typography.titleLarge, styles.title, { color: colors.onSurface }]}>
          {isSuccess ? '¡Pago realizado con éxito!' : 'Ha ocurrido un error'}
        </Text>

        <Text style={[typography.bodyMedium, styles.body, { color: colors.onSurfaceVariant }]}>
          {isSuccess
            ? // El Figma promete un correo con la factura; la app no manda correos, así que
              // se apunta al comprobante que sí existe (Fase 8, Q12·A).
              'Ya reservaste tu lugar. Podés ver el comprobante y el detalle en Mis reservas.'
            : (reason ?? 'No pudimos procesar el pago. Intentá de nuevo.')}
        </Text>

        <View style={styles.actions}>
          {isSuccess ? (
            <>
              {/* Va directo a la pantalla de sesión (el COMENZAR del Figma). Si por lo que
                  sea no llegó el id, cae en la lista, que es donde igual está la reserva. */}
              <Button
                label="Ver mi reserva"
                onPress={() =>
                  bookingId
                    ? router.replace({ pathname: '/(client)/bookings/[id]', params: { id: bookingId } })
                    : router.replace('/(client)/bookings')
                }
              />
              <Button
                label="Volver al inicio"
                variant="outlined"
                onPress={() => router.replace('/(client)')}
              />
            </>
          ) : (
            <>
              <Button label="Volver a intentar" onPress={() => router.back()} />
              <Button
                label="Elegir otro horario"
                variant="outlined"
                onPress={() =>
                  router.replace({
                    pathname: '/(client)/search/booking/[parkingId]',
                    params: { parkingId },
                  })
                }
              />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.md,
  },
});
