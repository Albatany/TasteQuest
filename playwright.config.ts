import { defineConfig, devices } from '@playwright/test';

// Smoke test memakai build produksi + database terpisah (data/e2e.db), tidak menyentuh data asli.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3100', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'rm -f data/e2e.db data/e2e.db-wal data/e2e.db-shm && node server/src/index.ts',
    url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false,
    env: { PORT: '3100', HOST: '127.0.0.1', DB_PATH: 'data/e2e.db', OPERATOR_PASSWORD: 'e2e-operator-pass', DEVICE_TOKEN: 'e2e-device-token-1234567890' },
  },
});
