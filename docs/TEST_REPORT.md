# Laporan Pengujian TasteQuest v3

## Pembaruan 3.0.1 (15 November 2026)

**Laporan lapangan dari pengguna:** OLED, touch, dan HC-SR04 bekerja di mode latihan, tetapi data alat tidak masuk server. Serial Monitor menampilkan `[net] /api/device/telemetry -> HTTP 422 … sessionEventId: expected string, received undefined`, dan rating setelah game tertulis "Ditolak server".

**Akar masalah (dibuktikan, bukan ditebak):** helper firmware menerima `d["key"]` sebagai parameter `JsonVariant`. Di ArduinoJson 7, mengonversi proxy key yang belum ada ke `JsonVariant` menghasilkan variant tak terikat sehingga `set()` diam-diam tidak menulis apa pun. Direproduksi di laptop dengan ArduinoJson 7.4.3 yang sama (output hanya `{"v":1}`). Akibatnya `sessionEventId`, `ratingEventId`, `distanceCm` (telemetry), `measuredCm` (event game), dan `sessionEventId` (event rating) hilang dari JSON, sehingga semuanya ditolak 422. Heartbeat tidak memakai helper itu, jadi perangkat tetap terlihat online.

**Perbaikan:** pembentuk payload dipindah ke `firmware/include/payload.h` dan menulis langsung lewat proxy. Test baru `server/test/firmware-contract.test.ts` mengompilasi kode payload firmware yang asli dengan g++ dan memvalidasi setiap payload dengan skema Zod server. Red-green: versi lama gagal dengan pesan yang sama persis seperti di Serial Monitor Anda (8 test gagal); versi baru 11/11 lulus. Server kini juga mencatat payload yang ditolak di log Device Monitor.

**Tambahan 3.0.1:** layar OLED baru (`firmware/include/screens.h`) dengan animasi IDLE (judul TASTEQUEST bergelombang di atas bintang bergerak, kredit "Made by Muhammad Aziz Syah Dani from Informatika Universitas Jambi", logo HMIF yang muncul piksel demi piksel). Kiosk juga bergantian menampilkan ajakan main, kredit, dan logo HMIF. Teks dashboard ditulis ulang tanpa tanda pisah. Tampilan OLED bisa dipratinjau tanpa board: `npm run oled:preview`.

| Pemeriksaan 3.0.1 | Hasil |
|---|---|
| `npm run check` | ✅ exit 0: 3 file, **65/65** test (33 unit, 21 integrasi server, 11 kontrak firmware); firmware host 54/54; build OK |
| Firmware `nodemcuv2` (clean build) | ✅ SUCCESS · RAM 46,3 % (37.920 B) · Flash 34,6 % (361.887 B) · 0 warning dari kode proyek |
| `npm run e2e` online & tanpa internet | ✅ 1/1 lulus di keduanya |
| `npm run oled:preview` | ✅ 28 layar dirender dan diperiksa visual (128×64 dan 128×32) |
| Uji di alat fisik setelah upload 3.0.1 | ⬜ belum (perlu Anda upload & uji: telemetry tanpa 422, rating "Diterima server") |

---


Tanggal: 15 November 2026 · Mesin: Linux (Debian), Node.js 24.22.1, npm 11.19.1, PlatformIO espressif8266 4.2.1 (Arduino core 3.1.2), g++ 14.2, Chromium (Playwright 1.65.1).

Semua hasil di bawah berasal dari perintah yang benar-benar dijalankan. **Hardware fisik belum diuji** (lihat §5).

## 1. Ringkasan

| Area | Perintah | Hasil |
|---|---|---|
| Instal dependency | `npm install` | ✅ sukses, versi dipin persis |
| Typecheck (server+shared, web, e2e) | `npm run typecheck` | ✅ exit 0 |
| Lint | `npm run lint` | ✅ exit 0, 0 error, 0 warning |
| Unit + integration | `npm test` | ✅ 2 file, **53/53** test lulus |
| Logika firmware di host | `npm run test:fw` | ✅ **54/54** cek lulus |
| Build produksi web | `npm run build` | ✅ exit 0 (JS 216 KB gzip, CSS 19 KB gzip) |
| Semua di atas sekaligus | `npm run check` | ✅ exit 0 |
| Firmware `nodemcuv2` (clean build) | `pio run -d firmware -t clean && pio run -d firmware` | ✅ SUCCESS · RAM 43,8 % (35.920/81.920 B) · Flash 32,7 % (341.703 B) · `firmware.bin` 345.856 B · 0 warning dari kode proyek (`-Wall -Wextra`) |
| Browser smoke test | `npm run e2e` | ✅ 1/1 skenario lulus (±60 dtk) |
| Kesiapan offline | `unshare -rn sh -c 'ip link set lo up && npx playwright test'` | ✅ lulus tanpa internet, **0 request** ke luar 127.0.0.1 |
| Startup produksi | `npm start` dengan `.env` hasil `npm run setup` | ✅ health 200, dashboard & logo 200, header CSP/nosniff/DENY aktif |
| Hardware fisik | checklist `docs/WIRING.md` §7 | ⬜ **belum dijalankan** (board belum diuji) |

