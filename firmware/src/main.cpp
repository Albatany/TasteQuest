// TasteQuest v3 — firmware ESP8266 NodeMCU
// ProxiRush + Exhibition Rating. HMIF UNJA × FST Market Day 2026. © Muhammad Aziz Syah Dani 2026
//
// Prinsip: game & input berjalan lokal berbasis millis(); jaringan tidak boleh merusak timer/input.
// - Edge TTP223 ditangkap ISR beserta timestamp → tidak ada tap hilang walau loop sempat terblokir request HTTP.
// - Request HTTP dibatasi HTTP_TIMEOUT_MS, maksimal satu per loop, dan TIDAK dicoba saat countdown/ronde bila server sedang tak terjangkau.
// - Event game/rating masuk antrean RAM dan diulang dengan ID yang sama (server idempoten). Antrean hilang bila listrik mati.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <U8g2lib.h>
#include <Wire.h>

#include "config.h"
#include "logic.h"
#include "payload.h"
#include "screens.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "firmware/include/secrets.h belum ada: salin secrets.example.h menjadi secrets.h (atau jalankan `npm run setup`)."
#endif

static_assert(sizeof(DEVICE_TOKEN) > 16, "DEVICE_TOKEN minimal 16 karakter (samakan dengan .env server)");
static_assert(!(DEVICE_ID[0] == 'S' && DEVICE_ID[1] == 'I' && DEVICE_ID[2] == 'M' && DEVICE_ID[3] == '-'), "DEVICE_ID tidak boleh diawali SIM- (khusus simulator)");

using namespace tq;

// ---------------- OLED ----------------
#if defined(OLED_SH1106_128X64)
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, OLED_SCL, OLED_SDA);
#elif defined(OLED_SSD1306_128X32)
U8G2_SSD1306_128X32_UNIVISION_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, OLED_SCL, OLED_SDA);
#else
U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, OLED_SCL, OLED_SDA);
#endif
static bool oledOk = false;

// ---------------- State global ----------------
static char bootHex[9];
static uint32_t eventSeq = 0;
static uint32_t hwRand(uint32_t n) { return ESP.random() % n; }
static void newEventId(char* out, size_t n) { snprintf(out, n, "%s-%s-%lu", DEVICE_ID, bootHex, (unsigned long)++eventSeq); }

static Machine machine(hwRand, newEventId);
static TouchClassifier touch;
static MedianFilter sonar;
static GameConfig pendingCfg;
static bool hasPendingCfg = false;
static bool muted = false;
static uint32_t lastActivity = 0;

static int distanceTenths(uint32_t now) { return sonar.read(now, MEDIAN_WINDOW_MS); }

// ---------------- TTP223: edge dari ISR ----------------
struct Edge { uint32_t t; bool level; };
static volatile Edge edges[16];
static volatile uint8_t edgeHead = 0;
static uint8_t edgeTail = 0;
static void IRAM_ATTR onTouchEdge() {
  uint8_t h = edgeHead;
  edges[h].t = millis();
  edges[h].level = digitalRead(TOUCH_PIN);
  edgeHead = (h + 1) & 15;
}
static inline bool isPressed(bool level) { return TOUCH_ACTIVE_HIGH ? level : !level; }

// ---------------- Buzzer (non-blocking) ----------------
struct Note { uint16_t hz, ms; };
// Tabel nada sama dengan simulator (web/src/lib/sim.ts TONES). {0,0} = akhir.
static const Note N_NAV[] = {{880, 40}, {0, 0}};
static const Note N_CONFIRM[] = {{660, 60}, {990, 90}, {0, 0}};
static const Note N_TICK[] = {{740, 90}, {0, 0}};
static const Note N_GO[] = {{1175, 250}, {0, 0}};
static const Note N_LOCK[] = {{1320, 90}, {0, 0}};
static const Note N_TIMEOUT[] = {{220, 320}, {0, 0}};
static const Note N_FINISH[] = {{523, 110}, {659, 110}, {784, 110}, {1047, 260}, {0, 0}};
static const Note N_ERROR[] = {{180, 180}, {0, 0}};
static const Note* melody = nullptr;
static uint8_t noteIdx = 0;
static bool noteOn = false;
static uint32_t noteEnd = 0;

