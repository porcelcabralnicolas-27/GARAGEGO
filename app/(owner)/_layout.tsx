import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useUnreadMessagesCount } from '@/features/notifications/useUnreadMessagesCount';
import { useUnreadNotificationsCount } from '@/features/notifications/useUnreadNotificationsCount';
import { useAuthStore } from '@/store/useAuthStore';
import { useTheme } from '@/theme';

export default function OwnerLayout() {
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile);
  const unreadMessages = useUnreadMessagesCount(profile?.id, 'owner');
  const unreadNotifications = useUnreadNotificationsCount(profile?.id, 'owner');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen
        name="parkings"
        options={{
          title: 'Publicaciones',
          tabBarIcon: ({ color, size }) => <Ionicons name="business" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Reservas',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} />,
          tabBarBadge: unreadMessages > 0 ? unreadMessages : undefined,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notificaciones',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" color={color} size={size} />,
          tabBarBadge: unreadNotifications > 0 ? unreadNotifications : undefined,
        }}
      />
      {/* Dashboard y estadísticas se abren desde Perfil: abajo quedan 5 tabs, como el conductor. */}
      <Tabs.Screen name="dashboard" options={{ href: null }} />
      <Tabs.Screen name="stats" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
