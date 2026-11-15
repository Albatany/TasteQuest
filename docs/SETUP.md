# Setup Jaringan Lokal & Offline — TasteQuest v3

Semua berjalan di jaringan lokal sendiri: ESP8266 → HTTP → laptop (Node.js + SQLite) → browser. Tidak ada cloud, API key, atau hosting. Internet hanya dibutuhkan **sekali** saat instalasi.

## 1. Persiapan (dengan internet, cukup sekali)

```bash
node -v                      # perlu Node.js ≥ 22.13 (diuji dengan 24.22)
npm install                  # dependency web + server
npm run setup                # buat .env (password operator & token acak) + firmware/include/secrets.h
npm run build                # build dashboard produksi → web/dist
pio run -d firmware          # unduh toolchain ESP8266 + library, kompilasi firmware
npx playwright install chromium   # opsional, hanya untuk `npm run e2e`
```

Password operator ada di `.env` (`OPERATOR_PASSWORD`). Jangan commit `.env` dan `secrets.h`.

## 2. Hari pameran (tanpa internet)

```bash
npm start
```

Output menampilkan URL lokal, URL LAN, lokasi database, dan mode aktif:

```
Dashboard : http://localhost:3000
LAN       : http://192.168.1.8:3000   (BACKEND_URL firmware: http://192.168.1.8:3000)
Kiosk     : http://localhost:3000/#/kiosk
Database  : /…/data/tastequest.db
```

Kiosk: buka `http://localhost:3000/#/kiosk` di monitor kedua, tekan **Layar penuh** (atau F11). Dashboard operator di jendela lain.

Matikan sleep/suspend laptop selama acara.

## 3. Pilihan jaringan Wi-Fi (2,4 GHz)

ESP8266 **hanya 2,4 GHz** dan butuh WPA2 (bukan WPA3-only). Hotspot **tidak perlu** punya internet.

| Opsi | Catatan |
|---|---|
| Hotspot HP | Android: Hotspot → Band AP → 2,4 GHz. iPhone: aktifkan *Maximize Compatibility*. Laptop & ESP8266 tersambung ke hotspot ini. |
| Router portabel | Paling stabil. Pakai SSID khusus stan, bukan jaringan tamu. |
| Hotspot laptop (Linux) | `nmcli dev wifi hotspot ifname wlan0 band bg ssid TasteQuest password 'rahasia123'` → laptop biasanya `10.42.0.1` |
| Hotspot laptop (Windows) | Settings → Mobile hotspot, band 2,4 GHz → laptop biasanya `192.168.137.1` |

Hindari Wi-Fi kampus/publik: sering memakai captive portal dan *client isolation*.

## 4. Mencari IP LAN laptop

- Baris `LAN` saat `npm start` (paling mudah), atau `npm run setup`
- Linux: `hostname -I` atau `ip -4 addr`
- Windows: `ipconfig` → *IPv4 Address* adaptor Wi-Fi
- macOS: `ipconfig getifaddr en0`

Masukkan ke `firmware/include/secrets.h`:

```cpp
#define BACKEND_URL "http://192.168.1.8:3000"
```

Gunakan IP, bukan hostname. Bila IP berubah (ganti jaringan), perbarui lalu upload ulang firmware — atau aktifkan *DHCP reservation* / IP statis di router agar IP laptop tetap.

## 5. Uji klien bisa saling berkomunikasi (client isolation)

Dari HP yang tersambung ke Wi-Fi yang sama, buka:

```
http://<IP-laptop>:3000/api/health
```

Harus tampil JSON `{"ok":true,…}`. Bila timeout padahal laptop bisa membuka `localhost:3000`:
1. Hotspot/router memakai **AP/client isolation** atau jaringan tamu → matikan, atau ganti hotspot.
2. **Firewall** laptop memblokir port 3000 (lihat §6).
3. IP salah (laptop punya beberapa adaptor; pilih yang satu subnet dengan HP, mis. `192.168.43.x`).

