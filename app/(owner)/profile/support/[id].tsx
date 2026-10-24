import { useLocalSearchParams } from 'expo-router';

import { SupportTicketThreadScreen } from '@/features/support/SupportTicketThreadScreen';

export default function OwnerSupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SupportTicketThreadScreen role="owner" ticketId={id} />;
}
