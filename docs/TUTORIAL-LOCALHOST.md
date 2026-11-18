# Tutorial: dashboard di localhost, dengan atau tanpa internet

Dashboard selalu dibuka di laptop server lewat **http://localhost:3000** (kiosk: **http://localhost:3000/#/kiosk**).
Yang berbeda hanya jaringan yang dipakai ESP8266 untuk mengirim data ke laptop:

| | Opsi 1: ada internet | Opsi 2: tidak ada internet |
|---|---|---|
| Wi-Fi | hotspot HP / router (seperti biasa) | **laptop jadi hotspot** sendiri |
| `BACKEND_URL` | IP LAN laptop (berubah-ubah) | `http://10.42.0.1:3000` (tetap, Linux) |
| Butuh internet? | tidak untuk berjalan, hanya kebetulan ada | tidak sama sekali |

Semua aset dashboard (font, ikon, logo) tersimpan lokal, jadi browser tidak pernah butuh internet.

## 0. Persiapan, sekali saja (butuh internet)

```bash
npm install
npm run setup            # .env + firmware/include/secrets.h
npm run build            # dashboard → web/dist
pio run -d firmware      # unduh toolchain ESP8266 + library (supaya upload nanti bisa offline)
```

Setelah ini semua langkah di bawah bisa dilakukan tanpa internet.

## Opsi 1: ada internet (seperti biasa)

1. Sambungkan laptop ke Wi-Fi **2,4 GHz** (hotspot HP atau router stan).
2. Jalankan server:
   ```bash
   npm start
   ```
   Catat baris `LAN : http://192.168.x.x:3000`.
3. Isi `firmware/include/secrets.h`:
   ```cpp
   #define WIFI_SSID "nama-wifi-itu"
   #define WIFI_PASSWORD "password-wifi-itu"
   #define BACKEND_URL "http://192.168.x.x:3000"   // dari baris LAN
   ```
4. Upload firmware (kabel USB): `pio run -d firmware -t upload`
5. Buka **http://localhost:3000** → Device Monitor → perangkat **ONLINE**.

## Opsi 2: tidak ada internet (laptop jadi hotspot)

Laptop membuat Wi-Fi sendiri, ESP8266 bergabung ke Wi-Fi itu. Tidak ada router, tidak ada internet.

### Langkah 1. Nyalakan hotspot laptop (Linux, NetworkManager)

```bash
nmcli dev status                      # cari DEVICE bertipe wifi, mis. wlp2s0
nmcli dev wifi hotspot ifname wlp2s0 band bg ssid TasteQuest password 'rahasia123'
ip -4 addr show wlp2s0                # biasanya inet 10.42.0.1/24
```

- `band bg` = 2,4 GHz (ESP8266 tidak bisa 5 GHz). Password minimal 8 karakter.
- Selama jadi hotspot, Wi-Fi laptop tidak tersambung ke Wi-Fi lain. Itu normal.
- Mematikan hotspot: `nmcli con down Hotspot`. Menyalakan lagi besok: `nmcli con up Hotspot`.
- Windows: Settings → Network & internet → Mobile hotspot (band 2,4 GHz, IP laptop biasanya `192.168.137.1`). Windows sering menolak menyalakan hotspot kalau laptop sendiri tidak punya koneksi. Kalau begitu pakai hotspot HP Android dengan data seluler dimatikan (tetap bisa jadi Wi-Fi lokal), lalu ikuti Opsi 1.

### Langkah 2. Jalankan server

```bash
npm start
```

Harus muncul baris `LAN : http://10.42.0.1:3000`. Kalau firewall aktif: `sudo ufw allow 3000/tcp`.

### Langkah 3. Arahkan firmware ke hotspot laptop

`firmware/include/secrets.h`:

```cpp
#define WIFI_SSID "TasteQuest"
#define WIFI_PASSWORD "rahasia123"
#define BACKEND_URL "http://10.42.0.1:3000"
```

Upload lewat kabel USB (tidak butuh internet karena toolchain sudah diunduh di langkah 0):

```bash
pio run -d firmware -t upload
pio device monitor -d firmware        # 115200 baud
```

Serial yang benar: `[wifi] terhubung, IP 10.42.0.x` lalu `[net] server terjangkau`.

### Langkah 4. Buka dashboard

- Operator: **http://localhost:3000** → Device Monitor → `TQ-ESP01` **ONLINE**.
- Pengaturan → mode **LIVE** agar dashboard dan kiosk menampilkan data alat.
- Kiosk di monitor kedua: **http://localhost:3000/#/kiosk** → Layar penuh.
- HP panitia boleh ikut melihat: sambungkan ke Wi-Fi `TasteQuest`, buka `http://10.42.0.1:3000`.

## Tanpa alat sama sekali (demo)

Cukup `npm start` lalu buka **http://localhost:3000** → Pengaturan → login → mode **DEMO** → ProxiRush Arena → **Nyalakan**. Simulator berjalan di browser; tidak butuh Wi-Fi, hotspot, atau internet.

## Pindah antara Opsi 1 dan Opsi 2

Nama Wi-Fi, password, dan `BACKEND_URL` tertanam di firmware. Pindah opsi = ubah `secrets.h` lalu upload ulang.
Agar tidak bolak-balik, pakai **Opsi 2 setiap hari**: hotspot laptop tetap berfungsi walaupun ada internet, dan IP `10.42.0.1` tidak berubah.

## Kalau tidak tersambung

| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Serial tidak pernah `[wifi] terhubung` | hotspot 5 GHz, SSID/password salah | pakai `band bg`, cek ejaan di `secrets.h`, upload ulang |
| `[wifi] terhubung` tapi `server tidak terjangkau` | `BACKEND_URL` salah, firewall, `npm start` belum jalan | samakan dengan baris `LAN`, `sudo ufw allow 3000/tcp` |
| Dashboard `localhost:3000` tidak terbuka | server mati atau port dipakai | jalankan `npm start`, baca pesan errornya |
| Device Monitor ONLINE tapi kiosk "SIMULATOR BELUM AKTIF" | dashboard masih mode DEMO | Pengaturan → mode LIVE |

Detail jaringan, firewall per OS, dan pemulihan Wi-Fi: [`SETUP.md`](SETUP.md).
