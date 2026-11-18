# Analisis Kritis: Kebutuhan, Pengukuran, Data & Risiko

Disusun dengan pendekatan *scientific critical thinking*: memisahkan apa yang **terukur/terverifikasi** dari **asumsi**, menilai validitas pengukuran, bias dalam data, dan keterbatasan pengujian. Angka di bawah dihitung (bukan ditaksir); sumber: datasheet HC-SR04 (Elecfreaks: jangkauan 2–400 cm, resolusi ±0,3 cm, sudut ±15°, siklus ≥ 60 ms), source core ESP8266 Arduino 3.1.2, dan pengujian proyek ini.

## 1. Ringkasan

TasteQuest mengukur dua hal berbeda: **ketepatan motorik** pengunjung (ProxiRush, lewat sensor ultrasonik) dan **penilaian subjektif** atas karya (rating 1–5). Keduanya rawan salah tafsir: yang pertama oleh galat sensor, yang kedua oleh bias pemilihan diri. Sistem dirancang agar (a) tidak pernah mengarang data, (b) galat sistematis berlaku sama untuk semua pemain, dan (c) dashboard tidak mengklaim lebih dari yang didukung data.

## 2. Kekuatan desain

- **Tidak ada jarak palsu.** Bila median sensor tidak valid (< 3 sampel valid dalam 400 ms), lock ditolak dengan pesan "Sensor tak terbaca". Saat waktu habis jawaban terkunci otomatis dengan median 5 bacaan valid terakhir; ronde bernilai 0 bila sepanjang ronde tidak ada bacaan valid. Diuji di TS dan C++.
- **Skor identik lintas bahasa.** Jarak dikuantisasi 0,1 cm; pada resolusi itu rumus spesifikasi `clamp(round(100 − |m−t|·10), 0, 100)` = `clamp(100 − |m₁₀ − 10t|, 0, 100)` tanpa ambiguitas pembulatan. File kasus yang sama (`shared/test/scoring_cases.txt`) diuji oleh Vitest dan g++. Server menghitung ulang dan menolak skor yang tidak sesuai rumus.
- **Idempotensi.** Setiap event membawa ID unik `DEVICE-nonceBoot-seq`; retry tidak menambah record (diuji). Nonce boot dari RNG hardware mencegah tabrakan ID setelah restart.
- **Pemisahan demo/live** pada level autentikasi (token perangkat vs sesi operator) dan identitas (`SIM-*`), bukan hanya label — diuji (403/409).

## 3. Validitas pengukuran ProxiRush

### 3.1 Galat suhu (sistematis)
c ≈ 331,3 + 0,606·T m/s. Firmware memakai 30 °C (0,034948 cm/µs).

| Suhu ruang | Faktor bacaan | Galat @10 cm | Galat @30 cm | Dampak skor @30 cm |
|---|---|---|---|---|
| 25 °C | 1,00875 | +0,09 cm | +0,26 cm | −2,6 poin |
| 30 °C | 1,00000 | 0 | 0 | 0 |
| 35 °C | 0,99140 | −0,09 cm | −0,26 cm | −2,6 poin |

Galat ini **sistematis** dan proporsional terhadap jarak, sehingga kalibrasi dua titik dengan penggaris di lokasi (`docs/WIRING.md` §5) menghapusnya. Tanpa DHT11, suhu tidak dikompensasi otomatis — itu keputusan spesifikasi, dan dampaknya ≤ 3 poin per ronde.

### 3.2 Galat acak
Resolusi datasheet ±0,3 cm ≈ ±3 poin. Telapak tangan adalah pemantul tidak rata dan bergerak; sebaran nyata kemungkinan lebih besar — **belum diukur** (perlu uji hardware). Median 5 sampel (interval 60 ms, ±7 ping per jendela 400 ms) menolak outlier tunggal; lag median ±2 sampel (≈ 120 ms) tidak relevan saat tangan ditahan diam.

**Implikasi tafsir:** selisih skor antar pemain di bawah ±5 poin kemungkinan berada dalam derau pengukuran. Peringkat di papan adalah peringkat hasil satu kali percobaan, bukan ukuran kemampuan yang presisi. Tie-break waktu (lock lebih cepat) memberi urutan deterministik, tidak mengklaim presisi lebih.

### 3.3 Keadilan antar pemain
- Galat **sistematis** berlaku sama untuk semua pemain dengan target yang sama → urutan relatif terjaga.
- Target diacak per pemain (5 target berbeda dari rentang). Hipotesis "target jauh lebih sulit" (sudut pancar 15° → titik pantul ±8 cm di 30 cm) **belum didukung data**. Data per ronde (target, terukur, lock_ms) disimpan dan diekspor CSV, sehingga hipotesis ini bisa diuji setelah acara (mis. korelasi |galat| vs target). Bila terbukti, opsi perbaikan: target berstrata (satu dekat, satu sedang, satu jauh).
- Hasil latihan tidak masuk leaderboard; jarak tidak ditampilkan di OLED/kiosk sebelum lock pada mode kompetisi (validitas tantangan).