static void buzzerOn(uint16_t hz) {
#if BUZZER_PASSIVE
  tone(BUZZER_PIN, hz);
#else
  (void)hz;
  digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? HIGH : LOW);
#endif
}
static void buzzerOff() {
#if BUZZER_PASSIVE
  noTone(BUZZER_PIN);
#endif
  digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_HIGH ? LOW : HIGH);
}
static void beep(Beep b) {
  if (b == Beep::NONE || muted) return;
  static const Note* const TABLE[] = {nullptr, N_NAV, N_CONFIRM, N_TICK, N_GO, N_LOCK, N_TIMEOUT, N_FINISH, N_ERROR};
  melody = TABLE[(int)b];
  noteIdx = 0;
  noteOn = true;
  buzzerOn(melody[0].hz);
  noteEnd = millis() + melody[0].ms;
}
static void updateBuzzer(uint32_t now) {
  if (!melody || (int32_t)(now - noteEnd) < 0) return;
  if (noteOn) {  // jeda 25 ms antar nada agar terdengar terpisah pada buzzer aktif
    buzzerOff();
    noteOn = false;
    noteEnd = now + 25;
    return;
  }
  if (!melody[++noteIdx].ms) {
    melody = nullptr;
    return;
  }
  buzzerOn(melody[noteIdx].hz);
  noteOn = true;
  noteEnd = now + melody[noteIdx].ms;
}

// ---------------- HC-SR04 ----------------
static uint32_t lastPing = 0;
static void pingSonar(uint32_t now) {
  if (now - lastPing < SONAR_INTERVAL_MS) return;
  lastPing = now;
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  static const uint32_t timeoutUs = (uint32_t)(SENSOR_MAX_CM * 2.0f / SOUND_CM_PER_US) + 600;  // ≈ 5,2 ms untuk 80 cm
  uint32_t us = pulseIn(ECHO_PIN, HIGH, timeoutUs);
  if (!us) {
    sonar.push(now, 0, SonarError::TIMEOUT);
    return;
  }
  float cm = (us * SOUND_CM_PER_US / 2.0f) * CAL_SCALE + CAL_OFFSET_CM;
  if (cm < SENSOR_MIN_CM || cm > SENSOR_MAX_CM) sonar.push(now, 0, SonarError::OUT_OF_RANGE);
  else sonar.push(now, quantizeTenths(cm), SonarError::NONE);
}

// ---------------- Antrean event (RAM) ----------------
static SendStatus ratingStatus = SendStatus::NONE;
static SendStatus gameStatus = SendStatus::NONE;
struct QEvent {
  bool used = false, isGame = false;
  char id[ID_LEN] = "";
  uint32_t createdAt = 0, nextAt = 0;
  uint8_t attempts = 0;
  RoundResult rounds[ROUNDS];
  uint16_t total = 0;
  uint32_t roundMs = 0;
  uint8_t stars = 0;
  char sessionId[ID_LEN] = "";
};
static QEvent queue[EVENT_QUEUE_SIZE];
static uint32_t dropped = 0;

static int pendingCount() {
  int n = 0;
  for (auto& q : queue) n += q.used;
  return n;
}
static QEvent& allocEvent(uint32_t now) {
  QEvent* oldest = &queue[0];
  for (auto& q : queue) {
    if (!q.used) { q = QEvent(); q.used = true; q.createdAt = now; return q; }
    if ((int32_t)(q.createdAt - oldest->createdAt) < 0) oldest = &q;
  }
  dropped++;  // antrean penuh: event tertua dikorbankan dan dilaporkan lewat heartbeat
  Serial.printf("[queue] penuh, event %s dibuang\n", oldest->id);
  *oldest = QEvent();
  oldest->used = true;
  oldest->createdAt = now;
  return *oldest;
}

