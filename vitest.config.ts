import { defineConfig } from 'vitest/config';

// e2e/ dijalankan Playwright (npm run e2e), bukan Vitest.
export default defineConfig({ test: { include: ['{shared,server}/test/**/*.test.ts'] } });