## 2. Unit test (Vitest + g++)

`shared/test/game.test.ts` (33 test):
- **Scoring**: 16 kasus dari `shared/test/scoring_cases.txt` (sempurna 100, deviasi 0,3 cm → 97, 1,5 cm → 85, tepat 10 cm → 0, clamp 15 cm → 0, timeout → 0) + NaN → 0.
- **Target**: 200 iterasi, 3 target bulat berbeda dalam rentang sempit 10–14.
- **Touch**: tap → 1 SHORT; tahan → 1 LONG di 1.200 ms tanpa SHORT; lepas di 1.199 ms → SHORT; glitch < 30 ms diabaikan; pantulan saat lepas → 1 SHORT; replay edge ISR pendek/panjang.
- **FSM**: alur 3 ronde penuh → hasil → rating tertaut sesi; event game lolos skema backend; sensor invalid saat lock (tetap di ronde, notice, tanpa jarak palsu); input terlambat & saat countdown diabaikan; latihan tanpa event; rating langsung dari menu; bintang 1→5→1; skip & timeout tanpa data; menu timeout.
- **Settings**: rentang target terlalu sempit ditolak.

`firmware/test/test_logic.cpp` (54 cek, g++ `-Wall -Wextra -Werror`): kasus skor dari **file yang sama** dengan TS, kuantisasi 0,1 cm, touch (termasuk batas 1.199 ms & replay ISR), median filter (outlier, timeout tunggal, data usang, semua timeout, jumlah genap/ganjil), FSM (alur penuh, sensor invalid, latihan, rating langsung, timeout).

**Red-green**: test batas 1.199 ms dijalankan terhadap versi classifier lama → **gagal** (`1 failed | 32 passed`); versi perbaikan → 33/33 lulus.

## 3. Integration test server (`server/test/api.test.ts`, 20 test)

Server Express nyata + SQLite file sementara + Socket.IO client:
- Auth: tanpa token / token salah → 401; login salah 401; cookie `HttpOnly; SameSite=Strict`; mutasi admin tanpa login → 401.
- Simpan game (skor 187, durasi termasuk ronde timeout); **retry eventId sama → 200 "duplicate", tetap 1 record**.
- Skor yang tidak sesuai rumus → 422; rating 1–5 → 201, 0 dan 6 → 422; skema `v: 2` → 422; JSON rusak → 400.
- Demo/live: token live + mode demo → 403; token live + ID `SIM-*` → 403; simulator tanpa login 401, dengan ID live 403, mode live 403; **Mode LIVE menolak simulator (409)**; analytics & leaderboard terpisah per mode; reset demo butuh `RESET` dan **tidak menyentuh data live**.
- Ranking: skor sama diurutkan durasi tercepat → selesai lebih awal (ageMs) → id.
- Statistik review: rata-rata 3,0, distribusi 1–5, bucket tren WIB, riwayat.
- Nickname + ekspor CSV: BOM UTF-8, header benar, nickname `=HYPERLINK(...)` di-escape (anti formula injection).
- Pengaturan: validasi 422; config baru dikirim di respons heartbeat.
- Real-time: event `game`, telemetry `device`, dan transisi **offline** (tanpa data > ambang) diterima Socket.IO; log perangkat mencatat offline.
- **Restart**: server & SQLite ditutup lalu dibuka ulang → jumlah sesi/rating, pengaturan, dan "terakhir terlihat" perangkat bertahan; sesi login perlu diulang (disengaja).
- Rate limit login: percobaan ke-11/menit → 429.

## 4. Browser smoke test (`e2e/smoke.spec.ts`, build produksi, DB terpisah)

