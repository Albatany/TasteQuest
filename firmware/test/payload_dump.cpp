// Mencetak payload firmware nyata (payload.h + logic.h) untuk diuji terhadap skema server.
// Dipakai oleh server/test/firmware-contract.test.ts. Format baris: <jenis>\t<json>
#include <cstdio>
#include <string>

#include "payload.h"

using namespace tq;

static uint32_t testRand(uint32_t n) { static uint32_t s = 7; s = s * 1103515245u + 12345u; return (s >> 16) % n; }
static int idSeq = 0;
static void testId(char* out, size_t n) { snprintf(out, n, "TQ-ESP01-a1b2c3d4-%d", ++idSeq); }
static const char* DEV = "TQ-ESP01";

static void emit(const char* kind, JsonDocument& d) {
  std::string s;
  serializeJson(d, s);
  printf("%s\t%s\n", kind, s.c_str());
}

static void telemetry(const Machine& m, uint32_t now, DeviceExtras x = {}) {
  JsonDocument d;
  buildTelemetry(d, DEV, m, now, x);
  emit("telemetry", d);
}

int main() {
  Machine m(testRand, testId);
  uint32_t now = 1000;
  Out o;
  auto wait = [&](uint32_t ms) { for (uint32_t end = now + ms; now < end;) { now += 50; o.game |= m.tick(now).game; } };

  DeviceExtras noSensor;
  noSensor.sensorError = "TIMEOUT";
  telemetry(m, now, noSensor);  // IDLE: id kosong, jarak tidak ada

  m.input(now, Touch::SHORT, -1);  // MENU
  m.input(now, Touch::LONG, -1);   // READY
  m.input(now, Touch::LONG, -1);   // COUNTDOWN
  wait(3000);
  DeviceExtras live;
  live.distanceTenths = 176;
  live.touch = true;
  telemetry(m, now, live);  // ROUND_ACTIVE
  m.input(now, Touch::SHORT, m.targets[0] * 10 + 4);
  wait(2500 + 3000);
  m.input(now, Touch::SHORT, m.targets[1] * 10 - 7);
  wait(2500 + 3000 + 10000);  // ronde 3 habis waktu
  wait(2500);
  if (!o.game) { fprintf(stderr, "skenario gagal: event game tidak terbentuk\n"); return 1; }
  telemetry(m, now, live);  // GAME_RESULT dengan sessionEventId & ronde timeout

  JsonDocument g;
  buildGameEvent(g, DEV, m.sessionEventId, 1234, m.cfg.roundMs, m.results, m.total());
  emit("game", g);

  m.input(now, Touch::SHORT, -1);  // RATING_OFFER
  m.input(now, Touch::LONG, -1);   // RATING
  for (int i = 0; i < 4; i++) m.input(now, Touch::SHORT, -1);
  m.input(now, Touch::LONG, -1);  // THANK_YOU
  DeviceExtras pending;
  pending.ratingStatus = SendStatus::PENDING;
  pending.muted = true;
  pending.queue = 1;
  telemetry(m, now, pending);

  JsonDocument r1;
  buildRatingEvent(r1, DEV, m.ratingEventId, 0, m.stars, m.ratingSessionId);  // setelah bermain
  emit("rating", r1);
  JsonDocument r2;
  buildRatingEvent(r2, DEV, "TQ-ESP01-a1b2c3d4-99", 5000, 5, "");  // rating langsung dari menu
  emit("rating", r2);

  JsonDocument h1, h2;
  buildHeartbeat(h1, DEV, "3.0.1", 3600, -61, "192.168.1.50", 31000, 0, 0);
  emit("heartbeat", h1);
  buildHeartbeat(h2, DEV, "3.0.1", 5, 31, "0.0.0.0", 30000, 2, 1);  // RSSI tidak valid
  emit("heartbeat", h2);
  return 0;
}
