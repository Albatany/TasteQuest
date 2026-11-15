// Merender layar OLED (screens.h) ke buffer untuk pratinjau: npm run oled:preview
#include <cstdio>

#include "screens.h"

using namespace tq;

static uint32_t rnd(uint32_t n) { return 7 % n; }
static void noId(char* out, size_t n) { snprintf(out, n, "TQ-ESP01-a1b2c3d4-1"); }

static void dump(u8g2_t* u, const char* label) {
  uint8_t* b = u8g2_GetBufferPtr(u);
  int w = u8g2_GetDisplayWidth(u), h = u8g2_GetDisplayHeight(u);
  printf("%s\t%d\t%d\t", label, w, h);
  for (int i = 0; i < w * h / 8; i++) printf("%02x", b[i]);
  printf("\n");
}

int main() {
  u8g2_t u, small;
  u8g2_Setup_ssd1306_128x64_noname_f(&u, U8G2_R0, u8x8_byte_empty, u8x8_dummy_cb);
  u8g2_Setup_ssd1306_128x32_univision_f(&small, U8G2_R0, u8x8_byte_empty, u8x8_dummy_cb);
  Machine m(rnd, noId);
  ScreenView v{&m, 0, -1, true, true, false, SendStatus::NONE, SendStatus::NONE};
  auto shot = [&](const char* label, uint32_t sinceEnter, u8g2_t* d = nullptr) {
    v.now = m.enteredAt + sinceEnter;
    drawScreen(d ? d : &u, v);
    dump(d ? d : &u, label);
  };

  m.state = State::IDLE;
  m.enteredAt = 100000;
  shot("IDLE 0-5 dtk: judul masuk", 300);
  shot("IDLE 0-5 dtk: judul + kilau", 3300);
  shot("IDLE 0-5 dtk: judul + ajakan", 4100);
  shot("IDLE 5-10 dtk: MADE BY masuk", 5250);
  shot("IDLE 5-10 dtk: MADE BY", 7000);
  shot("IDLE 10-15 dtk: FROM", 12000);
  shot("IDLE 15-20 dtk: logo dissolve", 15500);
  shot("IDLE 15-20 dtk: logo HMIF", 17500);
  v.presence = true;
  shot("IDLE judul, pengunjung dekat", 2000);
  shot("IDLE kredit, pengunjung dekat", 7000);
  v.presence = false;
  v.wifi = false;
  shot("IDLE Wi-Fi putus", 4100);
  v.wifi = true;

  m.state = State::MENU; m.menuIndex = 0;
  shot("MENU", 0);
  m.state = State::READY; m.practice = false;
  shot("READY", 0);
  m.state = State::COUNTDOWN; m.targets[0] = 18; m.targets[1] = 25; m.targets[2] = 12; m.round = 0;
  shot("COUNTDOWN 3", 150);
  m.state = State::ROUND_ACTIVE;
  shot("RONDE aktif (kompetisi)", 3500);
  m.practice = true; v.dist = 176;
  shot("RONDE aktif (latihan)", 3500);
  m.practice = false; m.notice = Notice::NO_READING;
  shot("RONDE: sensor tak terbaca", 3000);
  m.notice = Notice::NONE;
  m.results[0] = {1, 18, 96, 184, 2300};
  m.resultCount = 1;
  m.state = State::ROUND_RESULT;
  shot("HASIL ronde", 500);
  m.results[1] = {2, 25, 87, 263, 4100};
  m.results[2] = {3, 12, 0, -1, -1};
  m.resultCount = 3; m.round = 2;
  m.state = State::GAME_RESULT;
  v.game = SendStatus::ACKED;
  shot("SKOR AKHIR (tersimpan)", 500);
  m.state = State::RATING_OFFER;
  shot("TAWARAN RATING", 0);
  m.state = State::RATING; m.stars = 4;
  shot("RATING 4 bintang", 0);
  m.stars = 0; m.notice = Notice::PICK_STAR;
  shot("RATING belum pilih", 0);
  m.notice = Notice::NONE; m.state = State::THANK_YOU; m.rated = true; m.stars = 4;
  v.rating = SendStatus::ACKED;
  shot("TERIMA KASIH (diterima)", 0);
  v.rating = SendStatus::PENDING; v.backend = false;
  shot("TERIMA KASIH (tunggu Wi-Fi)", 0);
  v.backend = true;

  m.state = State::IDLE;
  shot("128x32: judul", 2000, &small);
  shot("128x32: MADE BY", 7000, &small);
  shot("128x32: FROM", 12000, &small);
  m.state = State::ROUND_ACTIVE; m.round = 0;
  shot("128x32: ronde", 3000, &small);
  return 0;
}
