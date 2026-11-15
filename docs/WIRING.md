# Wiring, Keselamatan & Kalibrasi — TasteQuest v3

> **Status: BELUM diuji pada hardware fisik.** Dokumen ini adalah rancangan + prosedur. Firmware sudah terkompilasi untuk `nodemcuv2`, tetapi wiring, tegangan, dan perilaku sensor baru boleh disebut lolos setelah checklist §7 diisi dari pengujian nyata. **Jangan menyalakan atau meng-upload sebelum §4 dikerjakan dan disetujui.**

## 1. Pin mapping final

Sumber kebenaran: `firmware/include/config.h`.

| Komponen | Signal | Pin NodeMCU | GPIO | Catatan |
|---|---|---|---|---|
| OLED I2C | SCL | D1 | 5 | `Wire.begin(OLED_SDA, OLED_SCL)` |
| OLED I2C | SDA | D2 | 4 | |
| HC-SR04 | TRIG | D6 | 12 | output 3,3 V dari ESP |
| HC-SR04 | ECHO | D5 | 14 | **lewat pembagi tegangan** |
| TTP223 | OUT | D7 | 13 | interrupt CHANGE |
| Buzzer | Control | D0 | 16 | sinyal kontrol, bukan sumber daya |

D3, D4, D8 tidak dipakai (pin strapping saat boot). DHT11 dihapus sepenuhnya.

## 2. Diagram

```
                     NodeMCU ESP8266 (nodemcuv2)
                 ┌──────────────────────────────┐
   HC-SR04 VCC ──┤ VIN/VU (5 V dari USB)        │
                 │                          3V3 ├── OLED VCC, TTP223 VCC
   semua GND ────┤ GND                      GND ├── (GND bersama)
                 │                              │
   OLED SCL ─────┤ D1 (GPIO5)                   │
   OLED SDA ─────┤ D2 (GPIO4)                   │
   TRIG ─────────┤ D6 (GPIO12)                  │
   ECHO ─[2,2k]──┤ D5 (GPIO14)                  │
           └─[3,3k]─ GND                         │
   TTP223 OUT ───┤ D7 (GPIO13)                  │
   Buzzer ctrl ──┤ D0 (GPIO16) ──(lihat §3.3)   │
                 └──────────────────────────────┘
```

Kabel: male-to-male untuk modul yang tertancap di breadboard; dua jumper male-to-female untuk kedua kaki buzzer.

## 3. Keselamatan listrik (wajib)

### 3.1 Rail daya
- HC-SR04 standar butuh **5 V** → pin `VIN` (Amica) atau `VU` (LoLin V3), yang tersambung ke 5 V USB (±4,7–5,1 V).
- OLED dan TTP223 → **3,3 V** (`3V3`). Penting untuk OLED: resistor pull-up I2C di modul terhubung ke VCC-nya; bila OLED diberi 5 V, SDA/SCL ikut ditarik ke 5 V dan bisa merusak GPIO ESP8266.
- **Semua GND disatukan. Jangan pernah menyambung rail 5 V dengan rail 3,3 V.**
- Daya hanya dari USB laptop/adaptor 5 V selama pengujian awal.

### 3.2 ECHO 5 V → D5 (3,3 V)
GPIO ESP8266 maksimal 3,6 V. Pembagi tegangan:

```
ECHO ──[ R1 = 2,2 kΩ ]──┬── D5
                        └──[ R2 = 3,3 kΩ ]── GND
V(D5) = 5 V × 3,3 / (2,2 + 3,3) = 3,0 V
```

3,0 V > ambang HIGH ESP8266 (0,75 × 3,3 V ≈ 2,48 V) dan < 3,6 V. Arus pembagi ≈ 0,9 mA. Alternatif: level shifter dua arah.
TRIG cukup 3,3 V langsung dari D6 (ambang input HC-SR04 bertipe TTL); varian HC-SR04P bekerja di 3–5 V.

### 3.3 Buzzer di D0
Arus GPIO ESP8266 sebaiknya ≤ 12 mA. Identifikasi buzzer dua kaki dulu:

