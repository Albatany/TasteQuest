// Membuat .env dan firmware/include/secrets.h dengan secrets acak bila belum ada. Tidak pernah menimpa file yang sudah ada.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const secretsPath = resolve(root, 'firmware/include/secrets.h');
const token = () => randomBytes(24).toString('base64url');

if (existsSync(envPath)) {
  console.log('• .env sudah ada — tidak diubah.');
} else {
  const env = readFileSync(resolve(root, '.env.example'), 'utf8')
    .replace(/^OPERATOR_PASSWORD=.*$/m, `OPERATOR_PASSWORD=tq-${randomBytes(6).toString('hex')}`)
    .replace(/^DEVICE_TOKEN=.*$/m, `DEVICE_TOKEN=${token()}`);
  writeFileSync(envPath, env, { mode: 0o600 });
  console.log('✓ .env dibuat dengan password operator & token perangkat acak (lihat isinya untuk OPERATOR_PASSWORD).');
}

const deviceToken = /^DEVICE_TOKEN=(.*)$/m.exec(readFileSync(envPath, 'utf8'))?.[1]?.trim();
const port = /^PORT=(\d+)$/m.exec(readFileSync(envPath, 'utf8'))?.[1] ?? '3000';
const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);

if (existsSync(secretsPath)) {
  console.log('• firmware/include/secrets.h sudah ada — tidak diubah. Pastikan DEVICE_TOKEN sama dengan .env.');
} else {
  const h = readFileSync(resolve(root, 'firmware/include/secrets.example.h'), 'utf8')
    .replace(/#define DEVICE_TOKEN ".*"/, `#define DEVICE_TOKEN "${deviceToken}"`)
    .replace(/#define BACKEND_URL ".*"/, `#define BACKEND_URL "http://${ips[0] ?? '192.168.1.10'}:${port}"`);
  writeFileSync(secretsPath, h, { mode: 0o600 });
  console.log('✓ firmware/include/secrets.h dibuat (DEVICE_TOKEN sudah disamakan). Isi WIFI_SSID & WIFI_PASSWORD sebelum upload.');
}

console.log(`\nIP LAN laptop saat ini: ${ips.join(', ') || '(tidak ada — sambungkan ke Wi-Fi/hotspot dulu)'}`);
console.log('Bila IP berubah (ganti jaringan), perbarui BACKEND_URL di secrets.h lalu upload ulang firmware.\n');
