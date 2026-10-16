import { useLocalSearchParams } from 'expo-router';

import { ChatView } from '@/features/messaging/ChatView';
import { useAuthStore } from '@/store/useAuthStore';

// La conversación se identifica por estacionamiento + la otra persona, no por reserva:
// varias reservas en el mismo lugar comparten un solo chat.
export default function ClientChatScreen() {
  const { lotId, peerId, title, lotName } = useLocalSearchParams<{
    lotId: string;
    peerId: string;
    title?: string;
    lotName?: string;
  }>();
  const profile = useAuthStore((s) => s.profile);

  if (!profile) return null;

  return (
    <ChatView
      parkingLotId={lotId}
      peerId={peerId}
      role="client"
      userId={profile.id}
      title={title || 'Chat con el propietario'}
      lotName={lotName}
      backHref="/(client)/messages"
    />
  );
}
