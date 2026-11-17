import { useEffect, useState } from 'react';

import { useRealtimeRefresh } from '../../lib/useRealtimeRefresh';
import {
  activeReasonsByKind,
  DEFAULT_PRICE_FACTOR,
  DEFAULT_SLA,
  FALLBACK_REASONS,
  fetchReasons,
  fetchSla,
  type ReasonKind,
  type SlaHours,
} from './moderationSettingsApi';

export type ModerationConfig = {
  /** Motivos activos de cada tipo, en orden (nunca vacío). */
  reasons: Record<ReasonKind, string[]>;
  /** Horas a partir de las cuales la cola pasa a azul, amarillo y rojo. */
  sla: SlaHours;
  /** Factor del control automático de tarifa (0096). */
  priceFactor: number;
};

// Lo vigente, compartido entre pantallas: así un diálogo que se abre ya tiene los motivos.
let current: ModerationConfig = { reasons: FALLBACK_REASONS, sla: DEFAULT_SLA, priceFactor: DEFAULT_PRICE_FACTOR };

/**
 * Motivos y plazos de moderación (0095) para Inventario y Usuarios. Si la migración no está o la
 * consulta falla, quedan las listas y los plazos de antes.
 */
export function useModerationConfig(): ModerationConfig {
  const [config, setConfig] = useState<ModerationConfig>(current);

  const load = () => {
    void Promise.allSettled([fetchReasons(), fetchSla()]).then(([reasons, sla]) => {
      current = {
        reasons: reasons.status === 'fulfilled' ? activeReasonsByKind(reasons.value) : current.reasons,
        sla: sla.status === 'fulfilled' ? sla.value.sla : current.sla,
        priceFactor: sla.status === 'fulfilled' ? sla.value.priceFactor : current.priceFactor,
      };
      setConfig(current);
    });
  };

  useEffect(load, []);
  useRealtimeRefresh('admin-moderation-config', ['moderation_reasons', 'app_settings'], load);

  return config;
}