Satu skenario berurutan, Chromium 1440×900 kecuali disebut:
1. Empty state Overview; Arena meminta login; password salah ditolak; login operator.
2. **Tiga ronde penuh** lewat simulator: ronde 1 tepat target (+100), ronde 2 meleset 0,5 cm (+95), ronde 3 habis waktu (0) → OLED "195 / 300", panggung "SKOR TERTINGGI BARU!". Mode kompetisi menampilkan "Jarak dirahasiakan".
3. **Skip** rating setelah game (tanpa data); **rating langsung** dari menu: tahan tanpa bintang ditolak, 4 bintang → "Terkirim ke server" & kiosk/panggung "Rating diterima server".
4. **Putus Wi-Fi (simulasi)**: rating 5 → OLED "Tersimpan, antre", antrean "menunggu"; sambung lagi → "diterima server".
5. Leaderboard (1 baris, 195, ronde "habis"), Reviews (2 rating, rata-rata 4,5), Overview (Sesi game 1), Device Monitor (SIM-01 ONLINE, 1 state aktif).
6. Pengaturan disimpan; ekspor CSV berisi skor 195; **Mode LIVE**: Arena "Mode LIVE", panggung "PERANGKAT OFFLINE", leaderboard live kosong (terpisah); kembali ke DEMO.
7. **Kiosk 1920×1080**: kredit "© Muhammad Aziz Syah Dani 2026", "HMIF UNJA × FST Market Day 2026", Top 3, logo HMIF termuat (naturalWidth > 0), tanpa scroll horizontal.
8. **Mobile 390×844**: 6 halaman tanpa scroll horizontal.
9. **Loading state** (respons ditunda 1,5 dtk) dan **error state** (request diblokir → "Server tidak dapat dihubungi").
10. Reset data demo: tombol nonaktif sebelum `RESET`; hasil "1 sesi, 2 rating".
11. Tidak ada error console; tidak ada request ke luar 127.0.0.1.

Screenshot: `test-results/screens/01…11*.png` (dibuat ulang setiap `npm run e2e`).

## 5. Bug yang ditemukan pengujian & sudah diperbaiki

| Ditemukan oleh | Masalah | Perbaikan |
|---|---|---|
| Penulisan test kasus batas | Timer long-press tetap berjalan selama debounce pelepasan → tahan 1.199 ms terbaca LONG | Evaluasi LONG terhadap kandidat lama sebelum diganti, hanya selama sinyal mentah ditekan (TS & C++) |
| Smoke test (console error) | Vite meng-inline font kecil sebagai `data:` → diblokir CSP `font-src 'self'` | `assetsInlineLimit` tidak meng-inline font; CSP tetap ketat |
| Tinjauan screenshot | Pixelify Sans: "5"≈"S", "2"≈"Z", "©" kecil seperti "°" | Angka → Press Start 2P; kredit → font body tebal |
| Test host firmware | Median jumlah genap mengambil nilai atas (bias ke atas) | Rata-rata dua nilai tengah |
| Review kontrak JSON | `WiFi.RSSI()` = 31 saat tidak valid → heartbeat ditolak 422 tanpa jejak | Kirim `null`; Serial mencetak setiap HTTP ≥ 400 |
| Review perilaku | Log "Error sensor: TIMEOUT" membanjir saat orang lalu-lalang | Log per jenis maks. 1×/menit; UI menjelaskan arti tiap error |
| Review perilaku | Simulator terus mengirim (401/409) setelah logout/Mode LIVE | Simulator berhenti sendiri, antrean tetap |
| `npm run check` | Vitest ikut menjalankan file Playwright → exit 1 | `vitest.config.ts` membatasi ke `shared/test` & `server/test` |
| Uji startup | HEAD `/` → 404 | Fallback SPA menerima GET & HEAD |
| Audit kontras | Label OLED "(mati)" ±2,3:1 | `ink-400` |

## 6. Keterbatasan & langkah manual tersisa

- **Hardware belum divalidasi**: tegangan rail, pembagi ECHO, OLED, touch, buzzer, kalibrasi HC-SR04, konektivitas, restart & putus Wi-Fi. Jalankan `docs/WIRING.md` §4 lalu §7. Upload firmware hanya setelah pemeriksaan fisik dan persetujuan.
- Payload JSON yang dibuat firmware sudah dicocokkan field-per-field dengan skema, tetapi baru terbukti end-to-end saat uji hardware (pantau Serial: tidak boleh ada `HTTP 4xx`).
- Browser hanya Chromium; Firefox/Safari belum diuji. Kiosk diuji pada viewport 1920×1080 headless, belum pada monitor fisik dari jarak baca.
- Belum ada soak test berjam-jam (server & heap ESP8266).
- Isi `WIFI_SSID`/`WIFI_PASSWORD` di `firmware/include/secrets.h` dan sesuaikan `BACKEND_URL` dengan IP laptop di lokasi.
