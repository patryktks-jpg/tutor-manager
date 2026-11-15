import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: true
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/domain/**'],
      exclude: ['src/domain/types.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90
      }
    }
  }
} as any);
