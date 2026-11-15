# Brand & Design System — TasteQuest v3

**HMIF UNJA × FST Market Day 2026 · PLAY. EXPLORE. RATE. · © Muhammad Aziz Syah Dani 2026**

Tema: *Modern Pixel Art × Premium Retro Arcade × HMIF UNJA*.

## 1. Sumber yang diperiksa (15 November 2026)

| Sumber | Hasil |
|---|---|
| `https://hmifunja.my.id` | Redirect 308 ke `https://www.hmifunja.my.id/` |
| `https://www.hmifunja.my.id/` (HTML) | `<meta name="theme-color" content="#140D08">`, JSON-LD `"logo": "https://www.hmifunja.my.id/logo-hmif.png"`, Google Fonts: Space Grotesk, Plus Jakarta Sans, JetBrains Mono |
| `/assets/index-DTD7Qmg6.css` (stylesheet produksi) | Palet Tailwind kustom `ink`, `gold`, `teal`, `paper` — nilai di bawah dihitung langsung dari aturan CSS seperti `.bg-ink-950{background-color:rgb(20 13 8/…)}` |
| `/logo-hmif.png` | PNG 576×369 RGBA, garis krem di latar transparan (dirancang untuk latar gelap). SHA-256 `f33c4075…c02c` |
| `/favicon.png` | PNG 1037×994 RGBA. SHA-256 `3f904b85…af12` |

Metode: unduh HTML + CSS dengan `curl`, ekstrak kelas warna dengan regex, konversi `rgb()` → HEX. Tidak ada warna yang ditebak.

## 2. Token warna

### Terverifikasi dari CSS HMIF

| Token | HEX | Bukti | Peran di TasteQuest |
|---|---|---|---|
| `ink-950` | `#140D08` | `.bg-ink-950`, `theme-color` | latar halaman |
| `ink-900` | `#22150D` | `.bg-ink-900` | isi panel |
| `ink-800` | `#342116` | `.text-ink-800` | garis pemisah, tombol ghost |
| `ink-700` | `#4A2F20` | `.text-ink-700` | bingkai panel |
| `ink-600` | `#64402B` | `.text-ink-600` | bingkai input |
| `ink-500` | `#8B5E3C` | `.text-ink-500` | dekoratif saja |
| `ink-300` | `#C69A74` | `.text-ink-300` | teks muted |
| `ink-200` | `#E2C6A8` | `.text-ink-200` | teks sekunder |
| `ink-100` / `ink-50` | `#F3E7D7` / `#FAF7F2` | `.bg-ink-100` / `.bg-ink-50` | teks utama |
| `gold-400` | `#DCC4A8` | `.text-gold-400` | judul panel |
| `gold-500` | `#D4A657` | `.bg-gold-500` | aksen, tombol utama, skor |
| `gold-600` / `gold-700` | `#B4863C` / `#8C6830` | `.text-gold-600/700` | cadangan |

### Adaptasi TasteQuest (bukan warna resmi HMIF)

| Token | HEX | Alasan |
|---|---|---|
| `ok` | `#2FBFA3` | muncul sekali sebagai hex lepas di CSS HMIF; perannya di sana tidak terverifikasi. Dipakai untuk online/sukses/LIVE |
| `warn` | `#E8913A` | peringatan, badge DEMO |
| `bad` | `#E5654F` | offline/error |

Warna status selalu disertai teks atau ikon, tidak pernah warna saja. Kelas `teal-*` HMIF ternyata berisi cokelat-krem, jadi tidak dipakai.

Token didefinisikan di `web/src/index.css` (`@theme`). Untuk mengganti, ubah nilai di sana — komponen hanya memakai nama token.

## 3. Tipografi

| Peran | Font | Alasan |
|---|---|---|
| Body, tabel, form | **Plus Jakarta Sans Variable** | font body resmi HMIF (`body{font-family:Plus Jakarta Sans}`), sangat terbaca |
| Judul, label, wordmark, menu | **Pixelify Sans** 400/600/700 | identitas pixel art (saran prompt) |
| **Angka**: skor, target, hitung mundur, jam, statistik | **Press Start 2P** | lihat temuan di bawah |

**Temuan pengujian visual:** pada Pixelify Sans, glyph `5` identik dengan `S`, `2` mirip `Z`, `8` mirip `B`, dan `©` hanya superskrip kecil. Skor "195" terbaca "19S" dan kredit "©" terlihat seperti "°". Karena skor dibaca dari kejauhan, semua angka dipindah ke Press Start 2P (digit tegas, © ukuran penuh) dan baris kredit memakai font body tebal. Sampel pembanding dirender dengan Chromium sebelum keputusan diambil.

Spasi kata Plus Jakarta Sans sempit; `word-spacing: 0.08em` ditambahkan di body agar label pendek ("Sesi game") tidak terbaca menyatu.

Semua font di-host lokal lewat paket `@fontsource` (OFL-1.1). Tidak ada request ke Google Fonts saat runtime.

## 4. Bentuk, ikon, motion

- **Pixel-cut frame**: SVG 9×9 sebagai `border-image` (sudut bertingkat dua langkah) — `.px-frame`, `.px-frame-gold`, `.px-frame-inset`, `.px-btn`, `.px-btn-ghost`, `.px-btn-danger`. Bayangan keras `drop-shadow(4px 4px 0)` mengikuti bentuk takik.
- **Ikon**: pixelarticons (MIT), dipasang sebagai CSS mask agar mengikuti warna teks. Tidak ada emoji sebagai ikon.
- **Bintang rating**: bitmap pixel 11×10 orisinal (`web/src/components/ui.tsx`), siluet sama untuk terisi/kosong.
- **Motion**: pop pada angka hitung mundur & skor, count-up skor, konfeti saat skor tertinggi baru, kedip lambat (steps) untuk ajakan. Semua dimatikan oleh `prefers-reduced-motion`.
- Latar: pola titik 16 px tipis dari `ink-800`, bukan gradien neon.

