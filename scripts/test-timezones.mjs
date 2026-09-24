// Corre los tests sensibles a la hora con el "dispositivo" en varias zonas horarias.
//
// La app calcula todo en hora de Buenos Aires (shared/time.ts), así que el resultado tiene que ser
// el mismo esté donde esté el teléfono. TZ se fija al lanzar cada proceso porque dentro de Jest
// cambiar process.env.TZ no tiene efecto.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jestBin = require.resolve('jest/bin/jest');

const ZONES = [
  'America/Argentina/Buenos_Aires',
  'UTC',
  'America/Los_Angeles', // UTC-8/-7, con horario de verano
  'Europe/Madrid', // UTC+1/+2, con horario de verano
  'Asia/Tokyo', // UTC+9: ya es "mañana" durante la tarde de Argentina
  'Pacific/Kiritimati', // UTC+14, el extremo
];

const TIME_SENSITIVE_TESTS = ['shared/__tests__/time', 'src/features/booking/__tests__/availability'];

let failed = false;
for (const tz of ZONES) {
  console.log(`\n=== TZ=${tz} ===`);
  const result = spawnSync(process.execPath, [jestBin, '--ci', ...TIME_SENSITIVE_TESTS], {
    stdio: 'inherit',
    env: { ...process.env, TZ: tz },
  });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
