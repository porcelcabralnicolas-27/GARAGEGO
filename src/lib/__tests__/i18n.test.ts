/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BOOKING_STATUS_LABELS } from '@/features/booking/types';
import { DAY_LABELS } from '@/features/parking/types';

import { AMENITY_LABELS, LOT_TYPE_LABELS } from '../../../shared/domain';
import { t } from '../i18n';
import { EN } from '../i18n.en';
import { setActiveRegion } from '../region';

// Demo de presentación regional (0086): en Estados Unidos el recorrido de la demo se ve en
// inglés. Estos tests evitan que quede un texto en español por olvidarse de traducirlo.

const ROOT = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Todos los textos fijos que el código pasa a t('...'). */
function translatedLiterals(): { key: string; file: string }[] {
  const keyRe = /\bt\('((?:[^'\\]|\\.)*)'/g;
  return ['app', 'src'].flatMap((dir) =>
    sourceFiles(join(ROOT, dir)).flatMap((file) => {
      const code = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
        .join('\n');
      return [...code.matchAll(keyRe)].map((m) => ({ key: m[1].replace(/\\'/g, "'"), file }));
    })
  );
}

describe('traducciones al inglés', () => {
  afterEach(() => setActiveRegion('AR'));

  it('cada t() del código tiene su traducción', () => {
    const missing = translatedLiterals().filter(({ key }) => !(key in EN));
    expect(missing).toEqual([]);
  });

  it('las etiquetas que se traducen por variable también están', () => {
    const indirect = [
      ...Object.values(BOOKING_STATUS_LABELS),
      ...Object.values(AMENITY_LABELS),
      ...Object.values(LOT_TYPE_LABELS),
      ...DAY_LABELS,
      'Sesión activa',
      'Lugares reservados',
      'Esperando pago',
      'Cualquiera',
      '3+ estrellas',
      '4+ estrellas',
      'Argentina',
      'Español · Pesos (ARS)',
      'English · Dólares (USD)',
      'Mis vehículos',
      'Soporte y ayuda',
      'Legal',
      'Información',
      'Seguridad',
      'Estados Unidos',
      'En curso',
      'No se presentó',
    ];
    expect(indirect.filter((label) => !(label in EN))).toEqual([]);
  });

  it('los mensajes de error de reservas y pagos están traducidos', () => {
    const files = ['src/features/booking/api.ts', 'src/features/payments/api.ts'].map((f) => join(ROOT, f));
    const messages = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/return '([^'\\]*(?:\\.[^'\\]*)*)';/g)].map((m) => m[1].replace(/\\'/g, "'"))
    );
    expect(messages.length).toBeGreaterThan(10);
    expect(messages.filter((message) => !(message in EN))).toEqual([]);
  });

  it('en Argentina deja el español y reemplaza los valores', () => {
    setActiveRegion('AR');
    expect(t('Reservar')).toBe('Reservar');
    expect(t('Pagar {amount} con billetera', { amount: '$ 500,00' })).toBe('Pagar $ 500,00 con billetera');
  });

  it('en Estados Unidos traduce y reemplaza los valores', () => {
    setActiveRegion('US');
    expect(t('Reservar')).toBe('Book');
    expect(t('Pagar {amount} con billetera', { amount: 'US$ 5.00' })).toBe('Pay US$ 5.00 with wallet');
    expect(t('Un texto que no está en el diccionario')).toBe('Un texto que no está en el diccionario');
  });
});
