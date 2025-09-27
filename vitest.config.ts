import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootDir = __dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@main': resolve(rootDir, 'src/main'),
      '@shared': resolve(rootDir, 'src/shared'),
      '@renderer': resolve(rootDir, 'src/renderer'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/main/**/*.test.ts',
            'src/preload/**/*.test.ts',
            'src/shared/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          setupFiles: ['src/renderer/testSetup.ts'],
          include: ['src/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
