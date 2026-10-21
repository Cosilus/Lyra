import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (5173) and /api is forwarded to Express (3001).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  test: { include: ['tests/**/*.test.ts'] },
});
