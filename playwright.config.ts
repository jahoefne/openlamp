/**
 * End-to-end smoke tests (tests/e2e) against the production build served by
 * `vite preview`, so they hit the real `/openlamp/` base path (assets, the
 * worker and the .wasm included). Run `npm run build` first; `npm run e2e`.
 *
 * The viewport is WebGL: headless Chromium renders it with SwiftShader (no
 * GPU on CI runners). Assertions read the build status and stats, not pixels.
 */
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const BASE_URL = 'http://localhost:4173/openlamp/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: CI,
  // Locally Playwright picks the worker count (half the cores); omitted rather
  // than `undefined` because of `exactOptionalPropertyTypes`.
  ...(CI ? { workers: 2 } : {}),
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Relative navigation (`page.goto('./')`) keeps the base path.
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
