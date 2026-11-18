// Logika inti TasteQuest — cerminan C++ dari shared/src/game.ts (ubah keduanya bersamaan).
// Tanpa header Arduino agar bisa diuji di laptop: npm run test:fw
#pragma once
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace tq {

constexpr int SCHEMA_VERSION = 1;
constexpr int ROUNDS = 5;
constexpr uint32_t DEBOUNCE_MS = 30, LONG_PRESS_MS = 1200, NOTICE_MS = 1500, MENU_TIMEOUT_MS = 20000,
                   ROUND_RESULT_MS = 2500, GAME_RESULT_MS = 8000, OFFER_TIMEOUT_MS = 10000,
                   RATING_TIMEOUT_MS = 20000, THANK_YOU_MS = 4000;
constexpr int ID_LEN = 64;

enum class State : uint8_t { IDLE, MENU, READY, COUNTDOWN, ROUND_ACTIVE, ROUND_RESULT, GAME_RESULT, RATING_OFFER, RATING, THANK_YOU };
inline const char* stateName(State s) {
  static const char* const N[] = {"IDLE", "MENU", "READY", "COUNTDOWN", "ROUND_ACTIVE", "ROUND_RESULT", "GAME_RESULT", "RATING_OFFER", "RATING", "THANK_YOU"};
  return N[(int)s];
}
static const char* const MENU_ITEMS[] = {"Main ProxiRush", "Latihan", "Beri Rating"};

enum class Touch : uint8_t { NONE, SHORT, LONG };
enum class Beep : uint8_t { NONE, NAV, CONFIRM, TICK, GO, LOCK, TIMEOUT, FINISH, ERROR, FINISH_MID, FINISH_LOW };
enum class Notice : uint8_t { NONE, NO_READING, PICK_STAR };
enum class SendStatus : uint8_t { NONE, PENDING, ACKED, REJECTED };  // status kirim event ke server

struct GameConfig {
  int targetMinCm = 10, targetMaxCm = 30;
  uint32_t countdownMs = 3000, roundMs = 10000;
};

// Jarak disimpan dalam persepuluhan cm (int). -1 = tidak ada bacaan.
// Zona 100: target s.d. target + 0,9 cm (toleransi sensor di luar ruangan); selain itu clamp(100 - |a10 - t10|, 0, 100).
inline int roundScore(int measuredTenths, int targetCm) {
  if (measuredTenths < 0) return 0;
  int t10 = targetCm * 10;
  if (measuredTenths >= t10 && measuredTenths <= t10 + 9) return 100;
  int s = 100 - abs(measuredTenths - t10);
  return s < 0 ? 0 : (s > 100 ? 100 : s);
}
// Tingkat hasil akhir (skala 500): 3 MASTER, 2 PRO, 1 NICE, 0 COBA LAGI. Dipakai label OLED dan melodi akhir.
inline int resultTier(int total) { return total >= 450 ? 3 : total >= 330 ? 2 : total >= 170 ? 1 : 0; }

// Median n > 0 nilai (mengurutkan v). Jumlah genap: rata-rata dua nilai tengah (dibulatkan).
inline int median(int* v, int n) {
  for (int i = 1; i < n; i++)
    for (int j = i; j > 0 && v[j - 1] > v[j]; j--) { int x = v[j]; v[j] = v[j - 1]; v[j - 1] = x; }
  return (v[(n - 1) / 2] + v[n / 2] + 1) / 2;
}
inline int quantizeTenths(float cm) { return (int)(cm * 10.0f + (cm >= 0 ? 0.5f : -0.5f)); }

struct RoundResult {
  uint8_t round = 0, targetCm = 0, score = 0;
  int16_t measuredTenths = -1;
  int32_t lockMs = -1;
};

// ---------------- Touch: debounce stabilitas + release gating ----------------
class TouchClassifier {
 public:
  Touch sample(uint32_t t, bool raw) {
    Touch ev = settle(t);
    if (ev == Touch::NONE && stable_ && cand_ && !gated_ && t - pressedAt_ >= LONG_PRESS_MS) {
      gated_ = true;
      ev = Touch::LONG;
    }
    if (raw != cand_) {
      cand_ = raw;
      candSince_ = t;
    }
    return ev;
  }
  bool pressed() const { return stable_; }
  uint32_t heldMs(uint32_t t) const { return stable_ ? t - pressedAt_ : 0; }

 private:
  Touch settle(uint32_t t) {
    if (cand_ == stable_ || t - candSince_ < DEBOUNCE_MS) return Touch::NONE;
    stable_ = cand_;
    if (stable_) {
      pressedAt_ = candSince_;
      gated_ = false;
      return Touch::NONE;
    }
    return gated_ ? Touch::NONE : Touch::SHORT;
  }
  bool stable_ = false, cand_ = false, gated_ = false;
  uint32_t candSince_ = 0, pressedAt_ = 0;
};

// ---------------- Median filter HC-SR04 ----------------
enum class SonarError : uint8_t { NONE, TIMEOUT, OUT_OF_RANGE, STALE };
inline const char* sonarErrorName(SonarError e) {
  static const char* const N[] = {"", "TIMEOUT", "OUT_OF_RANGE", "STALE"};
  return N[(int)e];
}

class MedianFilter {
 public:
  static constexpr int N = 5, MIN_VALID = 3;
  void push(uint32_t t, int tenths, SonarError err) {
    at_[head_] = t;
    val_[head_] = err == SonarError::NONE ? tenths : -1;
    head_ = (head_ + 1) % N;
    if (count_ < N) count_++;
    lastErr_ = err;
    lastAt_ = t;
  }
  // Median sampel valid dalam jendela waktu; -1 bila kurang dari MIN_VALID (jangan pernah mengarang jarak).
  int read(uint32_t now, uint32_t windowMs) const {
    int v[N], n = 0;
    for (int i = 0; i < count_; i++)
      if (val_[i] >= 0 && now - at_[i] <= windowMs) v[n++] = val_[i];
    return n < MIN_VALID ? -1 : median(v, n);
  }
  SonarError error(uint32_t now, uint32_t windowMs) const {
    if (read(now, windowMs) >= 0) return SonarError::NONE;
    if (count_ == 0 || now - lastAt_ > windowMs) return SonarError::STALE;
    return lastErr_ == SonarError::NONE ? SonarError::STALE : lastErr_;
  }

 private:
  uint32_t at_[N] = {0};
  int val_[N] = {0};
  int head_ = 0, count_ = 0;
  SonarError lastErr_ = SonarError::STALE;
  uint32_t lastAt_ = 0;
};

// ---------------- Finite state machine ----------------
struct Out {
  Beep beep = Beep::NONE;
  bool game = false;    // event game baru siap diantrikan (lihat results/sessionEventId)
  bool rating = false;  // event rating baru (lihat stars/ratingEventId/ratingSessionId)
};

class Machine {
 public:
  typedef uint32_t (*RandFn)(uint32_t n);
  typedef void (*IdFn)(char* out, size_t n);

  State state = State::IDLE;
  uint32_t enteredAt = 0;
  int menuIndex = 0;
  bool practice = false;
  int round = 0;
  uint8_t targets[ROUNDS] = {0};
  RoundResult results[ROUNDS];
  int resultCount = 0;
  int stars = 0;
  bool rated = false;
  char sessionEventId[ID_LEN] = "";
  char ratingSessionId[ID_LEN] = "";
  char ratingEventId[ID_LEN] = "";
  Notice notice = Notice::NONE;
  uint32_t noticeAt = 0;
  GameConfig cfg;

  Machine(RandFn rand, IdFn newId) : rand_(rand), newId_(newId) {}

  Out input(uint32_t now, Touch touch, int distanceTenths) {
    Out o;
    switch (state) {
      case State::IDLE:
        menuIndex = 0;
        go(State::MENU, now);
        o.beep = Beep::NAV;
        break;
      case State::MENU:
        if (touch == Touch::SHORT) {
          menuIndex = (menuIndex + 1) % 3;
          enteredAt = now;
          o.beep = Beep::NAV;
        } else if (menuIndex == 2) {
          startRating(now, "");
          o.beep = Beep::CONFIRM;
        } else {
          practice = menuIndex == 1;  // 0 = Main ProxiRush (langsung dinilai), 1 = Latihan
          go(State::READY, now);
          o.beep = Beep::CONFIRM;
        }
        break;
      case State::READY:
        if (touch == Touch::SHORT) {
          go(State::MENU, now);
          o.beep = Beep::NAV;
        } else {
          start(now);
          o.beep = Beep::CONFIRM;
        }
        break;
      case State::ROUND_ACTIVE:
        if (now - enteredAt >= cfg.roundMs) break;  // terlambat: tick() yang menutup ronde
        if (distanceTenths < 0) {
          setNotice(Notice::NO_READING, now);  // jangan pernah mengganti error sensor dengan jarak palsu
          o.beep = Beep::ERROR;
        } else {
          finishRound(now, distanceTenths, (int32_t)(now - enteredAt));
          o.beep = Beep::LOCK;
        }
        break;
      case State::GAME_RESULT:
        go(State::RATING_OFFER, now);
        o.beep = Beep::NAV;
        break;
      case State::RATING_OFFER:
        if (touch == Touch::LONG) {
          startRating(now, sessionEventId);
          o.beep = Beep::CONFIRM;
        } else {
          rated = false;
          go(State::THANK_YOU, now);
          o.beep = Beep::NAV;
        }
        break;
      case State::RATING:
        if (touch == Touch::SHORT) {
          stars = stars % 5 + 1;
          enteredAt = now;
          o.beep = Beep::NAV;
        } else if (stars == 0) {
          setNotice(Notice::PICK_STAR, now);
          enteredAt = now;
          o.beep = Beep::ERROR;
        } else {
          newId_(ratingEventId, sizeof ratingEventId);
          o.rating = true;
          rated = true;
          go(State::THANK_YOU, now);
          o.beep = Beep::CONFIRM;
        }
        break;
      default:  // COUNTDOWN, ROUND_RESULT, THANK_YOU: input diabaikan
        break;
    }
    return o;
  }

  Out tick(uint32_t now) {
    Out o;
    if (notice != Notice::NONE && now - noticeAt >= NOTICE_MS) notice = Notice::NONE;
    uint32_t t = now - enteredAt, lim = limit();
    if (state == State::COUNTDOWN && t < lim) {
      int s = (int)(t / 1000);
      if (s != lastTick_) {
        lastTick_ = s;
        o.beep = Beep::TICK;
      }
    }
    if (!lim || t < lim) return o;
    switch (state) {
      case State::COUNTDOWN:
        go(State::ROUND_ACTIVE, now);
        recentCount_ = 0;
        o.beep = Beep::GO;
        break;
      case State::ROUND_ACTIVE: {
        // Waktu habis: kunci otomatis dengan median bacaan valid terakhir. Nol hanya bila sepanjang ronde tak ada bacaan.
        int v[5];
        memcpy(v, recent_, sizeof v);
        int m = recentCount_ ? median(v, recentCount_) : -1;
        finishRound(now, m, m < 0 ? -1 : (int32_t)cfg.roundMs);
        o.beep = Beep::TIMEOUT;
        break;
      }
      case State::ROUND_RESULT:
        if (round < ROUNDS - 1) {
          round++;
          go(State::COUNTDOWN, now);
        } else {
          if (!practice) {
            newId_(sessionEventId, sizeof sessionEventId);
            o.game = true;
          }
          go(State::GAME_RESULT, now);
          static const Beep FINISH_BEEPS[] = {Beep::FINISH_LOW, Beep::FINISH_MID, Beep::FINISH, Beep::FINISH};
          o.beep = FINISH_BEEPS[resultTier(total())];
        }
        break;
      case State::GAME_RESULT:
        go(State::RATING_OFFER, now);
        break;
      default:
        go(State::IDLE, now);
    }
    return o;
  }

  // Bacaan jarak valid per ping sensor; hanya disimpan (5 terakhir) saat ronde berjalan.
  void reading(int tenths) {
    if (state != State::ROUND_ACTIVE) return;
    if (recentCount_ == 5) memmove(recent_, recent_ + 1, 4 * sizeof recent_[0]);
    else recentCount_++;
    recent_[recentCount_ - 1] = tenths;
  }

  bool inGame() const { return state == State::COUNTDOWN || state == State::ROUND_ACTIVE || state == State::ROUND_RESULT || state == State::GAME_RESULT; }
  int displayRound() const { return inGame() ? round + 1 : 0; }
  int targetCm() const { return inGame() ? targets[round] : -1; }
  int32_t remainingMs(uint32_t now) const {
    uint32_t lim = limit(), t = now - enteredAt;
    return lim ? (t >= lim ? 0 : (int32_t)(lim - t)) : -1;
  }
  int total() const {
    int s = 0;
    for (int i = 0; i < resultCount; i++) s += results[i].score;
    return s;
  }

 private:
  uint32_t limit() const {
    switch (state) {
      case State::MENU: case State::READY: return MENU_TIMEOUT_MS;
      case State::COUNTDOWN: return cfg.countdownMs;
      case State::ROUND_ACTIVE: return cfg.roundMs;
      case State::ROUND_RESULT: return ROUND_RESULT_MS;
      case State::GAME_RESULT: return GAME_RESULT_MS;
      case State::RATING_OFFER: return OFFER_TIMEOUT_MS;
      case State::RATING: return RATING_TIMEOUT_MS;
      case State::THANK_YOU: return THANK_YOU_MS;
      default: return 0;
    }
  }
  void go(State s, uint32_t now) {
    state = s;
    enteredAt = now;
    notice = Notice::NONE;
    lastTick_ = -1;
  }
  void setNotice(Notice n, uint32_t now) {
    notice = n;
    noticeAt = now;
  }
  void start(uint32_t now) {
    pickTargets(ROUNDS);
    resultCount = 0;
    round = 0;
    sessionEventId[0] = 0;
    go(State::COUNTDOWN, now);
  }
  void startRating(uint32_t now, const char* sessionId) {
    stars = 0;  // tanpa pilihan awal: hindari bias jangkar & kiriman tak sengaja
    snprintf(ratingSessionId, sizeof ratingSessionId, "%s", sessionId);
    ratingEventId[0] = 0;
    go(State::RATING, now);
  }
  void pickTargets(int count) {
    uint32_t span = (uint32_t)(cfg.targetMaxCm - cfg.targetMinCm + 1);
    for (int n = 0; n < count;) {
      uint8_t t = (uint8_t)(cfg.targetMinCm + (int)rand_(span));
      bool dup = false;
      for (int i = 0; i < n; i++) dup |= targets[i] == t;
      if (!dup || n >= (int)span) targets[n++] = t;  // rentang target bisa lebih sempit dari jumlah ronde
    }
  }
  void finishRound(uint32_t now, int measuredTenths, int32_t lockMs) {
    RoundResult& r = results[resultCount++];
    r.round = (uint8_t)(round + 1);
    r.targetCm = targets[round];
    r.measuredTenths = (int16_t)measuredTenths;
    r.score = (uint8_t)roundScore(measuredTenths, targets[round]);
    r.lockMs = lockMs;
    go(State::ROUND_RESULT, now);
  }

  int lastTick_ = -1;
  int recent_[5] = {0};
  int recentCount_ = 0;
  RandFn rand_;
  IdFn newId_;
};

}  // namespace tq
