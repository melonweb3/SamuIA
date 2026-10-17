import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    viewport: { width: 1440, height: 1050 },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ['--no-sandbox'],
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node apps/server/dist/index.js',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
});
