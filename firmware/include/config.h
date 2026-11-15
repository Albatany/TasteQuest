// Konfigurasi hardware TasteQuest v3. Pin mapping final (menggantikan seluruh pin lama).
// Lihat docs/WIRING.md sebelum menyalakan atau meng-upload. JANGAN pakai D3, D4, D8 untuk sensor (pin strapping boot).
#pragma once

// ---------------- Pin mapping (NodeMCU → GPIO) ----------------
#define OLED_SCL D1    // GPIO5
#define OLED_SDA D2    // GPIO4
#define TRIG_PIN D6    // GPIO12
#define ECHO_PIN D5    // GPIO14 — WAJIB lewat pembagi tegangan (Echo 5V → ~3V)
#define TOUCH_PIN D7   // GPIO13
#define BUZZER_PIN D0  // GPIO16 — sinyal kontrol, bukan sumber daya. HIGH sesaat saat boot (normal).
// Wire.begin(OLED_SDA, OLED_SCL);

// ---------------- OLED ----------------
// Controller & resolusi: pilih SATU. Asumsi awal SSD1306 128×64.
#define OLED_SSD1306_128X64
// #define OLED_SSD1306_128X32
// #define OLED_SH1106_128X64   // banyak modul 1,3" memakai SH1106
#define OLED_I2C_ADDR 0x3C     // umumnya 0x3C; sebagian modul 0x3D (lihat label di belakang modul)

// ---------------- Buzzer ----------------
#define BUZZER_PASSIVE 0       // 1 = buzzer pasif (perlu frekuensi, pakai tone()); 0 = buzzer aktif (cukup ON/OFF)
#define BUZZER_ACTIVE_HIGH 1   // 1 = bunyi saat pin HIGH; 0 = modul/driver aktif-LOW

// ---------------- TTP223 ----------------
// Mode wajib: momentary (jumper B terbuka) agar tekan singkat/lama bisa dibedakan.
#define TOUCH_ACTIVE_HIGH 1    // default TTP223 = aktif HIGH (jumper A terbuka). Jumper A disolder → set 0.
#define TOUCH_STUCK_MS 15000   // ditahan lebih dari ini dilaporkan sebagai "touch tertahan"

// ---------------- HC-SR04 & kalibrasi ----------------
// Kecepatan suara bergantung suhu: v ≈ 331,3 + 0,606·T(°C) m/s. Default 30 °C (ruang pameran Jambi) = 0,03495 cm/µs.
// DHT11 tidak dipakai, jadi kalibrasi dilakukan manual dengan penggaris (docs/WIRING.md §Kalibrasi).
#define SOUND_CM_PER_US 0.03495f
#define CAL_OFFSET_CM 0.0f     // koreksi tetap hasil kalibrasi (cm), mis. -0.4
#define CAL_SCALE 1.0f         // koreksi skala hasil kalibrasi
#define SENSOR_MIN_CM 2.0f     // di bawah ini HC-SR04 tidak andal
#define SENSOR_MAX_CM 80.0f    // batas baca; juga menentukan timeout pulseIn (blocking maks ~5 ms)
#define SONAR_INTERVAL_MS 60   // jeda antar ping (datasheet: ≥ 60 ms agar gema lama tidak terbaca)
#define MEDIAN_WINDOW_MS 400   // hanya sampel 400 ms terakhir yang dipakai (tolak data usang)
#define PRESENCE_CM 60.0f      // pengunjung mendekat → OLED "bangun" (bukan hitungan pengunjung, tidak memulai game)

// ---------------- Jaringan ----------------
#define FW_VERSION "3.0.2"
#define HTTP_TIMEOUT_MS 800        // batas connect + respons per request (dibatasi agar input tidak macet lama)
#define HEARTBEAT_MS 5000
#define TELEMETRY_IDLE_MS 1000
#define TELEMETRY_GAME_MS 500
#define EVENT_QUEUE_SIZE 12        // antrean RAM; hilang bila listrik mati
#define BACKOFF_MAX_MS 30000
#define WIFI_RETRY_MS 30000        // paksa reconnect bila Wi-Fi putus lebih lama dari ini
