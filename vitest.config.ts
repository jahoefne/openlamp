import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
      // One process per test file: each gets its own WASM heap.
      pool: 'forks',
      testTimeout: 30_000,
      hookTimeout: 30_000,
      // Let Node load the Emscripten glue (and find manifold.wasm next to it)
      // natively, the same way the CLI does.
      server: { deps: { external: [/manifold-3d/] } },
    },
  }),
);
