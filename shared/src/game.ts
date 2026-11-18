// Logika inti TasteQuest: scoring, klasifikasi sentuhan TTP223, dan finite state machine.
// Dipakai server (validasi), simulator browser (Demo Mode), dan unit test.
// firmware/include/logic.h adalah cerminan C++ file ini — ubah keduanya bersamaan.

export const SCHEMA_VERSION = 1;
export const ROUNDS = 5;
export const SIM_PREFIX = 'SIM-';

export const STATES = [
  'IDLE', 'MENU', 'READY', 'COUNTDOWN', 'ROUND_ACTIVE', 'ROUND_RESULT',
  'GAME_RESULT', 'RATING_OFFER', 'RATING', 'THANK_YOU', 'RP_PRACTICE',
] as const;
/** State yang dilaporkan ke server. RP_PRACTICE hanya dikirim firmware 3.1.0 (latihan sebelum main); tetap diterima. */
export type DeviceState = (typeof STATES)[number];
/** State internal mesin. */
export type MachineState = Exclude<DeviceState, 'RP_PRACTICE'>;

export const MENU_ITEMS = ['Main ProxiRush', 'Latihan', 'Beri Rating'] as const;

export const TIMING = {
  debounceMs: 30,
  longPressMs: 1200,
  noticeMs: 1500,
  menuTimeoutMs: 20000,
  roundResultMs: 2500,
  gameResultMs: 8000,
  offerTimeoutMs: 10000,
  ratingTimeoutMs: 20000,
  thankYouMs: 4000,
};

export interface GameConfig {
  targetMinCm: number;
  targetMaxCm: number;
  countdownMs: number;
  roundMs: number;
}
export const DEFAULT_CONFIG: GameConfig = { targetMinCm: 10, targetMaxCm: 30, countdownMs: 3000, roundMs: 10000 };

export interface RoundResult {
  round: number;
  targetCm: number;
  measuredCm: number | null; // null = waktu habis tanpa lock valid
  score: number;
  lockMs: number | null;
}

/** Resolusi 0,1 cm: cukup untuk HC-SR04 (~0,3 cm) dan membuat skor identik di C++ dan TS. */
export const quantizeCm = (cm: number) => Math.round(cm * 10) / 10;

/**
 * Skor dalam persepuluhan cm (bilangan bulat, identik dengan firmware). Zona 100: target s.d. target + 0,9 cm
 * (toleransi sensor di luar ruangan). Selain itu clamp(100 - |a10 - t10|, 0, 100). Tanpa bacaan = 0.
 */
export function roundScore(measuredCm: number | null, targetCm: number): number {
  if (measuredCm === null || !Number.isFinite(measuredCm)) return 0;
  const a10 = Math.round(measuredCm * 10), t10 = targetCm * 10;
  if (a10 >= t10 && a10 <= t10 + 9) return 100;
  return Math.min(100, Math.max(0, 100 - Math.abs(a10 - t10)));
}

/** Tingkat hasil akhir (skala 500): 3 MASTER, 2 PRO, 1 NICE, 0 COBA LAGI. Dipakai label OLED dan melodi akhir. */
export const resultTier = (total: number) => (total >= 450 ? 3 : total >= 330 ? 2 : total >= 170 ? 1 : 0);

/** Median bilangan bulat (jumlah genap: rata-rata dua nilai tengah, dibulatkan), sama dengan firmware. */
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return Math.floor((s[(s.length - 1) >> 1] + s[s.length >> 1] + 1) / 2);
};

/** `count` target bulat dalam [min, max], berbeda selama rentangnya cukup. rand(n) mengembalikan bilangan bulat [0, n). */
export function pickTargets(cfg: GameConfig, rand: (n: number) => number, count = ROUNDS): number[] {
  const span = cfg.targetMaxCm - cfg.targetMinCm + 1;
  const out: number[] = [];
  while (out.length < count) {
    const t = cfg.targetMinCm + rand(span);
    if (!out.includes(t) || out.length >= span) out.push(t); // rentang target bisa lebih sempit dari jumlah ronde
  }
  return out;
}

export type Touch = 'SHORT' | 'LONG';

/**
 * Debounce berbasis stabilitas + release gating.
 * SHORT dikirim saat dilepas (< longPressMs); LONG dikirim sekali saat ambang tercapai,
 * lalu sentuhan itu "dikunci" sampai dilepas — satu sentuhan tidak pernah menghasilkan keduanya.
 * sample() boleh dipanggil ulang dengan timestamp edge lama (replay dari ISR) tanpa salah hitung.
 */
export class TouchClassifier {
  private stable = false;
  private cand = false;
  private candSince = 0;
  private pressedAt = 0;
  private gated = false;

  sample(t: number, raw: boolean): Touch | null {
    // Nilai kandidat lama berlaku sampai t, jadi evaluasi dulu sebelum diganti.
    let ev = this.settle(t);
    if (!ev && this.stable && this.cand && !this.gated && t - this.pressedAt >= TIMING.longPressMs) {
      this.gated = true;
      ev = 'LONG';
    }
    if (raw !== this.cand) {
      this.cand = raw;
      this.candSince = t;
    }
    return ev;
  }

