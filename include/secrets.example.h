// Contoh secrets firmware. Salin menjadi secrets.h (atau jalankan `npm run setup` di laptop server).
// secrets.h ada di .gitignore — jangan di-commit.
#pragma once

// Wi-Fi 2,4 GHz (ESP8266 tidak mendukung 5 GHz). Hotspot tidak perlu akses internet.
#define WIFI_SSID "NAMA_WIFI_2_4GHZ"
#define WIFI_PASSWORD "PASSWORD_WIFI"

// IP LAN laptop server, lihat baris "LAN" saat `npm start`. Pakai IP (bukan hostname) agar tidak bergantung DNS.
#define BACKEND_URL "http://192.168.1.10:3000"

// Harus sama persis dengan DEVICE_TOKEN di .env server.
#define DEVICE_TOKEN "samakan-dengan-DEVICE_TOKEN-di-.env"

// Huruf/angka/-/_ maks. 32 karakter. Jangan diawali "SIM-" (khusus simulator).
#define DEVICE_ID "TQ-ESP01"
