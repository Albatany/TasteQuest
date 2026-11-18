# Panduan Presentasi (2–3 menit) & Instruksi Pengunjung

## Naskah presentasi

**0:00–0:20 — Pembuka**
"Halo! Ini TasteQuest, karya IoT dari Informatika Universitas Jambi untuk FST Market Day 2026. Di sini kalian bisa **main**, **lihat datanya langsung**, dan **memberi rating** — PLAY. EXPLORE. RATE."

**0:20–1:10 — Demo ProxiRush (sambil bermain)**
"Gamenya namanya ProxiRush. Ada sensor ultrasonik HC-SR04 — prinsipnya seperti kelelawar: memancarkan bunyi 40 kHz lalu menghitung waktu pantulnya. Layar OLED memberi target jarak, misalnya 18 cm. Satu tangan mengatur jarak di depan sensor, lalu sentuh pad TTP223 untuk mengunci, atau tunggu saja sampai waktu habis dan jaraknya terkunci otomatis. Pas di target sampai +0,9 cm dapat 100; di luar itu tiap 0,1 cm berkurang 1 poin. Langsung 5 ronde yang dinilai, skor maksimal 500. Jaraknya sengaja dirahasiakan sampai dikunci, supaya benar-benar adu ketepatan."

**1:10–1:50 — Arsitektur IoT (tunjuk dashboard/kiosk)**
"Otak alatnya ESP8266. Game berjalan di alat itu sendiri, lalu hasilnya dikirim lewat Wi-Fi ke laptop ini. Server menyimpan ke database SQLite dan menyiarkan secara real-time ke dashboard dan layar kiosk. Semua lokal — tanpa cloud dan tanpa internet. Kalau Wi-Fi putus, hasil disimpan dulu di alat lalu dikirim ulang tanpa dobel."

**1:50–2:20 — Rating & data**
"Setelah main, kalian bisa memberi rating 1–5 bintang untuk karya ini langsung di alat: sentuh untuk ganti bintang, tahan untuk kirim. Dashboard menghitung rata-rata, distribusi, dan tren per jam. Kami jujur soal datanya: jumlah sesi dan rating bukan jumlah pengunjung unik."

**2:20–2:40 — Penutup**
"Mau coba pecahkan skor tertinggi di papan? Silakan! TasteQuest dibuat oleh Muhammad Aziz Syah Dani untuk HMIF UNJA."

### Pertanyaan yang sering muncul
- *Seberapa akurat sensornya?* Resolusi ±0,3 cm; kami pakai median beberapa sampel dan kalibrasi dengan penggaris di lokasi. Galat sistematis berlaku sama untuk semua pemain, jadi peringkat tetap adil.
- *Kenapa tidak pakai cloud?* Supaya tetap jalan tanpa internet, cepat, dan data pengunjung tidak keluar dari stan.
- *Kalau sensor tidak membaca?* Alat menolak mengunci dan memberi tahu — tidak pernah mengarang angka.

---

## Kartu instruksi pengunjung (cetak & tempel di stan)

> ### 🎯 PROXIRUSH — Seberapa tepat tanganmu?
> 1. **Sentuh** pad untuk membuka menu. **Tahan** untuk memilih *Main ProxiRush*, lalu **tahan** lagi untuk mulai.
> 2. Lihat **target jarak** di layar (mis. 18 cm), lalu gerakkan **telapak tangan terbuka** di depan sensor.
> 3. **Sentuh pad** untuk **mengunci**, atau tahan tanganmu diam sampai waktu habis (terkunci otomatis). Waktu 10 detik per ronde.
> 4. 5 ronde · skor maks **500** · masuk papan skor!
>
> ### ⭐ Beri rating karya kami
> Setelah main (atau pilih *Beri Rating* di menu): **sentuh** = ganti bintang, **tahan** = kirim.
>
> *Pemula? Pilih **Latihan** — jarak tampil langsung di layar.*
>
> HMIF UNJA × FST Market Day 2026 · © Muhammad Aziz Syah Dani 2026

(Emoji hanya untuk kartu cetak, tidak dipakai di UI.)