static void apply(const Out& o, uint32_t now) {
  beep(o.beep);
  if (o.game) {
    QEvent& q = allocEvent(now);
    q.isGame = true;
    snprintf(q.id, sizeof q.id, "%s", machine.sessionEventId);
    for (int i = 0; i < ROUNDS; i++) q.rounds[i] = machine.results[i];
    q.total = (uint16_t)machine.total();
    q.roundMs = machine.cfg.roundMs;
    gameStatus = SendStatus::PENDING;
    Serial.printf("[game] %s total %d\n", q.id, q.total);
  }
  if (o.rating) {
    QEvent& q = allocEvent(now);
    snprintf(q.id, sizeof q.id, "%s", machine.ratingEventId);
    q.stars = (uint8_t)machine.stars;
    snprintf(q.sessionId, sizeof q.sessionId, "%s", machine.ratingSessionId);
    ratingStatus = SendStatus::PENDING;
    Serial.printf("[rating] %s %d bintang\n", q.id, q.stars);
  }
}

// ---------------- HTTP ----------------
static WiFiClient wifiClient;
static HTTPClient http;
static bool backendOk = false;
static uint32_t netFailures = 0, netRetryAt = 0;

static uint32_t backoffMs(uint32_t attempts) {
  uint32_t ms = 1000UL << (attempts > 5 ? 5 : attempts);
  return ms > BACKOFF_MAX_MS ? BACKOFF_MAX_MS : ms;
}

/** POST JSON ke server. Mengembalikan kode HTTP (>0) atau <=0 bila gagal jaringan. */
static int post(const char* path, JsonDocument& doc, String* resp = nullptr) {
  String body;
  serializeJson(doc, body);
  http.setReuse(true);
  http.setTimeout(HTTP_TIMEOUT_MS);
  int code = -1;
  if (http.begin(wifiClient, String(BACKEND_URL) + path)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " DEVICE_TOKEN);
    code = http.POST(body);
    if (code > 0) {
      String r = http.getString();
      if (code >= 400) Serial.printf("[net] %s -> HTTP %d %s\n", path, code, r.substring(0, 160).c_str());  // pesan validasi server
      if (resp) *resp = r;
    }
    http.end();
  }
  if (code > 0) {
    if (!backendOk) Serial.println("[net] server terjangkau");
    backendOk = true;
    netFailures = 0;
  } else {
    if (backendOk) Serial.printf("[net] server tidak terjangkau (%s)\n", http.errorToString(code).c_str());
    backendOk = false;
    netRetryAt = millis() + backoffMs(++netFailures);
  }
  return code;
}

static bool sendNextEvent(uint32_t now) {
  QEvent* q = nullptr;
  for (auto& e : queue)
    if (e.used && (int32_t)(now - e.nextAt) >= 0 && (!q || (int32_t)(e.createdAt - q->createdAt) < 0)) q = &e;
  if (!q) return false;
  JsonDocument d;
  if (q->isGame) buildGameEvent(d, DEVICE_ID, q->id, now - q->createdAt, q->roundMs, q->rounds, q->total);
  else buildRatingEvent(d, DEVICE_ID, q->id, now - q->createdAt, q->stars, q->sessionId);
  int code = post("/api/device/events", d);
  bool isRating = !q->isGame && strcmp(q->id, machine.ratingEventId) == 0;
  bool isGame = q->isGame && strcmp(q->id, machine.sessionEventId) == 0;
  if (code == 200 || code == 201) {
    Serial.printf("[event] %s diterima (%d)\n", q->id, code);
    if (isRating) ratingStatus = SendStatus::ACKED;
    if (isGame) gameStatus = SendStatus::ACKED;
    q->used = false;
  } else if (code >= 400 && code < 500 && code != 401 && code != 408 && code != 409 && code != 429) {
    Serial.printf("[event] %s DITOLAK server (%d) — tidak diulang\n", q->id, code);  // payload salah: jangan diulang selamanya
    if (isRating) ratingStatus = SendStatus::REJECTED;
    if (isGame) gameStatus = SendStatus::REJECTED;
    q->used = false;
  } else {
    q->nextAt = now + backoffMs(q->attempts++);
  }
  return true;
}

