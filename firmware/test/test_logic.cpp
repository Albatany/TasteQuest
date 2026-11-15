// Test host untuk firmware/include/logic.h (tanpa board): npm run test:fw
// Kasus skor dibaca dari shared/test/scoring_cases.txt — file yang sama dengan test TypeScript.
#include <cstdio>
#include <cstring>
#include <string>
#include "logic.h"

using namespace tq;

static int failures = 0, checks = 0;
#define CHECK(cond, ...)                                  \
  do {                                                    \
    checks++;                                             \
    if (!(cond)) {                                        \
      failures++;                                         \
      printf("FAIL %s:%d: %s — ", __FILE__, __LINE__, #cond); \
      printf(__VA_ARGS__);                                \
      printf("\n");                                       \
    }                                                     \
  } while (0)

static void testScoring() {
  FILE* f = fopen("shared/test/scoring_cases.txt", "r");
  CHECK(f != nullptr, "scoring_cases.txt tidak ditemukan (jalankan dari root proyek)");
  if (!f) return;
  char line[128];
  int n = 0;
  while (fgets(line, sizeof line, f)) {
    if (line[0] == '#' || line[0] == '\n') continue;
    int target, want;
    char measured[16];
    if (sscanf(line, "%d %15s %d", &target, measured, &want) != 3) continue;
    int tenths = strcmp(measured, "-") == 0 ? -1 : quantizeTenths((float)atof(measured));
    int got = roundScore(tenths, target);
    CHECK(got == want, "target %d terukur %s: dapat %d, harus %d", target, measured, got, want);
    n++;
  }
  fclose(f);
  CHECK(n >= 10, "kasus terlalu sedikit (%d)", n);
  CHECK(quantizeTenths(20.34f) == 203 && quantizeTenths(20.35f) == 204, "kuantisasi 0,1 cm");
}

static std::string feed(const std::initializer_list<std::pair<uint32_t, bool>>& steps, uint32_t every = 10, uint32_t extra = 200) {
  TouchClassifier c;
  std::string out;
  auto it = steps.begin();
  bool level = false;
  uint32_t end = (steps.end() - 1)->first + extra;
  for (uint32_t t = 0; t <= end; t += every) {
    while (it != steps.end() && it->first <= t) {
      level = it->second;
      Touch e = c.sample(it->first, level);
      if (e != Touch::NONE) out += e == Touch::SHORT ? "S" : "L";
      ++it;
    }
    Touch e = c.sample(t, level);
    if (e != Touch::NONE) out += e == Touch::SHORT ? "S" : "L";
  }
  return out;
}

static void testTouch() {
  CHECK(feed({{0, true}, {100, false}}) == "S", "tap singkat");
  CHECK(feed({{0, true}, {2000, false}}) == "L", "tahan lama: LONG sekali tanpa SHORT");
  CHECK(feed({{0, true}, {1199, false}}, 1, 400) == "S", "1199 ms tetap SHORT");
  CHECK(feed({{0, true}, {10, false}}) == "", "glitch diabaikan");
  CHECK(feed({{0, true}, {100, false}, {110, true}, {115, false}}) == "S", "pantulan saat lepas");
  TouchClassifier a;
  CHECK(a.sample(100, true) == Touch::NONE && a.sample(200, false) == Touch::NONE && a.sample(260, false) == Touch::SHORT, "replay ISR pendek");
  TouchClassifier b;
  CHECK(b.sample(100, true) == Touch::NONE && b.sample(1500, false) == Touch::LONG && b.sample(1600, false) == Touch::NONE, "replay ISR panjang");
}

static void testMedian() {
  MedianFilter m;
  CHECK(m.read(0, 400) == -1 && m.error(0, 400) == SonarError::STALE, "kosong = STALE");
  m.push(0, 200, SonarError::NONE);
  m.push(60, 210, SonarError::NONE);
  CHECK(m.read(60, 400) == -1, "< 3 sampel valid ditolak");
  m.push(120, 900, SonarError::NONE);  // outlier
  m.push(180, 205, SonarError::NONE);
  CHECK(m.read(180, 400) == 208, "median menolak outlier: %d", m.read(180, 400));  // (205+210)/2
  m.push(240, 0, SonarError::TIMEOUT);
  CHECK(m.read(240, 400) == 208, "1 timeout tidak menghapus median valid");
  m.push(300, 207, SonarError::NONE);
  CHECK(m.read(300, 400) == 209, "buffer 5 sampel: 200 tergeser → median [205,207,210,900] (%d)", m.read(300, 400));
  m.push(360, 206, SonarError::NONE);
  CHECK(m.read(360, 400) == 207, "jumlah ganjil [205,206,207,210,900]: nilai tengah (%d)", m.read(360, 400));
  CHECK(m.read(1000, 400) == -1 && m.error(1000, 400) == SonarError::STALE, "sampel usang ditolak");
  MedianFilter e;
  for (uint32_t t = 0; t < 300; t += 60) e.push(t, 0, SonarError::TIMEOUT);
  CHECK(e.read(300, 400) == -1 && e.error(300, 400) == SonarError::TIMEOUT, "semua timeout → TIMEOUT");
}

static uint32_t randSeq = 0;
static const uint8_t TARGETS[] = {18, 25, 12};
static uint32_t testRand(uint32_t) { return TARGETS[randSeq++ % 3] - 10; }
static int idSeq = 0;
static void testId(char* out, size_t n) { snprintf(out, n, "TQ-TEST-0000-%d", ++idSeq); }

struct Sim {
  Machine m{testRand, testId};
  uint32_t now = 1000;
  bool game = false, rating = false;
  void press(Touch t, int tenths = -1) { Out o = m.input(now, t, tenths); game |= o.game; rating |= o.rating; }
  void wait(uint32_t ms) {
    uint32_t end = now + ms;
    while (now < end) {
      now = now + 50 > end ? end : now + 50;
      Out o = m.tick(now);
      game |= o.game;
      rating |= o.rating;
    }
  }
};

static void testMachine() {
  {
    randSeq = 0;
    Sim s;
    s.press(Touch::SHORT);
    CHECK(s.m.state == State::MENU, "IDLE → MENU");
    s.press(Touch::LONG);
    CHECK(s.m.state == State::READY, "MENU → READY");
    s.press(Touch::LONG);
    CHECK(s.m.state == State::COUNTDOWN, "READY → COUNTDOWN");
    s.press(Touch::SHORT, 180);
    CHECK(s.m.state == State::COUNTDOWN, "input diabaikan saat countdown");
    s.wait(3000);
    CHECK(s.m.state == State::ROUND_ACTIVE && s.m.targetCm() == 18, "ronde 1 target 18");
    s.press(Touch::SHORT, -1);
    CHECK(s.m.state == State::ROUND_ACTIVE && s.m.notice == Notice::NO_READING, "sensor invalid: tetap di ronde, tanpa jarak palsu");
    s.wait(1500);
    s.press(Touch::SHORT, 180);
    CHECK(s.m.results[0].score == 100 && s.m.results[0].lockMs == 1500, "ronde 1 sempurna");
    s.wait(ROUND_RESULT_MS + 3000);
    s.press(Touch::SHORT, 263);
    CHECK(s.m.results[1].score == 87, "ronde 2: %d", s.m.results[1].score);
    s.wait(ROUND_RESULT_MS + 3000 + 10000);
    CHECK(s.m.results[2].measuredTenths == -1 && s.m.results[2].score == 0 && s.m.results[2].lockMs == -1, "ronde 3 timeout");
    s.wait(ROUND_RESULT_MS);
    CHECK(s.m.state == State::GAME_RESULT && s.game && s.m.total() == 187, "game selesai total %d", s.m.total());
    s.press(Touch::SHORT);
    s.press(Touch::LONG);
    CHECK(s.m.state == State::RATING && s.m.stars == 0, "rating mulai tanpa pilihan");
    s.press(Touch::LONG);
    CHECK(s.m.state == State::RATING && s.m.notice == Notice::PICK_STAR && !s.rating, "LONG tanpa bintang ditolak");
    for (int i = 0; i < 6; i++) s.press(Touch::SHORT);
    CHECK(s.m.stars == 1, "bintang berputar 1→5→1");
    s.press(Touch::SHORT);
    s.press(Touch::SHORT);
    s.press(Touch::SHORT);
    s.press(Touch::LONG);
    CHECK(s.rating && s.m.stars == 4 && strcmp(s.m.ratingSessionId, s.m.sessionEventId) == 0, "rating 4 tertaut sesi");
    s.wait(THANK_YOU_MS);
    CHECK(s.m.state == State::IDLE, "kembali IDLE");
  }
  {
    Sim s;  // latihan: tanpa event game
    s.press(Touch::SHORT);
    s.press(Touch::SHORT);
    s.press(Touch::LONG);
    CHECK(s.m.practice, "mode latihan");
    s.press(Touch::LONG);
    s.wait(3000);
    for (int i = 0; i < 3; i++) { s.press(Touch::SHORT, 200); s.wait(ROUND_RESULT_MS + 3000); }
    CHECK(s.m.state == State::GAME_RESULT && !s.game, "latihan tidak mengirim game");
  }
  {
    Sim s;  // rating langsung + skip/timeout
    s.press(Touch::SHORT);
    s.press(Touch::SHORT);
    s.press(Touch::SHORT);
    s.press(Touch::LONG);
    CHECK(s.m.state == State::RATING && s.m.ratingSessionId[0] == 0, "rating langsung dari menu");
    s.press(Touch::SHORT);
    s.wait(RATING_TIMEOUT_MS);
    CHECK(s.m.state == State::IDLE && !s.rating, "timeout rating tanpa data");
    s.press(Touch::SHORT);
    s.wait(MENU_TIMEOUT_MS);
    CHECK(s.m.state == State::IDLE, "menu timeout");
  }
}

int main() {
  testScoring();
  testTouch();
  testMedian();
  testMachine();
  printf("%s: %d/%d cek lulus\n", failures ? "GAGAL" : "OK", checks - failures, checks);
  return failures ? 1 : 0;
}
