import { networkInterfaces } from 'node:os';
import { createApp, VERSION } from './app.ts';
import { loadConfig } from './config.ts';

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(`\n✖ ${(e as Error).message}\n`);
  process.exit(1);
}

const { server, db, close } = createApp(cfg);

server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `\n✖ Port ${cfg.port} sudah dipakai. Ubah PORT di .env atau hentikan proses lain.\n` : e);
  process.exit(1);
});

server.listen(cfg.port, cfg.host, () => {
  const lan = Object.values(networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
  console.log(`\nTasteQuest v${VERSION} — HMIF UNJA × FST Market Day 2026 · © Muhammad Aziz Syah Dani 2026`);
  console.log(`  Dashboard : http://localhost:${cfg.port}`);
  for (const ip of lan) console.log(`  LAN       : http://${ip}:${cfg.port}   (BACKEND_URL firmware: http://${ip}:${cfg.port})`);
  console.log(`  Kiosk     : http://localhost:${cfg.port}/#/kiosk`);
  console.log(`  Database  : ${db.path}`);
  console.log(`  Mode      : ${db.settings().mode.toUpperCase()}\n`);
});

const stop = async () => {
  await close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
