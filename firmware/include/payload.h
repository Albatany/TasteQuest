// Pembentuk payload JSON firmware → server (kontrak v1 = shared/src/schema.ts).
// Tanpa header Arduino agar bisa diuji di laptop terhadap skema Zod server (server/test/firmware-contract.test.ts).
#pragma once
#include <ArduinoJson.h>

#include "logic.h"

namespace tq {

// Tulis lewat proxy d["key"] secara langsung. Mengubahnya dulu ke JsonVariant untuk key yang belum ada
// menghasilkan variant tak terikat: nilai hilang diam-diam dan server membalas HTTP 422 (bug v3.0.0).
template <typename Slot>
void putTenths(Slot v, int tenths) {
  if (tenths < 0) v = nullptr;
  else v = tenths / 10.0;  // tepat 1 desimal (diuji 2,0–400,0 cm)
}
template <typename Slot>
void putId(Slot v, const char* id) {
  if (id[0]) v = id;
  else v = nullptr;
}

inline void putBase(JsonDocument& d, const char* deviceId) {
  d["v"] = SCHEMA_VERSION;
  d["deviceId"] = deviceId;
  d["mode"] = "live";
}

inline void putRound(JsonArray arr, const RoundResult& r) {
  JsonObject o = arr.add<JsonObject>();
  o["round"] = r.round;
  o["targetCm"] = r.targetCm;
  putTenths(o["measuredCm"], r.measuredTenths);
  o["score"] = r.score;
  if (r.lockMs < 0) o["lockMs"] = nullptr;
  else o["lockMs"] = r.lockMs;
}

inline void buildGameEvent(JsonDocument& d, const char* deviceId, const char* eventId, uint32_t ageMs, uint32_t roundMs,
                           const RoundResult* rounds, int total) {
  putBase(d, deviceId);
  d["type"] = "game";
  d["eventId"] = eventId;
  d["ageMs"] = ageMs;
  d["roundMs"] = roundMs;
  JsonArray rs = d["rounds"].to<JsonArray>();
  for (int i = 0; i < ROUNDS; i++) putRound(rs, rounds[i]);
  d["totalScore"] = total;
}

inline void buildRatingEvent(JsonDocument& d, const char* deviceId, const char* eventId, uint32_t ageMs, int stars,
                             const char* sessionId) {
  putBase(d, deviceId);
  d["type"] = "rating";
  d["eventId"] = eventId;
  d["ageMs"] = ageMs;
  d["stars"] = stars;
  putId(d["sessionEventId"], sessionId);
}

struct DeviceExtras {
  int distanceTenths = -1;
  const char* sensorError = nullptr;  // null = tidak ada error
  bool touch = false, touchStuck = false, muted = false;
  int queue = 0;
  SendStatus ratingStatus = SendStatus::NONE;
};

inline void buildTelemetry(JsonDocument& d, const char* deviceId, const Machine& m, uint32_t now, const DeviceExtras& x) {
  putBase(d, deviceId);
  d["state"] = stateName(m.state);
  d["menuIndex"] = m.menuIndex;
  d["practice"] = m.practice;
  d["round"] = m.displayRound();
  int tc = m.targetCm();
  if (tc < 0) d["targetCm"] = nullptr;
  else d["targetCm"] = tc;
  int32_t rem = m.remainingMs(now);
  if (rem < 0) d["remainingMs"] = nullptr;
  else d["remainingMs"] = rem;
  JsonArray rs = d["results"].to<JsonArray>();
  for (int i = 0; i < m.resultCount; i++) putRound(rs, m.results[i]);
  if (m.resultCount == ROUNDS) d["totalScore"] = m.total();
  else d["totalScore"] = nullptr;
  d["stars"] = m.stars;
  if (m.notice == Notice::NO_READING) d["notice"] = "NO_READING";
  else if (m.notice == Notice::PICK_STAR) d["notice"] = "PICK_STAR";
  else d["notice"] = nullptr;
  d["rated"] = m.rated;
  putId(d["sessionEventId"], m.sessionEventId);
  putId(d["ratingEventId"], m.ratingEventId);
  static const char* const RS[] = {nullptr, "pending", "acked", "rejected"};
  if (m.ratingEventId[0] && x.ratingStatus != SendStatus::NONE) d["ratingStatus"] = RS[(int)x.ratingStatus];
  else d["ratingStatus"] = nullptr;
  putTenths(d["distanceCm"], x.distanceTenths);
  if (x.sensorError) d["sensorError"] = x.sensorError;
  else d["sensorError"] = nullptr;
  d["touch"] = x.touch;
  d["touchStuck"] = x.touchStuck;
  d["muted"] = x.muted;
  d["queue"] = x.queue;
}

inline void buildHeartbeat(JsonDocument& d, const char* deviceId, const char* fw, uint32_t uptimeS, int rssi, const char* ip,
                           uint32_t heap, int queue, uint32_t dropped) {
  putBase(d, deviceId);
  d["fw"] = fw;
  d["uptimeS"] = uptimeS;
  if (rssi >= 0 || rssi < -127) d["rssi"] = nullptr;  // ESP8266 mengembalikan 31 bila RSSI tidak valid
  else d["rssi"] = rssi;
  d["ip"] = ip;
  d["heap"] = heap;
  d["queue"] = queue;
  d["dropped"] = dropped;
}

}  // namespace tq
