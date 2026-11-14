import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['experiments/media-lab/**/*.test.ts', 'experiments/media-lab/**/*.test.tsx'],
  environment: 'happy-dom', restoreMocks: true, clearMocks: true,
} });
