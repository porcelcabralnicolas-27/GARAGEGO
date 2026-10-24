import { InfoScreen } from '@/features/info/InfoScreen';

export default function ClientInfoScreen() {
  return <InfoScreen kind="info" backHref="/(client)/profile/settings" />;
}