## 6. Firewall

- Ubuntu/Debian (ufw): `sudo ufw allow 3000/tcp`
- Fedora (firewalld): `sudo firewall-cmd --add-port=3000/tcp`
- Windows: saat muncul prompt Node.js pilih **Private network → Allow**, atau (PowerShell admin)
  `netsh advfirewall firewall add rule name="TasteQuest" dir=in action=allow protocol=TCP localport=3000`
  Pastikan profil jaringan Wi-Fi = *Private*.
- macOS: System Settings → Network → Firewall → izinkan `node`.

## 7. Upload firmware (setelah wiring diperiksa — `docs/WIRING.md` §4)

```bash
pio run -d firmware -t upload      # atau Arduino IDE dengan board "NodeMCU 1.0 (ESP-12E)"
pio device monitor -d firmware     # 115200 baud
```

- Linux: user perlu grup `dialout` (`sudo usermod -aG dialout $USER`, lalu login ulang).
- Windows: pasang driver USB-serial CH340 atau CP210x sesuai chip NodeMCU.
- Log yang diharapkan: `OLED OK @0x3C`, `[wifi] terhubung, IP …`, `[net] server terjangkau`. Dashboard → Device Monitor menampilkan perangkat **ONLINE**.

## 8. Demo Mode & Live Mode

- **DEMO** (default): Pengaturan → login → mode DEMO. ProxiRush Arena → **Nyalakan** simulator SIM-01. Pad sentuh dapat diklik/ditahan atau dikendalikan dengan Spasi; jarak lewat slider. Ada toggle *Sensor error* dan *Putuskan Wi-Fi*.
- **LIVE**: Pengaturan → mode LIVE. Dashboard & kiosk hanya menampilkan data ESP8266; bila alat tidak terhubung tampil **OFFLINE** + waktu terakhir terlihat — bukan angka simulasi. Simulator ditolak server (HTTP 409).
- Data, analytics, dan leaderboard terpisah per mode. **Reset data demo** (Pengaturan, ketik `RESET`) tidak pernah menghapus data live.
- Data ESP8266 selalu disimpan sebagai LIVE walaupun dashboard sedang di mode DEMO.

## 9. Pemulihan saat Wi-Fi putus

| Situasi | Yang terjadi | Tindakan operator |
|---|---|---|
| Wi-Fi putus sebentar | Game tetap berjalan di ESP8266. Event game/rating masuk antrean RAM (maks. 12) dan dikirim ulang dengan ID sama → tidak ada duplikat. OLED: "Tersimpan, tunggu koneksi". | Tunggu; firmware reconnect otomatis (paksa ulang tiap 30 dtk). |
| Putus > 15 dtk | Dashboard: perangkat OFFLINE + "terakhir terlihat". | Cek hotspot menyala & 2,4 GHz. |
| Listrik ESP8266 mati saat antrean berisi | **Event yang belum terkirim hilang** (RAM). Heartbeat berikutnya mencatat "Perangkat restart". | Hindari mencabut daya saat OLED masih "antre". |
| Server/laptop restart | Data SQLite tetap. Login operator perlu diulang. Dashboard menyambung ulang dan mengambil snapshot otomatis. | `npm start` lagi. |
| IP laptop berubah | ESP8266 tidak bisa mengirim (Serial: server tidak terjangkau). | Kembalikan IP (reservation) atau perbarui `BACKEND_URL` + upload. |

## 10. Data & backup

- Database: `data/tastequest.db` (ubah lewat `DB_PATH` di `.env`). Mode WAL: salin juga `-wal`/`-shm`, atau hentikan server dulu sebelum menyalin.
- Ekspor CSV (UTF-8, waktu WIB): Pengaturan → Data & ekspor.
- Migrasi skema otomatis saat start (`PRAGMA user_version`).