| Jenis | Ciri | Setting `config.h` |
|---|---|---|
| Aktif | bunyi bila diberi DC; bagian bawah tertutup/berstiker; kaki panjang = + | `BUZZER_PASSIVE 0` |
| Pasif | butuh sinyal frekuensi; PCB terlihat di bawah | `BUZZER_PASSIVE 1` (pakai `tone()`) |

- **Piezo kecil** (beberapa mA): boleh langsung D0 → (+) buzzer, (−) → GND, jika rating arusnya ≤ 12 mA.
- **Buzzer magnetik / arus tidak diketahui**: pakai driver transistor:

```
D0 ──[1 kΩ]── basis NPN (S8050/2N2222)
              emitor → GND
              kolektor → (−) buzzer
(+) buzzer → 3V3 atau 5 V sesuai rating
Dioda 1N4148 paralel buzzer (katoda ke +) untuk buzzer magnetik
```
  Dengan driver NPN low-side: `BUZZER_ACTIVE_HIGH 1`.
- GPIO16 berlogika HIGH sesaat saat boot → bunyi singkat ketika dinyalakan adalah normal.

### 3.4 TTP223
- Mode **momentary** wajib: pad **B (TOG) terbuka**. Bila pad B disolder, modul berubah ke mode toggle dan tekan lama tidak bisa dibedakan.
- Pad **A (AHLB)** terbuka = output aktif HIGH (`TOUCH_ACTIVE_HIGH 1`); disolder = aktif LOW (set `0`).
- TTP223 mengkalibrasi diri ±0,5 dtk setelah daya masuk: jangan menyentuh pad saat menyalakan. Letakkan di permukaan non-logam.

### 3.5 OLED
- Alamat umum `0x3C`, sebagian `0x3D` → `OLED_I2C_ADDR`.
- OLED 1,3" sering memakai SH1106 → aktifkan `OLED_SH1106_128X64`. Modul 128×32 → `OLED_SSD1306_128X32`.

## 4. Pemeriksaan sebelum menyalakan / upload

1. **Visual**: cocokkan setiap kabel dengan tabel §1. Pastikan TRIG dan ECHO tidak tertukar, dan ECHO tidak tersambung langsung ke D5.
2. **Tanpa daya, multimeter mode resistansi**: D5–GND ≈ 3,3 kΩ; ECHO–D5 ≈ 2,2 kΩ; 5 V–3V3 **tidak** tersambung (bukan 0 Ω); VCC–GND tiap modul tidak short.
3. **Daya USB saja, sebelum upload** (firmware lama bisa saja mengemudikan pin): ukur VIN/VU ≈ 4,7–5,1 V, 3V3 ≈ 3,3 V. Bila ada panas/bau, cabut segera.
4. Ukur D5 saat HC-SR04 diam ≈ 0 V; tidak boleh mendekati 5 V.
5. Isi `firmware/include/secrets.h` (Wi-Fi 2,4 GHz, `BACKEND_URL` = IP LAN laptop, `DEVICE_TOKEN` = sama dengan `.env`).
6. **Setelah disetujui pemilik proyek**: `pio run -d firmware -t upload` lalu `pio device monitor -d firmware`. Log awal harus menampilkan `OLED OK @0x3C` dan `[wifi] terhubung`.

## 5. Kalibrasi HC-SR04

Kecepatan suara ≈ 331,3 + 0,606·T m/s. Default firmware memakai 30 °C (`SOUND_CM_PER_US 0.03495`). Selisih ±5 °C → ±0,87 % (≈ ±0,26 cm pada 30 cm ≈ ±3 poin). Karena DHT11 dihapus, koreksi dilakukan dengan penggaris di lokasi pameran:

1. Mode DEMO/LIVE apa pun; buka **Device Monitor** (jarak median ditampilkan untuk operator).
2. Letakkan benda datar (buku) tegak lurus sensor pada jarak terukur penggaris **10 cm** dan **30 cm** dari muka transduser. Catat bacaan rata-rata ±5 detik: `m1`, `m2`.
3. Hitung `CAL_SCALE = (30 − 10) / (m2 − m1)` dan `CAL_OFFSET_CM = 10 − CAL_SCALE × m1` (rumus firmware: `cm = mentah × CAL_SCALE + CAL_OFFSET_CM`, jadi bila sebelumnya bukan 1,0/0,0 hitung dari nilai mentah).
4. Isi di `config.h`, build & upload, verifikasi di 20 cm (target galat ≤ 0,5 cm).
5. Ulangi dengan telapak tangan terbuka menghadap sensor; instruksikan pengunjung memakai telapak terbuka, bukan jari.
6. Sesuaikan rentang target di **Pengaturan** bila bacaan di bawah 8 cm atau di atas 35 cm tidak stabil.