### 3.4 Validitas input sentuh
- SHORT dikirim saat dilepas (< 1,2 dtk), LONG sekali saat ambang tercapai lalu dikunci sampai dilepas: satu sentuhan tidak pernah menghasilkan dua aksi (diuji, termasuk batas 1.199 ms dan pantulan saat lepas).
- Edge ditangkap ISR beserta timestamp sehingga tap tidak hilang walau loop sempat terblokir request HTTP (≤ 800 ms). Bug batas long-press ditemukan dan diperbaiki saat menulis test kasus batas.
- Lock terjadi saat jari dilepas (±100–200 ms setelah ditekan). Tangan pengatur jarak adalah tangan lain, jadi gerakan melepas tidak mengubah jarak.

## 4. Validitas data rating

| Ancaman | Dampak | Mitigasi di sistem | Sisa risiko |
|---|---|---|---|
| **Bias pemilihan diri** — hanya sebagian pengunjung menilai | rata-rata tidak mewakili semua pengunjung | n selalu ditampilkan; distribusi ditampilkan, bukan hanya rata-rata | tetap ada; jangan generalisasi ke "semua pengunjung" |
| **Bias jangkar/default** | pilihan awal mendorong jawaban | rating mulai dari 0 bintang; LONG tanpa pilihan ditolak | — |
| **Asimetri usaha** — 5 bintang butuh 5 sentuhan, 1 bintang 1 sentuhan | pengunjung tergesa mungkin berhenti lebih awal | — (siklus 1→5 sesuai spesifikasi) | arah bias tidak diketahui; catat sebagai keterbatasan |
| **Desirabilitas sosial** — operator mengawasi | rating cenderung tinggi | — | sebutkan saat presentasi data |
| **Konfound skor → rating** | pemenang mungkin menilai lebih tinggi | rating menyimpan `session_event_id` | dapat dianalisis dari CSV |
| **Data ordinal** | rata-rata Likert hanya pendekatan | distribusi 1–5 & tren ditampilkan | — |
| **Ukuran sampel kecil** | rata-rata awal sangat fluktuatif | jumlah rating tampil di samping rata-rata | — |

**Jumlah sesi ≠ jumlah pengunjung unik** (satu orang bisa bermain berkali-kali; tidak ada identitas). **Jumlah rating ≠ jumlah pengunjung.** Deteksi kedekatan HC-SR04 hanya membangunkan OLED, tidak dihitung sebagai pengunjung. Label dashboard menyatakan ini secara eksplisit.

Waktu event: ESP8266 tidak punya RTC/NTP (offline). Server menghitung `waktu = diterima − ageMs`; galat ≈ latensi jaringan (< 1 dtk). Event yang hilang karena listrik mati tidak tercatat sama sekali (bukan tercatat salah).

## 5. Register risiko teknis

| Risiko | Kemungkinan | Dampak | Mitigasi |
|---|---|---|---|
| ECHO 5 V langsung ke GPIO | sedang (salah rakit) | rusak permanen | pembagi 2,2k/3,3k (3,0 V), pemeriksaan multimeter sebelum daya |
| Buzzer menarik arus > 12 mA dari D0 | sedang | GPIO tertekan/rusak | identifikasi tipe, driver NPN + dioda |
| OLED diberi 5 V → pull-up I2C 5 V | rendah-sedang | GPIO rusak | OLED di 3V3 |
| TTP223 mode toggle | sedang | tap/tahan tak terbedakan | pad B terbuka, deteksi "touch tertahan" di dashboard |
| Hotspot 5 GHz / client isolation / IP berubah | tinggi di lokasi acara | perangkat offline | panduan `docs/SETUP.md`, uji `/api/health` dari HP, reservation IP |
| Server mati saat ronde | rendah | input macet hingga timeout | tidak ada request saat countdown/ronde bila server tak terjangkau; backoff 1–30 dtk |
| Listrik mati dengan antrean berisi | rendah | event hilang | antrean RAM dijelaskan; status OLED "antre" vs "diterima" |
| Antrean penuh (> 12) | sangat rendah | event tertua hilang | dihitung `dropped`, tampil di Device Monitor |
| Heap fragmentation saat berjam-jam | tidak diketahui | reboot | **perlu soak test 1–2 jam dengan hardware**; heap dilaporkan tiap heartbeat |

## 6. Keterbatasan pengujian

- Hardware fisik **belum diuji**: wiring, tegangan, OLED, buzzer, kalibrasi, sebaran derau tangan, konektivitas, restart. Checklist ada di `docs/WIRING.md` §7.
- Kontrak JSON firmware ↔ server diverifikasi lewat review field-per-field dan integration test server dengan payload berbentuk sama; payload yang benar-benar dibuat firmware baru terbukti saat uji hardware (Serial mencetak setiap HTTP ≥ 400 beserta pesan validasi).
- Browser test hanya Chromium (desktop 1440 px, kiosk 1920×1080, mobile 390 px). Belum diuji Firefox/Safari.
- Tidak ada uji beban/ketahanan (soak test) server atau firmware.

## 7. Rekomendasi

1. Lakukan checklist hardware + kalibrasi dua titik di lokasi pameran (suhu ruang nyata).
2. Soak test 1–2 jam (game berulang + putus Wi-Fi) sambil memantau heap & `dropped` di Device Monitor.
3. Setelah acara, ekspor CSV dan uji: (a) korelasi |galat| vs target, (b) rating vs skor sesi tertaut, (c) distribusi rating per jam.
4. Saat melaporkan hasil, sebutkan n, bahwa rating sukarela, dan bahwa sesi ≠ pengunjung unik.
