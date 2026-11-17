// Límites que el equipo configura desde el panel (Configuración → Límites, migración 0093).
//
// La base es la que los hace cumplir (triggers y RPCs); la app los lee con `public_settings()` para
// mostrar los mismos números en pantalla y no ofrecer algo que el servidor va a rechazar.
//
// Igual que la región (src/lib/region.ts), el valor vigente vive en un estado de módulo: así lo
// pueden leer también funciones que no son componentes (los mensajes de error de cada api). Las
// pantallas usan `useAppLimits()`, que además se re-renderiza cuando llegan los valores.
//
// Si la consulta falla (sin conexión, migración sin correr), se usan los valores de antes de la
// 0093: la app funciona igual, y lo que mande el servidor sigue siendo la regla.

import { supabase } from '@/lib/supabase/client';

export type AppLimits = {
  maxParkingImages: number;
  maxVehiclesPerRegion: number;
  capacityMin: number;
  capacityMax: number;
  walletMaxBalance: number;
  topupMin: number;
  topupMax: number;
  topupQuickAmounts: number[];
};

export const DEFAULT_APP_LIMITS: AppLimits = {
  maxParkingImages: 3,
  maxVehiclesPerRegion: 3,
  capacityMin: 1,
  capacityMax: 50,
  walletMaxBalance: 200000,
  topupMin: 100,
  topupMax: 50000,
  topupQuickAmounts: [5000, 10000, 15000, 20000],
};

let current: AppLimits = DEFAULT_APP_LIMITS;

export function appLimits(): AppLimits {
  return current;
}

export function setAppLimits(limits: AppLimits): void {
  current = limits;
}

const positiveInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;

/** Convierte lo que devuelve `public_settings()`. Cada valor raro o faltante cae a su default. */
export function parseAppLimits(raw: unknown): AppLimits {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_APP_LIMITS;
  const limits: AppLimits = {
    maxParkingImages: positiveInt(s.max_parking_images, d.maxParkingImages),
    maxVehiclesPerRegion: positiveInt(s.max_vehicles_per_region, d.maxVehiclesPerRegion),
    capacityMin: positiveInt(s.parking_capacity_min, d.capacityMin),
    capacityMax: positiveInt(s.parking_capacity_max, d.capacityMax),
    walletMaxBalance: positiveInt(s.wallet_max_balance, d.walletMaxBalance),
    topupMin: positiveInt(s.topup_min, d.topupMin),
    topupMax: positiveInt(s.topup_max, d.topupMax),
    topupQuickAmounts: d.topupQuickAmounts,
  };
  if (Array.isArray(s.topup_quick_amounts)) {
    const amounts = s.topup_quick_amounts
      .filter((a): a is number => typeof a === 'number' && Number.isInteger(a) && a > 0)
      .sort((a, b) => a - b);
    if (amounts.length > 0) limits.topupQuickAmounts = amounts;
  }
  // Un par mínimo/máximo que no cierra no se puede usar: se vuelve a los de siempre.
  if (limits.capacityMin > limits.capacityMax) {
    limits.capacityMin = d.capacityMin;
    limits.capacityMax = d.capacityMax;
  }
  if (limits.topupMin > limits.topupMax) {
    limits.topupMin = d.topupMin;
    limits.topupMax = d.topupMax;
  }
  return limits;
}

/** Trae los límites, los deja como vigentes y los devuelve. */
export async function fetchAppLimits(): Promise<AppLimits> {
  const { data, error } = await supabase.rpc('public_settings');
  if (error) throw error;
  const limits = parseAppLimits(data);
  setAppLimits(limits);
  return limits;
}
