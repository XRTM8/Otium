import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/{core,scanner,board,platform,app}/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'html', 'json'],
      // Prevent regressions across the five modules while expanding coverage toward 85%.
      thresholds: { lines: 55, branches: 43 },
    },
  }
});