static void sendTelemetry(uint32_t now) {
  DeviceExtras x;
  x.distanceTenths = distanceTenths(now);
  SonarError e = sonar.error(now, MEDIAN_WINDOW_MS);
  x.sensorError = e != SonarError::NONE ? sonarErrorName(e) : (!oledOk ? "OLED_NOT_FOUND" : nullptr);
  x.touch = touch.pressed();
  x.touchStuck = touch.heldMs(now) > TOUCH_STUCK_MS;
  x.muted = muted;
  x.queue = pendingCount();
  x.ratingStatus = ratingStatus;
  JsonDocument d;
  buildTelemetry(d, DEVICE_ID, machine, now, x);
  post("/api/device/telemetry", d);
}

static void sendHeartbeat() {
  JsonDocument d;
  String ip = WiFi.localIP().toString();
  buildHeartbeat(d, DEVICE_ID, FW_VERSION, millis() / 1000, WiFi.RSSI(), ip.c_str(), ESP.getFreeHeap(), pendingCount(), dropped);
  String resp;
  if (post("/api/device/heartbeat", d, &resp) != 200) return;
  JsonDocument r;
  if (deserializeJson(r, resp)) return;
  JsonObject c = r["config"];
  GameConfig g;
  g.targetMinCm = c["targetMinCm"] | 10;
  g.targetMaxCm = c["targetMaxCm"] | 30;
  g.countdownMs = c["countdownMs"] | 3000;
  g.roundMs = c["roundMs"] | 10000;
  muted = c["muted"] | false;
  bool valid = g.targetMinCm >= 5 && g.targetMaxCm <= 50 && g.targetMaxCm - g.targetMinCm >= 4 &&
               g.countdownMs >= 1000 && g.countdownMs <= 10000 && g.roundMs >= 3000 && g.roundMs <= 30000;
  if (valid && (g.targetMinCm != machine.cfg.targetMinCm || g.targetMaxCm != machine.cfg.targetMaxCm ||
                g.countdownMs != machine.cfg.countdownMs || g.roundMs != machine.cfg.roundMs)) {
    pendingCfg = g;  // diterapkan saat IDLE agar permainan berjalan tidak berubah
    hasPendingCfg = true;
  }
}

static uint32_t lastTelemetry = 0, lastHeartbeat = 0, wifiLostAt = 0;
static uint32_t sentSig = 0;

static uint32_t stateSig() {
  return (uint32_t)machine.state | (uint32_t)machine.menuIndex << 4 | (uint32_t)machine.stars << 6 |
         (uint32_t)machine.resultCount << 9 | (uint32_t)machine.notice << 11 | (uint32_t)ratingStatus << 13 |
         (uint32_t)machine.round << 15 | (uint32_t)touch.pressed() << 17;
}

