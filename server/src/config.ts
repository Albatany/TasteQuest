import { isAbsolute, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export interface Config {
  host: string;
  port: number;
  dbPath: string;
  operatorPassword: string;
  deviceToken: string;
  offlineMs: number;
  sessionHours: number;
  webDist: string;
}

/** Baca konfigurasi dari environment (.env). Secrets wajib ada; tidak pernah dicetak ke log. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems: string[] = [];
  const operatorPassword = env.OPERATOR_PASSWORD ?? '';
  const deviceToken = env.DEVICE_TOKEN ?? '';
  if (operatorPassword.length < 8) problems.push('OPERATOR_PASSWORD minimal 8 karakter');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceToken)) problems.push('DEVICE_TOKEN 16–128 karakter [A-Za-z0-9_-]');
  if (problems.length) throw new Error(`Konfigurasi belum lengkap: ${problems.join('; ')}. Jalankan "npm run setup" untuk membuat .env.`);
  const dbPath = env.DB_PATH || 'data/tastequest.db';
  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT) || 3000,
    dbPath: dbPath === ':memory:' || isAbsolute(dbPath) ? dbPath : resolve(ROOT, dbPath),
    operatorPassword,
    deviceToken,
    offlineMs: Number(env.DEVICE_OFFLINE_MS) || 15000,
    sessionHours: Number(env.SESSION_TTL_HOURS) || 12,
    webDist: resolve(ROOT, 'web/dist'),
  };
}
