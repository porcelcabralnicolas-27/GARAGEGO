import { RegionView } from '@/features/profile/RegionView';

export default function OwnerRegionScreen() {
  return <RegionView backHref="/(owner)/profile/settings" homeHref="/(owner)/parkings" />;
}
