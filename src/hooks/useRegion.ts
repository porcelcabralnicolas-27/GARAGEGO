import { REGIONS, type RegionConfig } from '@/lib/region';
import { useAuthStore } from '@/store/useAuthStore';

/** La región del perfil, para los componentes que tienen que rearmarse si cambia. */
export function useRegion(): RegionConfig {
  const code = useAuthStore((s) => s.profile?.region ?? 'AR');
  return REGIONS[code];
}
