// Layar OLED TasteQuest (128×64; 128×32 = mode ringkas). Memakai API C U8g2 sehingga bisa dirender di laptop
// tanpa board: npm run oled:preview → data/oled/preview.png
#pragma once
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "clib/u8g2.h"
#include "hmif_logo.h"
#include "logic.h"

namespace tq {

struct ScreenView {
  const Machine* m;
  uint32_t now;
  int dist;  // persepuluhan cm, -1 = tidak ada bacaan
  bool wifi, backend, presence;
  SendStatus game, rating;
};

namespace scr {

// Layar IDLE berganti tiap 5 detik: judul → MADE BY → FROM → logo HMIF, lalu berulang (20 detik).
constexpr uint32_t SCENE_MS = 5000, CYCLE_MS = 4 * SCENE_MS;
static const char* const RESULT_LABEL[] = {"COBA LAGI", "NICE", "PRO", "MASTER"};  // indeks = resultTier(total)
static const char* const LOCK_HINT = "SENTUH=KUNCI, ATAU TUNGGU";  // font 5x7: 125 px

inline int W(u8g2_t* u) { return u8g2_GetDisplayWidth(u); }
inline int H(u8g2_t* u) { return u8g2_GetDisplayHeight(u); }
inline uint32_t hash(uint32_t x) {
  x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16;
  return x;
}
inline int ease(int from, int to, int32_t t, int32_t dur) {  // ease-out kubik
  if (t <= 0) return from;
  if (t >= dur) return to;
  float k = 1.0f - (float)t / dur;
  return from + (int)((to - from) * (1.0f - k * k * k));
}
inline void center(u8g2_t* u, const char* s, int y) {
  if (*s) u8g2_DrawStr(u, (W(u) - (int)u8g2_GetStrWidth(u, s)) / 2, y, s);
}
inline void tenths(char* out, size_t n, int t) {
  if (t < 0) snprintf(out, n, "--");
  else snprintf(out, n, "%d.%d", t / 10, t % 10);
}

inline void netIcon(u8g2_t* u, const ScreenView& v, int x, int y) {  // kotak penuh = server OK, kosong = Wi-Fi saja, silang = Wi-Fi putus
  if (!v.wifi) { u8g2_DrawLine(u, x, y, x + 5, y + 5); u8g2_DrawLine(u, x, y + 5, x + 5, y); }
  else if (v.backend) u8g2_DrawBox(u, x, y, 6, 6);
  else u8g2_DrawFrame(u, x, y, 6, 6);
}

// Header ala HUD game: bar terang 11 px dengan teks gelap.
inline void header(u8g2_t* u, const ScreenView& v, const char* left, const char* right = "") {
  u8g2_SetDrawColor(u, 1);
  u8g2_DrawBox(u, 0, 0, W(u), 11);
  u8g2_SetDrawColor(u, 0);
  u8g2_SetFont(u, u8g2_font_pressstart2p_8f);
  u8g2_DrawStr(u, 1, 9, left);
  netIcon(u, v, W(u) - 8, 2);
  if (*right) u8g2_DrawStr(u, W(u) - 11 - (int)u8g2_GetStrWidth(u, right), 9, right);
  u8g2_SetDrawColor(u, 1);
}
inline void footer(u8g2_t* u, const char* s) {
  u8g2_SetFont(u, u8g2_font_5x7_tf);
  center(u, s, H(u) - 1);
}
inline void stars5(u8g2_t* u, int count, int baseline, uint32_t now) {
  u8g2_SetFont(u, u8g2_font_unifont_t_symbols);
  int x0 = (W(u) - 80) / 2;
  for (int i = 0; i < 5; i++) {
    int bob = (i == count - 1 && (now / 220) % 2) ? -2 : 0;  // bintang terakhir yang dipilih berdenyut
    u8g2_DrawGlyph(u, x0 + i * 16, baseline + bob, i < count ? 0x2605 : 0x2606);
  }
}

// ---------------- Mode attract (IDLE) ----------------
inline void starfield(u8g2_t* u, uint32_t now) {  // 3 lapis kecepatan (parallax)
  const int w = W(u), h = H(u);
  for (uint32_t i = 0; i < 26; i++) {
    uint32_t r = hash(i * 2654435761U + 7);
    int layer = (int)(i % 3), speed = 5 + layer * 11;
    int y = (int)(r % (uint32_t)h);
    int x = w - 1 - (int)(((r >> 8) % (uint32_t)w + now / 1000 * speed + (now % 1000) * speed / 1000) % (uint32_t)w);
    u8g2_DrawPixel(u, x, y);
    if (layer == 2 && x + 1 < w) u8g2_DrawPixel(u, x + 1, y);
  }
}

inline void waveText(u8g2_t* u, const char* s, int x, int baseline, uint32_t t, int phase) {
  char g[2] = {0, 0};
  for (int i = 0; s[i]; i++) {
    g[0] = s[i];
    int dy = (int)lroundf(2.0f * sinf(t / 150.0f + (i + phase) * 0.75f));
    x += u8g2_DrawStr(u, x, baseline + dy, g);
  }
}

inline void prompt(u8g2_t* u, const ScreenView& v, uint32_t st) {
  if (st < 900) return;
  const int y = H(u) - 1;
  u8g2_SetFont(u, u8g2_font_pressstart2p_8f);
  u8g2_SetDrawColor(u, 0);
  u8g2_DrawBox(u, 0, y - 9, W(u), 10);  // jalur bersih di atas bintang
  u8g2_SetDrawColor(u, 1);
  if (v.presence) {  // pengunjung mendekat: ajakan lebih cepat berkedip
    if ((st / 300) % 2 == 0) center(u, "AYO MAIN!", y);
    return;
  }
  if (!v.wifi && (st / 2000) % 2) { center(u, "WIFI PUTUS", y); return; }
  int a = (int)((st / 160) % 3);  // panah bergerak masuk
  u8g2_DrawStr(u, a, y, ">");
  u8g2_DrawStr(u, W(u) - 8 - a, y, "<");
  if ((st / 500) % 2 == 0) center(u, "SENTUH PAD", y);
}

inline void titleScene(u8g2_t* u, const ScreenView& v, uint32_t st) {
  starfield(u, v.now);
  const int w = W(u);
  if (H(u) < 64) {  // ringkas: satu baris
    u8g2_SetFont(u, u8g2_font_pixzillav1_tr);
    waveText(u, "TASTEQUEST", (w - (int)u8g2_GetStrWidth(u, "TASTEQUEST")) / 2, 14, st, 0);
    prompt(u, v, st);
    return;
  }
  u8g2_SetFont(u, u8g2_font_maniac_tr);
  u8g2_SetFontMode(u, 0);  // latar glyph dihapus agar bintang tidak menembus huruf
  int wT = (int)u8g2_GetStrWidth(u, "TASTE"), wQ = (int)u8g2_GetStrWidth(u, "QUEST");
  int xT = ease(-wT, (w - wT) / 2 - 7, (int32_t)st, 650);
  int xQ = ease(w, (w - wQ) / 2 + 7, (int32_t)st - 150, 650);
  waveText(u, "TASTE", xT, 25, st > 800 ? st : 0, 0);
  waveText(u, "QUEST", xQ, 48, st > 800 ? st : 0, 3);
  u8g2_SetFontMode(u, 1);
  uint32_t g = st % 3200;  // kilau miring yang menyapu judul
  if (st > 1200 && g < 450) {
    u8g2_SetDrawColor(u, 2);
    int gx = -20 + (int)(g * (w + 40) / 450);
    for (int k = 0; k < 3; k++) u8g2_DrawLine(u, gx + k, 0, gx + k - 18, 50);
    u8g2_SetDrawColor(u, 1);
  }
  prompt(u, v, st);
}

// Kredit pembuat: satu halaman per layar, masuk dari bawah dan keluar ke atas seperti credits game.
inline void creditScene(u8g2_t* u, const ScreenView& v, int page, uint32_t st) {
  static const char* const HEAD[] = {"MADE BY", "FROM"};
  static const char* const L1[] = {"Muhammad Aziz", "Informatika"};
  static const char* const L2[] = {"Syah Dani", "Universitas Jambi"};
  starfield(u, v.now / 2);  // bintang melambat di latar kredit
  const bool tall = H(u) >= 64;
  const int32_t roll = 450, t = (int32_t)st;
  int dy = t < roll ? ease(H(u), 0, t, roll) : t > (int32_t)SCENE_MS - roll ? ease(0, -H(u), t - ((int32_t)SCENE_MS - roll), roll) : 0;
  u8g2_SetFont(u, tall ? u8g2_font_pressstart2p_8f : u8g2_font_5x7_tf);
  center(u, HEAD[page], (tall ? 13 : 7) + dy);
  if (tall) {
    int hw = (int)u8g2_GetStrWidth(u, HEAD[page]);
    u8g2_DrawHLine(u, (W(u) - hw) / 2, 16 + dy, hw);
  }
  u8g2_SetFont(u, tall ? u8g2_font_pixzillav1_tf : u8g2_font_6x10_tf);
  center(u, L1[page], (tall ? 36 : 19) + dy);
  center(u, L2[page], (tall ? 53 : 30) + dy);
}

inline void logoScene(u8g2_t* u, uint32_t st) {
  const int w = W(u);
  if (H(u) < 64) {  // logo 64 px tidak muat; tampilkan nama
    u8g2_SetFont(u, u8g2_font_pressstart2p_8f);
    center(u, "HMIF UNJA", 20);
    return;
  }
  const int ox = (w - HMIF_LOGO_W) / 2;
  u8g2_DrawXBMP(u, ox, 0, HMIF_LOGO_W, HMIF_LOGO_H, HMIF_LOGO_BITS);
  // Muncul/hilang piksel demi piksel dalam urutan acak tetap (dissolve).
  const int32_t in = 1000, out = 500, t = (int32_t)st;
  int keep = t < in ? (int)(t * 1000 / in) : t > (int32_t)SCENE_MS - out ? (int)(((int32_t)SCENE_MS - t) * 1000 / out) : 1000;
  if (keep < 1000) {
    u8g2_SetDrawColor(u, 0);
    for (int y = 0; y < HMIF_LOGO_H; y++)
      for (int x = 0; x < HMIF_LOGO_W; x++)
        if ((int)(hash((uint32_t)(y * 131 + x)) % 1000) >= keep) u8g2_DrawPixel(u, ox + x, y);
    u8g2_SetDrawColor(u, 1);
    return;
  }
  for (int i = 0; i < 4; i++) {  // kilau kecil di sisi kiri/kanan logo
    uint32_t r = hash(i + st / 400 * 4);
    if ((st / 200 + i) % 3) continue;
    int x = (i % 2) ? ox + HMIF_LOGO_W + 2 + (int)(r % 8) : (int)(r % 10) + 1, y = 6 + (int)((r >> 8) % 50);
    u8g2_DrawPixel(u, x, y);
    u8g2_DrawPixel(u, x - 1, y); u8g2_DrawPixel(u, x + 1, y); u8g2_DrawPixel(u, x, y - 1); u8g2_DrawPixel(u, x, y + 1);
  }
}

inline void attract(u8g2_t* u, const ScreenView& v) {
  // Tetap berputar walau ada pengunjung: justru mereka yang perlu melihat kredit dan logo. Ajakan "AYO MAIN!" ada di layar judul.
  uint32_t c = (v.now - v.m->enteredAt) % CYCLE_MS, st = c % SCENE_MS;
  switch (c / SCENE_MS) {
    case 0: titleScene(u, v, st); break;
    case 1: creditScene(u, v, 0, st); break;
    case 2: creditScene(u, v, 1, st); break;
    default: logoScene(u, st);
  }
}

}  // namespace scr

// ---------------- Semua layar ----------------
inline void drawScreen(u8g2_t* u, const ScreenView& v) {
  using namespace scr;
  const Machine& m = *v.m;
  const int w = W(u);
  const bool full = H(u) >= 64;
  const int32_t rem = m.remainingMs(v.now);
  const int secs = rem < 0 ? 0 : (int)((rem + 999) / 1000);
  const RoundResult* last = m.resultCount ? &m.results[m.resultCount - 1] : nullptr;
  char a[48], b[16];
  u8g2_ClearBuffer(u);
  u8g2_SetFontMode(u, 1);
  u8g2_SetDrawColor(u, 1);

  if (m.state == State::IDLE) { attract(u, v); return; }

  // Mode ringkas 128×32: header + satu baris utama.
  if (!full) {
    const char* title = stateName(m.state);
    a[0] = 0;
    switch (m.state) {
      case State::MENU:
        snprintf(a, sizeof a, "%s", MENU_ITEMS[m.menuIndex]);
        title = "MENU";
        break;
      case State::COUNTDOWN: snprintf(a, sizeof a, "%d  T:%dcm", secs, m.targetCm()); title = "SIAP"; break;
      case State::ROUND_ACTIVE: snprintf(a, sizeof a, "T:%dcm %ds", m.targetCm(), secs); title = "KUNCI!"; break;
      case State::ROUND_RESULT: snprintf(a, sizeof a, "+%d", last ? last->score : 0); title = "HASIL"; break;
      case State::GAME_RESULT: snprintf(a, sizeof a, "%d / %d", m.total(), ROUNDS * 100); title = m.practice ? "SKOR" : RESULT_LABEL[resultTier(m.total())]; break;
      case State::RATING: snprintf(a, sizeof a, "%d bintang", m.stars); title = "RATING"; break;
      case State::THANK_YOU: snprintf(a, sizeof a, "Terima kasih!"); title = "OK"; break;
      default: snprintf(a, sizeof a, "Tahan = ya"); title = "LANJUT?"; break;
    }
    header(u, v, title);
    u8g2_SetFont(u, u8g2_font_7x14B_tf);
    center(u, a, 28);
    return;
  }

  switch (m.state) {
    case State::MENU:
      header(u, v, "MENU");
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      for (int i = 0; i < 3; i++) {
        int y = 23 + i * 12;
        bool sel = i == m.menuIndex;
        if (sel) { u8g2_DrawBox(u, 0, y - 9, w, 11); u8g2_SetDrawColor(u, 0); }
        if (sel) u8g2_DrawStr(u, 2 + (int)((v.now / 250) % 2), y, ">");
        u8g2_DrawStr(u, 13, y, MENU_ITEMS[i]);
        u8g2_SetDrawColor(u, 1);
      }
      footer(u, "SENTUH:PILIH  TAHAN:OK");
      break;

    case State::READY:
      header(u, v, m.practice ? "LATIHAN" : "PROXIRUSH");
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      snprintf(a, sizeof a, "%d ronde. Atur jarak,", ROUNDS);
      center(u, a, 23);
      u8g2_SetFont(u, u8g2_font_5x7_tf);
      center(u, LOCK_HINT, 34);
      if ((v.now / 400) % 2 == 0) { u8g2_DrawBox(u, 4, 39, w - 8, 12); u8g2_SetDrawColor(u, 0); }
      else u8g2_DrawFrame(u, 4, 39, w - 8, 12);
      u8g2_SetFont(u, u8g2_font_pressstart2p_8f);
      center(u, "TAHAN=MULAI", 49);
      u8g2_SetDrawColor(u, 1);
      footer(u, "sentuh = kembali");
      break;

    case State::COUNTDOWN: {
      snprintf(a, sizeof a, "RONDE %d/%d", m.displayRound(), ROUNDS);
      header(u, v, a);
      snprintf(b, sizeof b, "TARGET %d cm", m.targetCm());
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      center(u, b, 22);
      snprintf(a, sizeof a, "%d", secs);
      u8g2_SetFont(u, u8g2_font_logisoso38_tn);
      center(u, a, 63);
      int ph = rem < 0 ? 999 : (int)(rem % 1000);  // gelombang kejut tiap detik
      if (ph > 700) { int s = 24 + (1000 - ph) / 20; u8g2_DrawFrame(u, (w - s) / 2, 44 - s / 2, s, s); }
      break;
    }

    case State::ROUND_ACTIVE: {
      snprintf(a, sizeof a, "RONDE %d/%d", m.displayRound(), ROUNDS);
      snprintf(b, sizeof b, "%ds", secs);
      header(u, v, a, b);
      u8g2_SetFont(u, u8g2_font_5x7_tf);
      center(u, "TARGET", 19);
      snprintf(a, sizeof a, "%dcm", m.targetCm());
      u8g2_SetFont(u, u8g2_font_logisoso24_tf);
      center(u, a, 45);
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      if (m.notice == Notice::NO_READING) {
        if ((v.now / 250) % 2 == 0) center(u, "Sensor tak terbaca!", 55);
      } else if (m.practice) {
        tenths(b, sizeof b, v.dist);
        snprintf(a, sizeof a, "jarak %s cm", b);
        center(u, a, 55);
      } else {
        u8g2_SetFont(u, u8g2_font_5x7_tf);
        center(u, LOCK_HINT, 55);
      }
      u8g2_DrawFrame(u, 0, 58, w, 6);
      if (rem > 0) u8g2_DrawBox(u, 1, 59, (int)((int64_t)(w - 2) * rem / (int32_t)m.cfg.roundMs), 4);
      break;
    }

    case State::ROUND_RESULT:
      snprintf(a, sizeof a, "HASIL R%d", last ? last->round : 0);
      header(u, v, a);
      snprintf(a, sizeof a, "+%d", last ? last->score : 0);
      u8g2_SetFont(u, u8g2_font_logisoso28_tn);
      center(u, a, 42);
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      if (!last || last->measuredTenths < 0) center(u, "WAKTU HABIS", 56);
      else {
        tenths(b, sizeof b, last->measuredTenths);
        snprintf(a, sizeof a, "%s cm (target %d)", b, last->targetCm);
        center(u, a, 52);
        tenths(b, sizeof b, abs(last->measuredTenths - last->targetCm * 10));
        snprintf(a, sizeof a, "selisih %s cm", b);
        center(u, a, 63);
      }
      break;

    case State::GAME_RESULT:
      header(u, v, m.practice ? "LATIHAN" : "SKOR", m.practice ? "" : RESULT_LABEL[resultTier(m.total())]);
      snprintf(a, sizeof a, "%d", m.total());
      snprintf(b, sizeof b, "/%d", ROUNDS * 100);
      u8g2_SetFont(u, u8g2_font_logisoso28_tn);
      {
        int tw = (int)u8g2_GetStrWidth(u, a);
        u8g2_SetFont(u, u8g2_font_6x10_tf);
        int x = (w - tw - (int)u8g2_GetStrWidth(u, b)) / 2;
        u8g2_DrawStr(u, x + tw + 1, 43, b);
        u8g2_SetFont(u, u8g2_font_logisoso28_tn);
        u8g2_DrawStr(u, x, 43, a);
      }
      a[0] = 0;  // 3 skor ronde pertama saja agar tidak berdesakan, mis. "80 + 90 + 100 .."
      for (int i = 0, n = 0; i < m.resultCount && i < 3; i++) n += snprintf(a + n, sizeof a - n, i ? " + %d" : "%d", m.results[i].score);
      if (m.resultCount > 3) strcat(a, " ..");
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      center(u, a, 54);
      footer(u, m.practice ? "latihan tidak disimpan" : v.game == SendStatus::ACKED ? "tersimpan di server" : v.game == SendStatus::REJECTED ? "DITOLAK SERVER" : "menyimpan...");
      break;

    case State::RATING_OFFER:
      header(u, v, "RATING?");
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      center(u, "Nilai karya kami?", 23);
      u8g2_DrawBox(u, 4, 28, w - 8, 12);
      u8g2_SetDrawColor(u, 0);
      center(u, "TAHAN = YA", 38);
      u8g2_SetDrawColor(u, 1);
      u8g2_DrawFrame(u, 4, 43, w - 8, 12);
      center(u, "SENTUH = LEWATI", 53);
      footer(u, "opsional dan anonim");
      break;

    case State::RATING:
      header(u, v, "NILAI KARYA");
      stars5(u, m.stars, 36, v.now);
      u8g2_SetFont(u, u8g2_font_6x10_tf);
      if (m.stars) { snprintf(a, sizeof a, "%d bintang", m.stars); center(u, a, 50); }
      else center(u, "sentuh untuk memilih", 50);
      footer(u, m.notice == Notice::PICK_STAR ? "PILIH BINTANG DULU!" : "SENTUH:GANTI TAHAN:KIRIM");
      break;

    case State::THANK_YOU:
      header(u, v, "TERIMA KASIH");
      if (m.rated) {
        stars5(u, m.stars, 34, 0);
        u8g2_SetFont(u, u8g2_font_6x10_tf);
        center(u, v.rating == SendStatus::ACKED ? "Diterima server" : v.rating == SendStatus::REJECTED ? "Ditolak server" : v.backend ? "Mengirim..." : "Antre, tunggu Wi-Fi", 48);
      } else {
        u8g2_SetFont(u, u8g2_font_pixzillav1_tf);
        center(u, "Sampai jumpa!", 38);
      }
      footer(u, "FST MARKET DAY 2026");
      break;

    default:
      break;
  }
}

}  // namespace tq