## 6. Troubleshooting

| Gejala | Kemungkinan penyebab → tindakan |
|---|---|
| OLED gelap, Serial "OLED TIDAK TERDETEKSI" | SDA/SCL tertukar, alamat 0x3D, modul SH1106, VCC tidak 3,3 V |
| OLED berisi garis acak | controller salah (SSD1306 vs SH1106) |
| Jarak selalu kosong, error `TIMEOUT` | TRIG/ECHO tertukar, HC-SR04 tidak dapat 5 V, pembagi salah sambung, tidak ada objek dalam 80 cm |
| Jarak melompat-lompat | permukaan lunak/miring, tangan terlalu kecil di sudut sinyal, sensor ultrasonik lain di dekatnya |
| Touch tidak terdeteksi | polaritas (`TOUCH_ACTIVE_HIGH`), kabel OUT, pad tersentuh saat boot (cabut-pasang daya) |
| Hanya bisa "tahan", tak bisa tap | TTP223 mode toggle (pad B disolder) |
| Dashboard "Touch tertahan" | OUT short ke VCC atau mode toggle terkunci |
| Buzzer diam | `BUZZER_PASSIVE` salah, polaritas, **mute** aktif di Pengaturan, driver transistor salah orientasi |
| Wi-Fi tidak tersambung | jaringan 5 GHz, password salah, WPA3-only (ESP8266 butuh WPA2) |
| Serial `HTTP 401` | `DEVICE_TOKEN` firmware ≠ `.env` server |
| Serial `HTTP 422` | payload ditolak validasi; pesan server tercetak di Serial — laporkan |
| Wi-Fi OK tapi server tak terjangkau | IP laptop berubah, firewall, client isolation hotspot (lihat `docs/SETUP.md`) |

## 7. Checklist hardware (isi saat board tersedia)

Laporan pengguna 15 November 2026: OLED, touch, dan HC-SR04 berfungsi di mode latihan. Pengiriman data ke server gagal (HTTP 422) karena bug firmware 3.0.0; sudah diperbaiki di 3.0.1 dan perlu diuji ulang (baris 9–11).

| # | Uji | Prosedur | Harapan | Hasil | Tanggal |
|---|---|---|---|---|---|
| 1 | Tegangan rail | multimeter VIN/VU & 3V3 | 4,7–5,1 V / 3,2–3,4 V | ☐ belum | |
| 2 | Pembagi ECHO | ukur D5 saat ping (osiloskop/LED logic) | ≤ 3,3 V | ☐ belum | |
| 3 | GPIO & wiring | cocokkan tabel §1 | sesuai | ☐ belum | |
| 4 | OLED | boot, lihat Serial & layar | "OLED OK", layar IDLE | ☐ belum | |
| 5 | Touch singkat/lama | tap & tahan 1,5 dtk di menu | pindah menu / pilih; tidak ganda | ☐ belum | |
| 6 | Buzzer | tap menu, selesai game | nada pendek terdengar, mute bekerja | ☐ belum | |
| 7 | Kalibrasi HC-SR04 | §5 di 10/20/30 cm | galat ≤ 0,5 cm | ☐ belum | |
| 8 | Sensor invalid | tutup sensor/jauhkan tangan lalu lock | "Sensor tak terbaca", tanpa skor palsu | ☐ belum | |
| 9 | Konektivitas | Device Monitor | ONLINE, RSSI tampil, heartbeat ≤ 5 dtk | ☐ belum | |
| 10 | Game penuh LIVE | 3 ronde + rating | leaderboard & review LIVE bertambah | ☐ belum | |
| 11 | Wi-Fi putus | matikan hotspot saat THANK_YOU, nyalakan lagi | OLED "Tersimpan, tunggu koneksi", lalu terkirim tanpa duplikat | ☐ belum | |
| 12 | Restart | cabut-pasang daya | log "Perangkat restart", data lama tetap | ☐ belum | |
