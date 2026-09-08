import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puertos elegidos a propósito: 8081 lo usa Metro (la app Expo), 19000-19006 el tooling viejo de
// Expo, y 5173 es el default de Vite, que suele estar tomado por otro proyecto. Con estos, el
// `expo start` de la raíz y este servidor conviven sin pisarse.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5181, strictPort: true },
});
