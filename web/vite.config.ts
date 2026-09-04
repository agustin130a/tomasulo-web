import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Project site is served at https://<user>.github.io/tomasulo-web/
// In CI we set VITE_BASE=/tomasulo-web/ ; local dev uses '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        predictores: resolve(root, 'predictores.html'),
      },
    },
  },
});
