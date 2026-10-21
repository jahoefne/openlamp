import { defineConfig } from 'vite';

export default defineConfig({
  // manifold-3d locates its .wasm next to its own .js file; keep it out of the
  // dependency pre-bundle so that path stays valid in dev, and let the worker
  // import it as a plain module.
  optimizeDeps: { exclude: ['manifold-3d'] },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1200 },
});