  get pressed() { return this.stable; }
  heldMs(t: number) { return this.stable ? t - this.pressedAt : 0; }

  private settle(t: number): Touch | null {
    if (this.cand === this.stable || t - this.candSince < TIMING.debounceMs) return null;
    this.stable = this.cand;
    if (this.stable) {
      this.pressedAt = this.candSince;
      this.gated = false;
      return null;
    }
    return this.gated ? null : 'SHORT';
  }
}

export type Beep = 'nav' | 'confirm' | 'tick' | 'go' | 'lock' | 'timeout' | 'finish' | 'error' | 'finishMid' | 'finishLow';
/** Melodi akhir sesuai skor: tinggi (PRO/MASTER) senang, sedang (NICE) biasa, rendah sedih. */
const FINISH_BEEPS: Beep[] = ['finishLow', 'finishMid', 'finish', 'finish'];
export type Notice = 'NO_READING' | 'PICK_STAR' | null;
export type Action =
  | { type: 'beep'; beep: Beep }
  | { type: 'game'; eventId: string; rounds: RoundResult[]; totalScore: number; roundMs: number }
  | { type: 'rating'; eventId: string; stars: number; sessionEventId: string | null };

export interface Snapshot {
  state: MachineState;
  menuIndex: number;
  practice: boolean;
  round: number; // 1..ROUNDS saat permainan, 0 di luar permainan
  targetCm: number | null;
  remainingMs: number | null;
  results: RoundResult[];
  totalScore: number | null;
  stars: number;
  notice: Notice;
  rated: boolean;
  sessionEventId: string | null;
  ratingEventId: string | null;
}

const beep = (b: Beep): Action => ({ type: 'beep', beep: b });

export class Machine {
  state: MachineState = 'IDLE';
  enteredAt = 0;
  menuIndex = 0;
  practice = false;
  recent: number[] = []; // <= 5 bacaan valid terakhir ronde ini (persepuluhan cm) untuk kunci otomatis
  round = 0; // indeks ronde aktif (0-based)
  targets: number[] = [];
  results: RoundResult[] = [];
  stars = 0;
  rated = false;
  sessionEventId: string | null = null;
  ratingSessionId: string | null = null;
  ratingEventId: string | null = null;
  notice: Notice = null;
  noticeAt = 0;
  cfg: GameConfig;
  private lastTick = -1;
  private rand: (n: number) => number;
  private newId: () => string;

  constructor(cfg: GameConfig, rand: (n: number) => number, newId: () => string) {
    this.cfg = cfg;
    this.rand = rand;
    this.newId = newId;
  }

  input(now: number, touch: Touch, distanceCm: number | null): Action[] {
    const a: Action[] = [];
    switch (this.state) {
      case 'IDLE':
        this.menuIndex = 0;
        this.go('MENU', now);
        a.push(beep('nav'));
        break;
      case 'MENU':
        if (touch === 'SHORT') {
          this.menuIndex = (this.menuIndex + 1) % MENU_ITEMS.length;
          this.enteredAt = now;
          a.push(beep('nav'));
        } else if (this.menuIndex === 2) {
          this.startRating(now, null);
          a.push(beep('confirm'));
        } else {
          this.practice = this.menuIndex === 1; // 0 = Main ProxiRush (langsung dinilai), 1 = Latihan
          this.go('READY', now);
          a.push(beep('confirm'));
        }
        break;
      case 'READY':
        if (touch === 'SHORT') {
          this.go('MENU', now);
          a.push(beep('nav'));
        } else {
          this.start(now);
          a.push(beep('confirm'));
        }
        break;
      case 'ROUND_ACTIVE':
        if (now - this.enteredAt >= this.cfg.roundMs) break; // terlambat: tick() yang menutup ronde
        if (distanceCm === null) {
          this.setNotice('NO_READING', now); // jangan pernah mengganti error sensor dengan jarak palsu
          a.push(beep('error'));
        } else {
          this.finishRound(now, quantizeCm(distanceCm), now - this.enteredAt);
          a.push(beep('lock'));
        }
        break;
      case 'GAME_RESULT':
        this.go('RATING_OFFER', now);
        a.push(beep('nav'));
        break;
      case 'RATING_OFFER':
        if (touch === 'LONG') {
          this.startRating(now, this.sessionEventId);
          a.push(beep('confirm'));
        } else {
          this.rated = false;
          this.go('THANK_YOU', now);
          a.push(beep('nav'));
        }
        break;
      case 'RATING':
        if (touch === 'SHORT') {
          this.stars = (this.stars % 5) + 1;
          this.enteredAt = now;
          a.push(beep('nav'));
        } else if (this.stars === 0) {
          this.setNotice('PICK_STAR', now);
          this.enteredAt = now;
          a.push(beep('error'));
        } else {
          this.ratingEventId = this.newId();
          a.push({ type: 'rating', eventId: this.ratingEventId, stars: this.stars, sessionEventId: this.ratingSessionId });
          this.rated = true;
          this.go('THANK_YOU', now);
          a.push(beep('confirm'));
        }
        break;
      default:
        // COUNTDOWN, ROUND_RESULT, THANK_YOU: input diabaikan agar sentuhan tidak bocor ke layar berikutnya.
        break;
    }
    return a;
  }

