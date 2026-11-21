# TasteQuest v3

**HMIF UNJA × FST MARKET DAY 2026: PLAY. EXPLORE. RATE.**

Proyek IoT interaktif untuk stan pameran karya mata kuliah Informatika Universitas Jambi:

- **ProxiRush**: permainan ketepatan jarak ultrasonik 5 ronde (HC-SR04 + pad sentuh TTP223 + OLED + buzzer).
- **Exhibition Rating**: rating sukarela 1–5 bintang untuk karya, langsung di alat.
- **Dashboard IoT real-time**: Overview, Arena, Leaderboard, Visitor Reviews, Device Monitor, Pengaturan, dan Kiosk layar penuh.

Semua berjalan **lokal tanpa internet**: ESP8266 → HTTP → laptop (Express + SQLite) → Socket.IO → browser.

## Mulai cepat

```bash
npm install          # sekali, butuh internet
npm run setup        # membuat .env (password operator & token acak) + firmware/include/secrets.h
npm run build        # build dashboard
npm start            # jalankan server + dashboard (offline OK)
```

- Dashboard: <http://localhost:3000> · Kiosk: <http://localhost:3000/#/kiosk>
- Dari perangkat lain di jaringan: `http://<IP-LAN-laptop>:3000` (dicetak saat `npm start`)
- Password operator: `OPERATOR_PASSWORD` di `.env`
- Demo tanpa hardware: Pengaturan → login → mode **DEMO** → ProxiRush Arena → **Nyalakan** simulator.

Butuh Node.js ≥ 22.13 (memakai `node:sqlite` bawaan dan menjalankan TypeScript server langsung; diuji di Node 24.22). Panduan jaringan, hotspot 2,4 GHz, firewall: [`docs/SETUP.md`](docs/SETUP.md).

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | server produksi (melayani `web/dist`, same-origin) |
| `npm run dev` | server `--watch` + Vite dev (port 5173, proxy ke 3000) |
| `npm run build` | build dashboard ke `web/dist` |
| `npm run typecheck` | `tsc` untuk server/shared, web, e2e |
| `npm run lint` | ESLint |
| `npm test` | unit + integration test (Vitest) |
| `npm run test:fw` | test logika firmware di host (g++) |
| `npm run e2e` | browser smoke test (Playwright, build produksi + DB terpisah `data/e2e.db`) |
| `npm run fw:build` | kompilasi firmware `nodemcuv2` (PlatformIO) |
| `npm run oled:preview` | render semua layar OLED ke `data/oled/preview.png` tanpa board |
| `npm run check` | typecheck + lint + test + test:fw + build |

## Struktur

```
shared/src/game.ts      scoring, TouchClassifier, finite state machine (dipakai server, simulator, test)
shared/src/schema.ts    kontrak event v1 (Zod) + tipe bersama
server/src/             Express 5 + node:sqlite + Socket.IO (app.ts, db.ts, config.ts, index.ts)
web/src/                React 19 + Vite + Tailwind 4 + Recharts (pages/, components/, lib/sim.ts = simulator Demo)
web/public/brand/       logo resmi HMIF (dari hmifunja.my.id)
firmware/include/       config.h (pin & hardware), logic.h (cerminan C++ game.ts), payload.h (JSON ke server),
                        screens.h (semua layar OLED + animasi IDLE), hmif_logo.h (logo HMIF 100×64), secrets.example.h
firmware/src/main.cpp   OLED, HC-SR04, TTP223 (ISR), buzzer, Wi-Fi, antrean event, heartbeat/telemetry
firmware/test/          test host logic.h
e2e/                    Playwright smoke test
scripts/                setup.mjs, oled-preview.mjs, logo-xbm.mjs (konversi logo HMIF ke bitmap OLED)
docs/                   BRAND, WIRING, SETUP, ANALYSIS, PRESENTATION, TEST_REPORT, PROGRESS
data/                   SQLite (diabaikan git)
```

## Hardware & pin (ESP8266 NodeMCU `nodemcuv2`)

| Komponen | Signal | Pin | GPIO |
|---|---|---|---|
| OLED I2C | SCL / SDA | D1 / D2 | 5 / 4 |
| HC-SR04 | TRIG / ECHO | D6 / D5 | 12 / 14 |
| TTP223 | OUT | D7 | 13 |
| Buzzer | Control | D0 | 16 |

**ECHO wajib lewat pembagi tegangan** (2,2 kΩ + 3,3 kΩ → ±3,0 V). OLED & TTP223 di 3,3 V, HC-SR04 di 5 V, GND disatukan, rail 5 V dan 3,3 V tidak boleh tersambung. Keselamatan, driver buzzer, kalibrasi, troubleshooting, dan checklist hardware: [`docs/WIRING.md`](docs/WIRING.md). **Hardware belum diuji fisik.**

```bash
pio run -d firmware                 # build (sudah diverifikasi)
pio run -d firmware -t upload       # upload — hanya setelah wiring diperiksa & disetujui
pio device monitor -d firmware      # log Serial 115200
```

Konfigurasi OLED (alamat, SSD1306/SH1106, 128×64/128×32), buzzer aktif/pasif & polaritas, polaritas touch, dan kalibrasi sensor ada di `firmware/include/config.h`.

## Alur perangkat

`IDLE → MENU → READY → COUNTDOWN → ROUND_ACTIVE → ROUND_RESULT (×5) → GAME_RESULT → RATING_OFFER → RATING → THANK_YOU → IDLE`