static void network(uint32_t now) {
  if (WiFi.status() != WL_CONNECTED) {
    backendOk = false;
    if (!wifiLostAt) wifiLostAt = now;
    if (now - wifiLostAt > WIFI_RETRY_MS) {  // autoReconnect kadang macet: paksa begin ulang (non-blocking)
      Serial.println("[wifi] mencoba ulang koneksi");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      wifiLostAt = now;
    }
    return;
  }
  if (wifiLostAt) {
    Serial.printf("[wifi] terhubung, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    wifiLostAt = 0;
    lastHeartbeat = 0;
  }
  bool critical = machine.state == State::COUNTDOWN || machine.state == State::ROUND_ACTIVE;
  if (!backendOk && (critical || (int32_t)(now - netRetryAt) < 0)) return;  // server mati: jangan blokir saat ronde
  if (sendNextEvent(now)) return;
  uint32_t sig = stateSig();
  if (sig != sentSig || now - lastTelemetry >= (machine.inGame() ? TELEMETRY_GAME_MS : TELEMETRY_IDLE_MS)) {
    sentSig = sig;
    lastTelemetry = now;
    sendTelemetry(now);
    return;
  }
  if (!lastHeartbeat || now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    sendHeartbeat();
  }
}

// ---------------- OLED (isi layar: firmware/include/screens.h, pratinjau: npm run oled:preview) ----------------
static uint32_t lastDraw = 0, drawnSig = 0;
static bool awake = true;

static void updateDisplay(uint32_t now) {
  if (!oledOk) return;
  // Pengunjung mendekat (HC-SR04) atau ada aktivitas → layar terang; diam lama di IDLE → redup (cegah burn-in).
  int dist = distanceTenths(now);
  bool near = dist >= 0 && dist <= (int)(PRESENCE_CM * 10);
  if (near) lastActivity = now;
  bool presence = near && machine.state == State::IDLE;
  bool wantAwake = machine.state != State::IDLE || now - lastActivity < 60000;
  if (wantAwake != awake) {
    awake = wantAwake;
    oled.setContrast(awake ? 255 : 8);
  }
  // IDLE beranimasi ±16 fps (I2C 400 kHz ≈ 25 ms/frame); layar lain digambar saat isi berubah atau berkala.
  bool timed = machine.state == State::COUNTDOWN || machine.state == State::ROUND_ACTIVE;
  uint32_t every = machine.state == State::IDLE ? 60 : timed ? 150 : 250;
  uint32_t sig = stateSig() ^ (uint32_t)presence << 20 ^ (uint32_t)backendOk << 21 ^ (uint32_t)ratingStatus << 22 ^ (uint32_t)gameStatus << 24;
  if (machine.practice && timed) sig ^= (uint32_t)dist << 8;
  if (sig == drawnSig && now - lastDraw < every) return;
  drawnSig = sig;
  lastDraw = now;
  ScreenView v{&machine, now, dist, WiFi.status() == WL_CONNECTED, backendOk, presence, gameStatus, ratingStatus};
  drawScreen(oled.getU8g2(), v);
  oled.sendBuffer();
}

// ---------------- Setup & loop ----------------
static void handleTouch(Touch t, uint32_t at) {
  if (t == Touch::NONE) return;
  lastActivity = at;
  apply(machine.input(at, t, distanceTenths(millis())), at);
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
  pinMode(TOUCH_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  buzzerOff();
  snprintf(bootHex, sizeof bootHex, "%08lx", (unsigned long)ESP.random());  // nonce boot: ID event unik walau restart

  Wire.begin(OLED_SDA, OLED_SCL);
  Wire.beginTransmission(OLED_I2C_ADDR);
  oledOk = Wire.endTransmission() == 0;
  if (oledOk) {
    oled.setI2CAddress(OLED_I2C_ADDR << 1);
    oled.setBusClock(400000);
    oled.begin();
  }
  attachInterrupt(digitalPinToInterrupt(TOUCH_PIN), onTouchEdge, CHANGE);

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.setSleepMode(WIFI_NONE_SLEEP);  // latensi rendah untuk telemetry
  WiFi.hostname(DEVICE_ID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiLostAt = millis();

  Serial.printf("\nTasteQuest %s — %s (boot %s)\nOLED %s @0x%02X, backend %s\n", FW_VERSION, DEVICE_ID, bootHex,
                oledOk ? "OK" : "TIDAK TERDETEKSI", OLED_I2C_ADDR, BACKEND_URL);
  beep(Beep::CONFIRM);
}

void loop() {
  static State prev = State::IDLE;
  uint32_t now = millis();
  while (edgeTail != edgeHead) {  // edge yang tertangkap ISR, diproses dengan timestamp aslinya
    uint32_t t = edges[edgeTail].t;
    bool level = edges[edgeTail].level;
    edgeTail = (edgeTail + 1) & 15;
    handleTouch(touch.sample(t, isPressed(level)), t);
  }
  handleTouch(touch.sample(now, isPressed(digitalRead(TOUCH_PIN))), now);

  pingSonar(now);
  now = millis();
  apply(machine.tick(now), now);
  if (hasPendingCfg && machine.state == State::IDLE) {
    machine.cfg = pendingCfg;
    hasPendingCfg = false;
    Serial.printf("[config] target %d-%d cm, ronde %lu ms\n", machine.cfg.targetMinCm, machine.cfg.targetMaxCm, (unsigned long)machine.cfg.roundMs);
  }
  if (machine.state != prev) {
    Serial.printf("[state] %s -> %s\n", stateName(prev), stateName(machine.state));
    if (machine.state == State::READY) gameStatus = SendStatus::NONE;
    prev = machine.state;
  }
  updateBuzzer(now);
  network(now);
  updateDisplay(millis());
}
