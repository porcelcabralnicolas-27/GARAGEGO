import { SettingsView } from '@/features/profile/SettingsView';

export default function OwnerSettingsScreen() {
  return <SettingsView backHref="/(owner)/profile" role="owner" />;
}
