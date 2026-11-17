import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUnreadMessagesCount } from '@/features/notifications/useUnreadMessagesCount';
import { useUnreadNotificationsCount } from '@/features/notifications/useUnreadNotificationsCount';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

export default function ClientLayout() {
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const unreadMessages = useUnreadMessagesCount(profile?.id, 'client');
  const unreadNotifications = useUnreadNotificationsCount(profile?.id, 'client');

  return (
    <Tabs
      // Las pestañas quedan montadas al navegar: sin esta key, al cambiar de región (demo
      // regional, 0086) seguirían mostrando el mapa, los textos y la ubicación de la anterior.
      // Con la región como key se arman de nuevo y todo toma la región nueva.
      key={profile?.region ?? 'AR'}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('Inicio'), tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
        // Tocar Inicio vuelve al mapa con todos los estacionamientos: se borra lo que haya quedado de una
        // búsqueda anterior (distancia, filtros o dirección). Sin esto la pestaña conservaba esos
        // parámetros y el mapa seguía mostrando solo lo que entraba en el filtro.
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.setParams({
              lat: undefined,
              lng: undefined,
              radiusKm: undefined,
              maxPrice: undefined,
              minRating: undefined,
              place: undefined,
              notice: undefined,
            } as never);
          },
        })}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: t('Reservas'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('Mensajes'),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} />,
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('Notificaciones'),
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} />,
          tabBarBadge: unreadNotifications > 0 ? unreadNotifications : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('Perfil'), tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="vehicles" options={{ href: null }} />
      {/* Adonde vuelve el comprador desde Mercado Pago (pago de reserva o recarga). */}
      <Tabs.Screen name="payment-return" options={{ href: null }} />
    </Tabs>
  );
}
