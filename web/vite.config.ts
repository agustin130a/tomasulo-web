import { defineConfig } from 'vite';

// Project site is served at https://<user>.github.io/tomasulo-web/
// In CI we set VITE_BASE=/tomasulo-web/ ; local dev uses '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
