import { SettingsView } from '@/features/profile/SettingsView';

export default function ClientSettingsScreen() {
  return <SettingsView backHref="/(client)/profile" role="client" />;
}
