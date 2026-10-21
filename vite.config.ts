import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // Served from GitHub Pages at https://jahoefne.github.io/openlamp/, so every
  // asset URL (scripts, styles, the worker and the .wasm) is prefixed with the
  // repo path. Dev and preview use the same base: http://localhost:5173/openlamp/.
  base: '/openlamp/',
  plugins: [react()],
  // Mirrors `paths` in tsconfig.base.json. src/core itself imports relatively
  // (with .ts extensions) so Node can run it without a bundler.
  resolve: { alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) } },
  // manifold-3d locates its .wasm next to its own .js file; keep it out of the
  // dependency pre-bundle so that path stays valid in dev, and let the worker
  // import it as a plain module.
  optimizeDeps: { exclude: ['manifold-3d'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1200 },
});
