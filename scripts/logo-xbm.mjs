// Mengubah logo resmi HMIF (web/public/brand/logo-hmif.png) menjadi bitmap 1-bit untuk OLED.
//   node scripts/logo-xbm.mjs                      → tulis firmware/include/hmif_logo.h
//   node scripts/logo-xbm.mjs --preview out.png    → bandingkan beberapa ukuran/ambang
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const png = readFileSync(resolve(root, 'web/public/brand/logo-hmif.png')).toString('base64');
const W = 100, H = 64, THRESHOLD = 50; // dipilih dari --preview: bingkai utuh dan "Universitas Jambi" masih terbaca

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<img id="i" src="data:image/png;base64,${png}">`);
await page.waitForFunction(() => document.getElementById('i').complete);

// Kecilkan dengan smoothing tinggi, lalu piksel menyala bila (alpha × kecerahan) melewati ambang.
const bitsFor = (w, h, thr) => page.evaluate(([w, h, thr]) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(document.getElementById('i'), 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  return Array.from({ length: w * h }, (_, i) => (d[i * 4 + 3] * (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765 > thr ? 1 : 0));
}, [w, h, thr]);

const out = process.argv[process.argv.indexOf('--preview') + 1];
if (process.argv.includes('--preview')) {
  const variants = [[100, 64, 50], [100, 64, 90], [100, 64, 140], [88, 56, 90]];
  const rows = [];
  for (const [w, h, t] of variants) rows.push({ w, h, t, bits: await bitsFor(w, h, t) });
  await page.setContent('<body style="margin:0;background:#111;display:flex;flex-wrap:wrap;gap:16px;padding:16px;font:14px sans-serif;color:#ccc"></body>');
  await page.evaluate((rows) => {
    for (const { w, h, t, bits } of rows) {
      const c = Object.assign(document.createElement('canvas'), { width: 128 * 4, height: 64 * 4 });
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#cfe8ff';
      const ox = (128 - w) >> 1, oy = (64 - h) >> 1;
      bits.forEach((b, i) => b && g.fillRect((ox + (i % w)) * 4, (oy + Math.floor(i / w)) * 4, 4, 4));
      const f = document.createElement('figure');
      f.append(c, Object.assign(document.createElement('figcaption'), { textContent: `${w}×${h} ambang ${t}` }));
      document.body.append(f);
    }
  }, rows);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.screenshot({ path: out, fullPage: true });
} else {
  const bits = await bitsFor(W, H, THRESHOLD);
  const stride = Math.ceil(W / 8);
  const bytes = [];
  for (let y = 0; y < H; y++) {
    for (let bx = 0; bx < stride; bx++) {
      let v = 0;
      for (let k = 0; k < 8; k++) if (bx * 8 + k < W && bits[y * W + bx * 8 + k]) v |= 1 << k; // XBM: bit 0 = piksel paling kiri
      bytes.push(`0x${v.toString(16).padStart(2, '0')}`);
    }
  }
  const lines = [];
  for (let i = 0; i < bytes.length; i += stride) lines.push(`  ${bytes.slice(i, i + stride).join(', ')},`);
  writeFileSync(resolve(root, 'firmware/include/hmif_logo.h'), `// Logo resmi HMIF UNJA (hmifunja.my.id), dikonversi oleh scripts/logo-xbm.mjs — jangan diedit manual.
#pragma once
#include <stdint.h>
#ifndef U8X8_PROGMEM
#define U8X8_PROGMEM
#endif
#define HMIF_LOGO_W ${W}
#define HMIF_LOGO_H ${H}
static const uint8_t HMIF_LOGO_BITS[] U8X8_PROGMEM = {
${lines.join('\n')}
};
`);
  console.log(`firmware/include/hmif_logo.h ditulis (${W}×${H}, ${bytes.length} byte)`);
}
await browser.close();
