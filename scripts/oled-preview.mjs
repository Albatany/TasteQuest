// Pratinjau layar OLED tanpa board: U8g2 (C) + firmware/include/screens.h dikompilasi di laptop, hasil disimpan sebagai PNG.
//   npm run oled:preview                       → data/oled/preview.png
//   node scripts/oled-preview.mjs <src.cpp> <out.png>
// Butuh gcc/g++ dan U8g2 hasil `npm run fw:build`.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import readline from 'node:readline';
import { deflateSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const src = resolve(process.argv[2] ?? join(root, 'firmware/test/render_screens.cpp'));
const out = resolve(process.argv[3] ?? join(root, 'data/oled/preview.png'));
const lib = join(root, 'firmware/.pio/libdeps/nodemcuv2/U8g2/src');
const clib = join(lib, 'clib');
const work = join(root, 'data/oled');
if (!existsSync(clib)) {
  console.error('U8g2 belum terunduh. Jalankan `npm run fw:build` sekali dulu.');
  process.exit(1);
}
mkdirSync(join(work, 'obj'), { recursive: true });
mkdirSync(dirname(out), { recursive: true });

// 1. Pustaka C U8g2, dikompilasi sekali lalu di-cache. File font raksasa dilewati.
const objs = readdirSync(clib).filter((f) => f.endsWith('.c') && !f.endsWith('_fonts.c')).map((f) => {
  const o = join(work, 'obj', `${f}.o`);
  if (!existsSync(o)) execFileSync('gcc', ['-c', '-O1', '-w', '-I', clib, join(clib, f), '-o', o]);
  return o;
});

// 2. Hanya font yang benar-benar dipakai diambil dari u8g2_fonts.c (±40 MB).
const used = new Set([src, join(root, 'firmware/include/screens.h')].filter((f) => existsSync(f)).flatMap((f) => readFileSync(f, 'utf8').match(/u8g2_font_\w+/g) ?? []));
let fonts = '#include "u8g2.h"\n';
let take = false;
for await (const line of readline.createInterface({ input: createReadStream(join(clib, 'u8g2_fonts.c')) })) {
  const m = /^const uint8_t (u8g2_font_\w+)\[/.exec(line);
  if (m) take = used.has(m[1]);
  if (take) {
    fonts += `${line}\n`;
    if (line.trimEnd().endsWith('";')) take = false;
  }
}
writeFileSync(join(work, 'fonts_subset.c'), fonts);
execFileSync('gcc', ['-c', '-O1', '-w', '-I', clib, join(work, 'fonts_subset.c'), '-o', join(work, 'fonts_subset.o')]);

// 3. Kompilasi & jalankan program render. Setiap baris: label \t lebar \t tinggi \t buffer hex (layout halaman SSD1306).
const bin = join(work, 'render');
execFileSync('g++', ['-std=c++17', '-O1', '-Wall', '-Wextra', `-I${join(root, 'firmware/include')}`, `-I${lib}`, `-I${clib}`, src, join(work, 'fonts_subset.o'), ...objs, '-o', bin]);
const frames = execFileSync(bin, { maxBuffer: 64 << 20 }).toString().trim().split('\n').map((l) => {
  const [label, w, h, hex] = l.split('\t');
  return { label, w: Number(w), h: Number(h), buf: Buffer.from(hex, 'hex') };
});

// 4. Gabungkan jadi satu PNG (skala 3×, warna OLED biru-putih).
const S = 3, COLS = 4, PAD = 12, CW = 128 * S, CH = 64 * S;
const W = COLS * (CW + PAD) + PAD, H = Math.ceil(frames.length / COLS) * (CH + PAD) + PAD;
const rgb = Buffer.alloc(W * H * 3, 0x24);
frames.forEach((f, i) => {
  const ox = PAD + (i % COLS) * (CW + PAD), oy = PAD + Math.floor(i / COLS) * (CH + PAD);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 128; x++) {
      const on = y < f.h && ((f.buf[(y >> 3) * f.w + x] >> (y & 7)) & 1);
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const p = ((oy + y * S + dy) * W + ox + x * S + dx) * 3;
          if (on) { rgb[p] = 0xcf; rgb[p + 1] = 0xe8; rgb[p + 2] = 0xff; } else { rgb[p] = rgb[p + 1] = rgb[p + 2] = y < f.h ? 0 : 0x24; }
        }
      }
    }
  }
});
const crc = (b) => {
  let c = ~0;
  for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const td = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out} (${frames.length} frame, urut kiri→kanan, atas→bawah):`);
frames.forEach((f, i) => console.log(`  ${String(i + 1).padStart(2)}. ${f.label}`));
