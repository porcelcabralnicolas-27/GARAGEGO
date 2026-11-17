// Región elegida en el perfil (profiles.region, migración 0086): Argentina, o Estados Unidos
// como DEMO para la presentación.
//
// La región solo cambia cómo la app MUESTRA e INGRESA los datos: idioma, moneda, zona horaria,
// ubicación y medios de pago. La base no cambia de convención (precios en pesos, horarios en
// hora de Buenos Aires), así reservas, cobros y cierres siguen funcionando igual.
//
// La región activa vive acá como estado de módulo (no en un hook) porque la usan funciones puras
// como formatMoney, que se llaman desde cualquier lado. La actualiza useAuthStore.setProfile; al
// cambiarla desde el perfil, la app vuelve al Inicio para que todas las pantallas se rearmen.

import { setDisplayLanguage, setDisplayTimeZone } from '../../shared/time';

export type RegionCode = 'AR' | 'US';

export type RegionConfig = {
  code: RegionCode;
  /** Nombre en el selector del perfil. */
  label: string;
  language: 'es' | 'en';
  /** Zona en la que se muestran e ingresan los horarios. */
  timeZone: string;
  /** Dónde arranca el mapa: en Estados Unidos reemplaza al GPS (ubicación simulada). */
  center: { latitude: number; longitude: number };
  /** Se agrega a las direcciones escritas a mano para que no se resuelvan en otro país. */
  countryName: string;
  /** Región que se le pasa al geocodificador de Google (sesgo de resultados). */
  geocodeRegion: string;
  /** Mercado Pago opera solo en Argentina: en la demo de EE. UU. se paga con la billetera. */
  mercadoPagoEnabled: boolean;
  /** true cuando la ubicación no es la del GPS sino la del centro de la región (demo). */
  simulatedLocation: boolean;
};

/** Tipo de cambio FIJO de la demo: pesos por dólar. Un precio de $5.000 se ve como US$ 5.00. */
export const DEMO_ARS_PER_USD = 1000;

export const REGIONS: Record<RegionCode, RegionConfig> = {
  AR: {
    code: 'AR',
    label: 'Argentina',
    language: 'es',
    timeZone: 'America/Argentina/Buenos_Aires',
    center: { latitude: -34.6037, longitude: -58.3816 }, // Obelisco
    countryName: 'Argentina',
    geocodeRegion: 'ar',
    mercadoPagoEnabled: true,
    simulatedLocation: false,
  },
  US: {
    code: 'US',
    label: 'Estados Unidos',
    language: 'en',
    timeZone: 'America/New_York',
    center: { latitude: 40.7549, longitude: -73.984 }, // Midtown Manhattan
    countryName: 'USA',
    geocodeRegion: 'us',
    mercadoPagoEnabled: false,
    simulatedLocation: true,
  },
};

let activeCode: RegionCode = 'AR';

export function setActiveRegion(code: string | null | undefined): void {
  activeCode = code === 'US' ? 'US' : 'AR';
  setDisplayTimeZone(REGIONS[activeCode].timeZone);
  setDisplayLanguage(REGIONS[activeCode].language);
}

export function activeRegion(): RegionConfig {
  return REGIONS[activeCode];
}
