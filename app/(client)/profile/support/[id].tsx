import { useLocalSearchParams } from 'expo-router';

import { SupportTicketThreadScreen } from '@/features/support/SupportTicketThreadScreen';

export default function ClientSupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportTicketThreadScreen role="client" ticketId={id} />;
}
