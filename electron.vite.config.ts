import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const rootDir = __dirname;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(rootDir, 'src/main'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(rootDir, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(rootDir, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(rootDir, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(rootDir, 'src/renderer'),
        '@shared': resolve(rootDir, 'src/shared'),
      },
    },
    build: {
      outDir: resolve(rootDir, 'out/renderer'),
      rollupOptions: {
        input: resolve(rootDir, 'src/renderer/index.html'),
      },
    },
  },
});