  tick(now: number): Action[] {
    const a: Action[] = [];
    if (this.notice && now - this.noticeAt >= TIMING.noticeMs) this.notice = null;
    const t = now - this.enteredAt;
    const lim = this.limit();
    if (this.state === 'COUNTDOWN' && t < lim) {
      const s = Math.floor(t / 1000);
      if (s !== this.lastTick) {
        this.lastTick = s;
        a.push(beep('tick'));
      }
    }
    if (!lim || t < lim) return a;
    switch (this.state) {
      case 'COUNTDOWN':
        this.go('ROUND_ACTIVE', now);
        this.recent = [];
        a.push(beep('go'));
        break;
      case 'ROUND_ACTIVE': {
        // Waktu habis: kunci otomatis dengan median bacaan valid terakhir. Nol hanya bila sepanjang ronde tak ada bacaan.
        const m = this.recent.length ? median(this.recent) : null;
        this.finishRound(now, m === null ? null : m / 10, m === null ? null : this.cfg.roundMs);
        a.push(beep('timeout'));
        break;
      }
      case 'ROUND_RESULT':
        if (this.round < ROUNDS - 1) {
          this.round++;
          this.go('COUNTDOWN', now);
        } else {
          const totalScore = this.total();
          if (!this.practice) {
            this.sessionEventId = this.newId();
            a.push({ type: 'game', eventId: this.sessionEventId, rounds: this.results.map((r) => ({ ...r })), totalScore, roundMs: this.cfg.roundMs });
          }
          this.go('GAME_RESULT', now);
          a.push(beep(FINISH_BEEPS[resultTier(totalScore)]));
        }
        break;
      case 'GAME_RESULT':
        this.go('RATING_OFFER', now);
        break;
      default: // MENU, READY, RATING_OFFER, RATING, THANK_YOU: timeout tanpa membuat data
        this.go('IDLE', now);
    }
    return a;
  }

  /** Bacaan jarak valid (cm) per ping sensor; hanya disimpan saat ronde berjalan. */
  reading(cm: number) {
    if (this.state !== 'ROUND_ACTIVE') return;
    this.recent.push(Math.round(cm * 10));
    if (this.recent.length > 5) this.recent.shift();
  }

  snapshot(now: number): Snapshot {
    const inGame = ['COUNTDOWN', 'ROUND_ACTIVE', 'ROUND_RESULT', 'GAME_RESULT'].includes(this.state);
    const lim = this.limit();
    return {
      state: this.state,
      menuIndex: this.menuIndex,
      practice: this.practice,
      round: inGame ? this.round + 1 : 0,
      targetCm: inGame ? (this.targets[this.round] ?? null) : null,
      remainingMs: lim ? Math.max(0, lim - (now - this.enteredAt)) : null,
      results: this.results.map((r) => ({ ...r })),
      totalScore: this.results.length === ROUNDS ? this.total() : null,
      stars: this.stars,
      notice: this.notice,
      rated: this.rated,
      sessionEventId: this.sessionEventId,
      ratingEventId: this.ratingEventId,
    };
  }

  private limit(): number {
    switch (this.state) {
      case 'MENU': case 'READY': return TIMING.menuTimeoutMs;
      case 'COUNTDOWN': return this.cfg.countdownMs;
      case 'ROUND_ACTIVE': return this.cfg.roundMs;
      case 'ROUND_RESULT': return TIMING.roundResultMs;
      case 'GAME_RESULT': return TIMING.gameResultMs;
      case 'RATING_OFFER': return TIMING.offerTimeoutMs;
      case 'RATING': return TIMING.ratingTimeoutMs;
      case 'THANK_YOU': return TIMING.thankYouMs;
      default: return 0;
    }
  }

  private go(s: MachineState, now: number) {
    this.state = s;
    this.enteredAt = now;
    this.notice = null;
    this.lastTick = -1;
  }

  private setNotice(n: Notice, now: number) {
    this.notice = n;
    this.noticeAt = now;
  }

  private start(now: number) {
    this.targets = pickTargets(this.cfg, this.rand);
    this.results = [];
    this.round = 0;
    this.sessionEventId = null;
    this.go('COUNTDOWN', now);
  }

  private startRating(now: number, sessionId: string | null) {
    this.stars = 0; // tanpa pilihan awal: hindari bias jangkar dan kiriman tak sengaja
    this.ratingSessionId = sessionId;
    this.ratingEventId = null;
    this.go('RATING', now);
  }

  private finishRound(now: number, measuredCm: number | null, lockMs: number | null) {
    const targetCm = this.targets[this.round];
    this.results.push({ round: this.round + 1, targetCm, measuredCm, score: roundScore(measuredCm, targetCm), lockMs });
    this.go('ROUND_RESULT', now);
  }

  private total() {
    return this.results.reduce((s, r) => s + r.score, 0);
  }
}