## 5. Logo & kredit

- Logo resmi HMIF disimpan di `web/public/brand/logo-hmif.png` (tidak dimodifikasi), ditampilkan proporsional (`w-auto`, tinggi 44–64 px) di footer dashboard, kiosk, dan About.
- Bila file hilang, komponen `HmifLogo` menampilkan placeholder berlabel "LOGO HMIF (letakkan di /brand/logo-hmif.png)". Untuk mengganti logo: timpa file tersebut lalu `npm run build`.
- Kredit **© Muhammad Aziz Syah Dani 2026** dan identitas **HMIF UNJA × FST Market Day 2026** tampil di footer setiap halaman dashboard, kiosk, panel About, README, dan log startup server.
- Wordmark TasteQuest (ikon target + teks Pixelify Sans) adalah karya orisinal proyek ini, bukan rekonstruksi logo HMIF.

## 6. Layar OLED & kiosk saat IDLE

- OLED (`firmware/include/screens.h`) berganti layar tiap 5 detik, satu putaran 20 detik: judul TASTE/QUEST (font U8g2 *maniac*) masuk dari kiri-kanan lalu bergelombang di atas bintang 3 lapis dengan kilau miring dan ajakan "SENTUH PAD" berkedip; "MADE BY Muhammad Aziz Syah Dani"; "FROM Informatika Universitas Jambi" (keduanya bergulir masuk dan keluar seperti credits game); logo HMIF yang muncul dan hilang piksel demi piksel. Layar tetap berputar saat pengunjung mendekat (HC-SR04 < 60 cm) supaya mereka melihat kredit dan logo; di layar judul ajakannya berubah menjadi "AYO MAIN!".
- Logo OLED adalah logo resmi `logo-hmif.png` yang dikecilkan ke 100×64 (ambang 50), dibuat ulang dengan `node scripts/logo-xbm.mjs`.
- Layar permainan memakai header ala HUD game (bar terang, font Press Start 2P, ikon jaringan di kanan).
- Kiosk bergantian 7 detik: ajakan main, kredit pembuat, logo HMIF besar.

## 7. Visualisasi data

- Tren rating dipecah menjadi **dua chart kecil** (jumlah per jam & rata-rata per jam) dengan sumbu X yang sama — bukan satu chart dua sumbu Y (anti-pattern dual-axis).
- Satu seri per chart → satu warna (`gold-500`), tanpa kotak legenda; judul chart menamai seri. Kontras mark vs panel 7,95:1 (validator dataviz: PASS ≥ 3:1).
- Distribusi bintang: bar horizontal berlabel angka & persen (5 kategori, tidak perlu chart library).
- Tooltip hover pada setiap chart + tabel data di `<details>` sebagai fallback aksesibilitas.
- Sudut bar dibuat siku (bukan membulat 4 px seperti saran umum) agar konsisten dengan estetika pixel.

## 8. Audit desain (hasil terukur)

Kontras WCAG 2.x dihitung dari token (bukan ditaksir):

| Pasangan | Rasio | Level |
|---|---|---|
| ink-50 / ink-900 (teks utama) | 16,64:1 | AAA |
| ink-200 / ink-900 (sekunder) | 10,90:1 | AAA |
| ink-300 / ink-900 (muted) | 7,01:1 | AAA |
| gold-500 / ink-900 (skor) | 7,95:1 | AAA |
| ink-950 / gold-500 (tombol) | 8,61:1 | AAA |
| ok / ink-900 | 7,71:1 | AAA |
| warn / ink-900 | 7,23:1 | AAA |
| bad / ink-900 | 5,34:1 | AA |
| ink-950 / bad (banner, tombol hapus) | 5,78:1 | AA |
| ink-500 / ink-900 | 3,19:1 | hanya dekoratif/teks besar |

Checklist pra-rilis (UI/UX Pro Max):

- [x] Tanpa emoji sebagai ikon; ikon dekoratif `aria-hidden`
- [x] Fokus keyboard terlihat (`outline` 3 px gold-400), tombol "Lewati ke konten", fokus pindah ke `<main>` saat ganti halaman
- [x] Target sentuh ≥ 44 px (tombol, nav, toggle)
- [x] Label form terlihat, error di dekat field (`role="alert"`)
- [x] `prefers-reduced-motion` dihormati; maksimal 1–2 elemen bergerak per layar
- [x] Responsif 390 px → 1920 px tanpa scroll horizontal (diuji otomatis di 6 halaman)
- [x] Loading, error ("Server tidak dapat dihubungi"), empty state, offline perangkat, dan koneksi real-time putus punya tampilan sendiri
- [x] Kiosk 1920×1080: angka skor ±200 px, teks minimal ±28 px; skala `vh` agar tetap muat di 1366×768
- [x] Timestamp WIB (`Asia/Jakarta`) dengan format Indonesia
- [x] Aset, font, ikon, JS lokal; CSP server `font-src 'self'` (diverifikasi tanpa pelanggaran di browser)

Screenshot hasil uji ada di `test-results/screens/` setelah `npm run e2e`.
