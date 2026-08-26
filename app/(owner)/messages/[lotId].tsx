import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '@/features/messaging/ChatView';
import { useAuthStore } from '@/store/useAuthStore';

// Para el propietario el hilo es por (estacionamiento, cliente): el mismo cliente en dos
// estacionamientos distintos son dos conversaciones separadas.
export default function OwnerChatScreen() {
  const { lotId, peerId, title } = useLocalSearchParams<{ lotId: string; peerId: string; title?: string }>();
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return null;

  return (
    <ChatView
      parkingLotId={lotId}
      peerId={peerId}
      role="owner"
      userId={profile.id}
      title={title || 'Chat con el cliente'}
      backHref="/(owner)/messages"
    />
  );
}