- Sentuh singkat: navigasi, pilih bintang (1→5→1), kunci jarak. Tahan ±1,2 dtk: konfirmasi.
- Menu: *Main ProxiRush* (langsung 5 ronde asli yang dinilai), *Latihan* (jarak tampil langsung, tidak masuk leaderboard), *Beri Rating* (langsung, tanpa main).
- Latihan tidak disimpan dan tidak dijumlahkan. Sejak fw 3.1.1 tidak ada lagi latihan sebelum main; server tetap menerima state `RP_PRACTICE` dari fw 3.1.0.
- Kunci jarak: sentuh pad, atau diam saja. Saat waktu habis jawaban terkunci otomatis dengan median 5 bacaan valid terakhir. Skor 0 hanya bila sepanjang ronde tidak ada bacaan valid (atau jaraknya memang jauh).
- Skor ronde dihitung dalam persepuluhan cm: `a10 = round(terukur × 10)`, `t10 = target × 10`. Bila `t10 ≤ a10 ≤ t10 + 9` (target s.d. +0,9 cm) skor 100; selain itu `clamp(100 − |a10 − t10|, 0, 100)`. Maks 500.
- Label akhir di OLED: ≥ 450 MASTER, ≥ 330 PRO, ≥ 170 NICE, selain itu COBA LAGI. Buzzer memainkan melodi akhir sesuai skor: ≥ 330 senang, 170 s.d. 329 sedang, < 170 sedih (buzzer aktif hanya membawa ritmenya, nada butuh buzzer pasif).
- Leaderboard: skor tertinggi → total waktu kunci tercepat → selesai paling awal.

## Demo Mode & Live Mode

| | DEMO | LIVE |
|---|---|---|
| Sumber | simulator browser `SIM-01` (butuh login operator) | ESP8266 dengan `DEVICE_TOKEN` |
| Saat alat tidak ada | — | OFFLINE + "terakhir terlihat", tanpa angka simulasi |
| Data | terpisah, bisa di-reset | tidak pernah terhapus oleh reset demo |

Server menolak data demo yang memakai identitas live dan sebaliknya; simulator ditolak saat mode LIVE. Badge DEMO/LIVE selalu terlihat.

## API (v1)

| Method & path | Auth | Fungsi |
|---|---|---|
| `GET /api/health` | — | status server |
| `POST /api/device/heartbeat` | perangkat | RSSI, uptime, heap, antrean → balasan berisi config |
| `GET /api/device/config` | perangkat | config game |
| `POST /api/device/telemetry` | perangkat | state FSM, jarak live, touch, error (tidak disimpan per sampel) |
| `POST /api/device/events` | perangkat | event `game` / `rating`, idempoten per `eventId` (201 baru, 200 duplikat) |
| `GET /api/devices` | — | status perangkat |
| `GET /api/overview` · `/api/leaderboard` · `/api/reviews` | — | data dashboard (`?mode=demo\|live`) |
| `GET /api/settings` | — | pengaturan publik |
| `PUT /api/settings` | operator | mode, target, durasi, mute |
| `POST /api/auth/login` · `/logout` · `GET /api/auth/me` | — | sesi operator (cookie HttpOnly) |
| `PATCH /api/sessions/:id` | operator | nickname pemain |
| `GET /api/export/games.csv` · `/ratings.csv` | operator | ekspor CSV (UTF-8, WIB) |
| `POST /api/admin/reset-demo` | operator | hapus data demo (`{"confirm":"RESET"}`) |

Perangkat: `Authorization: Bearer <DEVICE_TOKEN>`. Simulator: cookie operator. Semua payload perangkat memakai `v: 1` dan divalidasi Zod di `shared/src/schema.ts`; server menghitung ulang skor. Socket.IO menyiarkan `device`, `game`, `rating`, `settings`, `data`.

## Keamanan

Secrets di `.env` dan `firmware/include/secrets.h` (keduanya di `.gitignore`), token dibandingkan *timing-safe*, rate limiting, CSP ketat (`default-src 'self'`), CSV aman dari formula injection, tidak ada secrets di log atau browser. Sesi operator disimpan di memori (login ulang setelah restart server).

## Dokumentasi

- [`docs/BRAND.md`](docs/BRAND.md) — sumber brand HMIF, design tokens, audit desain & kontras
- [`docs/WIRING.md`](docs/WIRING.md) — wiring, keselamatan, kalibrasi, troubleshooting, checklist hardware
- [`docs/SETUP.md`](docs/SETUP.md) — jaringan lokal, offline, firewall, upload, pemulihan Wi-Fi
- [`docs/TUTORIAL-LOCALHOST.md`](docs/TUTORIAL-LOCALHOST.md) — langkah demi langkah: dashboard di localhost, dengan internet (biasa) atau tanpa internet (hotspot laptop)
- [`docs/ANALYSIS.md`](docs/ANALYSIS.md) — analisis kritis pengukuran, bias data, risiko
- [`docs/PRESENTATION.md`](docs/PRESENTATION.md) — naskah presentasi 2–3 menit & kartu instruksi pengunjung
- [`docs/TEST_REPORT.md`](docs/TEST_REPORT.md) — hasil pengujian

## Tentang

TasteQuest v3 dibuat oleh **Muhammad Aziz Syah Dani** untuk HMIF UNJA × FST Market Day 2026. Logo HMIF milik Himpunan Mahasiswa Informatika Universitas Jambi (diambil dari hmifunja.my.id). Font Pixelify Sans, Press Start 2P, Plus Jakarta Sans (SIL OFL 1.1); ikon pixelarticons (MIT).

**© Muhammad Aziz Syah Dani 2026**
