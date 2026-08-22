import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '@/features/messaging/ChatView';
import { useAuthStore } from '@/store/useAuthStore';

export default function OwnerChatScreen() {
  const { bookingId, title } = useLocalSearchParams<{ bookingId: string; title?: string }>();
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return null;

  return (
    <ChatView bookingId={bookingId} userId={profile.id} title={title || 'Chat con el cliente'} backHref="/(owner)/messages" />
  );
}
