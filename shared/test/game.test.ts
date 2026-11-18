import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Machine, ROUNDS, TIMING, TouchClassifier, pickTargets, quantizeCm, resultTier, roundScore, type Action, type Touch } from '../src/game.ts';
import { gameEventSchema, ratingEventSchema, settingsSchema } from '../src/schema.ts';

const cases = readFileSync(new URL('./scoring_cases.txt', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => l.trim().split(/\s+/));

describe('roundScore', () => {
  it.each(cases)('target %s, terukur %s → %s', (t, m, want) => {
    expect(roundScore(m === '-' ? null : Number(m), Number(t))).toBe(Number(want));
  });
  it('perfect, zona 100, deviasi, clamp, tanpa bacaan', () => {
    expect(roundScore(20, 20)).toBe(100);
    expect(roundScore(quantizeCm(20.34), 20)).toBe(100);
    expect(roundScore(quantizeCm(19.66), 20)).toBe(97);
    expect(roundScore(45, 20)).toBe(0);
    expect(roundScore(null, 20)).toBe(0);
    expect(roundScore(Number.NaN, 20)).toBe(0);
  });
});

describe('resultTier', () => {
  it('batas label MASTER/PRO/NICE/COBA LAGI', () => {
    expect([500, 450, 449, 330, 329, 170, 169, 0].map(resultTier)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
  });
});

describe('pickTargets', () => {
  const cfg = { targetMinCm: 10, targetMaxCm: 14, countdownMs: 3000, roundMs: 10000 };
  it('menghasilkan ROUNDS target bulat berbeda dalam rentang', () => {
    for (let i = 0; i < 200; i++) {
      const t = pickTargets(cfg, (n) => Math.floor(Math.random() * n));
      expect(new Set(t).size).toBe(ROUNDS);
      t.forEach((x) => expect(x >= 10 && x <= 14 && Number.isInteger(x)).toBe(true));
    }
  });
  it('10 target di rentang 5 nilai: boleh berulang, tidak macet', () => {
    expect(pickTargets(cfg, (n) => Math.floor(Math.random() * n), 10)).toHaveLength(10);
  });
});

/** Jalankan urutan [waktu, level] dan kumpulkan event. */
function feed(steps: [number, boolean][], until?: number, every = 10) {
  const c = new TouchClassifier();
  const out: [number, Touch][] = [];
  let i = 0;
  let level = false;
  const end = until ?? steps[steps.length - 1][0] + 200;
  for (let t = 0; t <= end; t += every) {
    while (i < steps.length && steps[i][0] <= t) {
      level = steps[i][1];
      const ev = c.sample(steps[i][0], level);
      if (ev) out.push([steps[i][0], ev]);
      i++;
    }
    const ev = c.sample(t, level);
    if (ev) out.push([t, ev]);
  }
  return out;
}

describe('TouchClassifier', () => {
  it('sentuhan singkat → tepat satu SHORT saat dilepas', () => {
    expect(feed([[0, true], [100, false]])).toEqual([[130, 'SHORT']]);
  });
  it('tahan lama → tepat satu LONG di 1200 ms, tanpa SHORT saat dilepas', () => {
    expect(feed([[0, true], [2000, false]])).toEqual([[1200, 'LONG']]);
  });
  it('dilepas di 1199 ms tetap SHORT (debounce pelepasan tidak menambah durasi)', () => {
    expect(feed([[0, true], [1199, false]], 1600, 1).map((e) => e[1])).toEqual(['SHORT']);
  });
  it('glitch < debounce diabaikan', () => {
    expect(feed([[0, true], [10, false]])).toEqual([]);
  });
  it('pantulan saat dilepas hanya menghasilkan satu SHORT', () => {
    expect(feed([[0, true], [100, false], [110, true], [115, false]]).map((e) => e[1])).toEqual(['SHORT']);
  });
  it('replay edge dari ISR setelah blocking: pendek → SHORT, panjang → LONG', () => {
    const a = new TouchClassifier();
    expect([a.sample(100, true), a.sample(200, false), a.sample(260, false)]).toEqual([null, null, 'SHORT']);
    const b = new TouchClassifier();
    expect([b.sample(100, true), b.sample(1500, false), b.sample(1600, false)]).toEqual([null, 'LONG', null]);
  });
});

function setup(cfg = { targetMinCm: 10, targetMaxCm: 30, countdownMs: 3000, roundMs: 10000 }) {
  let seq = 0;
  const targets = [18, 25, 12, 22, 15];
  let k = 0;
  // rand deterministik: kembalikan offset yang menghasilkan target di atas
  const m = new Machine(cfg, () => targets[k++ % targets.length] - cfg.targetMinCm, () => `TEST-evt-${++seq}0000`);
  let now = 1000;
  const acts: Action[] = [];
  const api = {
    m,
    acts,
    get now() { return now; },
    press(t: Touch, d: number | null = null) { acts.push(...m.input(now, t, d)); },
    wait(ms: number) { const end = now + ms; while (now < end) { now = Math.min(end, now + 50); acts.push(...m.tick(now)); } },
    data() { return acts.filter((a) => a.type !== 'beep'); },
    beeps() { return acts.filter((a) => a.type === 'beep').map((a) => (a as { beep: string }).beep); },
    /** Menu → Main ProxiRush → READY → TAHAN → selesai di ronde asli 1 yang sedang berjalan. */
    play() {
      api.press('SHORT'); api.press('LONG'); api.press('LONG');
      api.wait(3000);
    },
  };
  return api;
}

describe('Machine (FSM)', () => {
  it('alur penuh: Main ProxiRush → READY → 5 ronde langsung dinilai → hasil → rating tertaut ke sesi', () => {
    const s = setup();
    s.press('SHORT');
    expect(s.m.state).toBe('MENU');
    s.press('LONG');
    expect(s.m.snapshot(s.now)).toMatchObject({ state: 'READY', practice: false });
    s.press('LONG');
    expect(s.m.snapshot(s.now)).toMatchObject({ state: 'COUNTDOWN', practice: false, round: 1, results: [] });
    s.wait(3000);
    expect(s.m.state).toBe('ROUND_ACTIVE');
    expect(s.beeps().filter((b) => b === 'tick')).toHaveLength(3);
    expect(s.m.snapshot(s.now)).toMatchObject({ round: 1, targetCm: 18 });
    s.wait(1500);
    s.press('SHORT', 18.04);
    expect(s.m.results[0]).toEqual({ round: 1, targetCm: 18, measuredCm: 18, score: 100, lockMs: 1500 });
    s.m.reading(30); // di luar ronde aktif: diabaikan
    s.wait(TIMING.roundResultMs + 3000);
    for (const cm of [26.2, 90, 26.3, 26.4, 26.1, 26.3]) s.m.reading(cm); // 5 terakhir → median 26,3
    s.wait(10000);
    expect(s.m.results[1]).toEqual({ round: 2, targetCm: 25, measuredCm: 26.3, score: 87, lockMs: 10000 });
    s.wait(TIMING.roundResultMs + 3000 + 10000); // ronde 3: tidak ada bacaan sama sekali
    expect(s.m.results[2]).toMatchObject({ measuredCm: null, score: 0, lockMs: null });
    expect(s.data()).toEqual([]); // data baru dikirim setelah ronde 5
    s.wait(TIMING.roundResultMs + 3000);
    expect(s.m.targets).toEqual([18, 25, 12, 22, 15]);
    s.wait(500); s.press('SHORT', 22.9); s.wait(TIMING.roundResultMs + 3000); // zona 100
    s.m.reading(15.4);
    s.wait(10000); // ronde 5: tidak menyentuh, satu bacaan valid cukup
    expect(s.m.results.map((r) => r.score)).toEqual([100, 87, 0, 100, 100]);
    s.wait(TIMING.roundResultMs);
    expect(s.m.state).toBe('GAME_RESULT');
    expect(s.beeps().at(-1)).toBe('finish');
    const [game] = s.data();
    expect(game).toMatchObject({ type: 'game', totalScore: 387 });
    expect((game as { rounds: unknown[] }).rounds).toHaveLength(ROUNDS);
    expect(s.m.snapshot(s.now).totalScore).toBe(387);
    s.press('SHORT');
    expect(s.m.state).toBe('RATING_OFFER');
    s.press('LONG');
    expect(s.m.state).toBe('RATING');
    s.press('LONG'); // belum memilih bintang
    expect(s.m.state).toBe('RATING');
    expect(s.m.notice).toBe('PICK_STAR');
    for (let i = 0; i < 4; i++) s.press('SHORT');
    expect(s.m.stars).toBe(4);
    s.press('LONG');
    expect(s.m.state).toBe('THANK_YOU');
    const rating = s.data()[1];
    expect(rating).toMatchObject({ type: 'rating', stars: 4, sessionEventId: (game as { eventId: string }).eventId });
    s.wait(TIMING.thankYouMs);
    expect(s.m.state).toBe('IDLE');
  });

  it('event game yang dihasilkan lolos validasi backend (termasuk kunci otomatis)', () => {
    const s = setup();
    s.play();
    s.press('SHORT', 17.2); s.wait(TIMING.roundResultMs + 3000);
    s.press('SHORT', 33.33); s.wait(TIMING.roundResultMs + 3000);
    s.m.reading(12.3); s.wait(10000 + TIMING.roundResultMs + 3000);
    s.wait(10000 + TIMING.roundResultMs + 3000);
    s.press('SHORT', 12); s.wait(TIMING.roundResultMs);
    const g = s.data()[0] as Extract<Action, { type: 'game' }>;
    expect(g.rounds.map((r) => r.lockMs === null)).toEqual([false, false, false, true, false]);
    const r = gameEventSchema.safeParse({ v: 1, deviceId: 'SIM-01', mode: 'demo', ageMs: 0, ...g, type: 'game' });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('sensor invalid saat lock: tetap di ronde, beri notice, tanpa jarak palsu', () => {
    const s = setup();
    s.play();
    s.press('SHORT', null);
    expect(s.m.state).toBe('ROUND_ACTIVE');
    expect(s.m.notice).toBe('NO_READING');
    expect(s.m.results).toHaveLength(0);
    s.wait(TIMING.noticeMs);
    expect(s.m.notice).toBeNull();
  });

  it('input setelah batas waktu ronde diabaikan; input saat countdown diabaikan', () => {
    const s = setup();
    s.press('SHORT'); s.press('LONG'); s.press('LONG');
    expect(s.m.state).toBe('COUNTDOWN');
    s.press('SHORT', 20);
    expect(s.m.state).toBe('COUNTDOWN');
    s.wait(3000);
    const late = s.m.input(s.now + 10000, 'SHORT', 18);
    expect(late).toEqual([]);
    expect(s.m.state).toBe('ROUND_ACTIVE');
  });

  it('menu Latihan tidak menghasilkan event game; skor rendah → melodi sedih', () => {
    const s = setup();
    s.press('SHORT'); s.press('SHORT'); s.press('LONG');
    expect(s.m.practice).toBe(true);
    expect(s.m.state).toBe('READY');
    s.press('LONG'); s.wait(3000);
    for (let i = 0; i < ROUNDS; i++) { s.press('SHORT', 40); s.wait(TIMING.roundResultMs + 3000); }
    expect(s.m.state).toBe('GAME_RESULT');
    expect(s.data()).toEqual([]);
    expect(s.beeps().at(-1)).toBe('finishLow');
  });

  it('READY ProxiRush: diam 20 detik → IDLE, masuk lagi ke menu utama; skor sedang → melodi sedang', () => {
    const s = setup();
    s.press('SHORT'); s.press('LONG');
    s.wait(TIMING.menuTimeoutMs);
    expect(s.m.state).toBe('IDLE');
    s.press('SHORT');
    expect(s.m.snapshot(s.now)).toMatchObject({ state: 'MENU', menuIndex: 0 });
    const t = setup();
    t.play();
    for (let i = 0; i < ROUNDS; i++) { t.press('SHORT', i < 2 ? t.m.targets[t.m.round] : 2); t.wait(TIMING.roundResultMs + 3000); }
    expect(t.m.results.reduce((a, r) => a + r.score, 0)).toBe(200);
    expect(t.beeps().at(-1)).toBe('finishMid');
  });

  it('rating langsung dari menu tanpa sesi; bintang berputar 1→5→1', () => {
    const s = setup();
    s.press('SHORT'); s.press('SHORT'); s.press('SHORT');
    expect(s.m.menuIndex).toBe(2);
    s.press('LONG');
    expect(s.m.state).toBe('RATING');
    const seen = [];
    for (let i = 0; i < 6; i++) { s.press('SHORT'); seen.push(s.m.stars); }
    expect(seen).toEqual([1, 2, 3, 4, 5, 1]);
    s.press('LONG');
    expect(s.data()[0]).toMatchObject({ type: 'rating', stars: 1, sessionEventId: null });
    expect(ratingEventSchema.safeParse({ v: 1, deviceId: 'SIM-01', mode: 'demo', ageMs: 0, ...s.data()[0] }).success).toBe(true);
  });

  it('skip dan timeout rating tidak membuat data', () => {
    const s = setup();
    s.play();
    for (let i = 0; i < ROUNDS; i++) { s.press('SHORT', 20); s.wait(TIMING.roundResultMs + 3000); }
    s.wait(TIMING.gameResultMs);
    expect(s.m.state).toBe('RATING_OFFER');
    s.press('SHORT');
    expect(s.m.state).toBe('THANK_YOU');
    expect(s.m.rated).toBe(false);
    s.wait(TIMING.thankYouMs);
    s.press('SHORT'); s.press('SHORT'); s.press('SHORT'); s.press('LONG');
    s.press('SHORT');
    s.wait(TIMING.ratingTimeoutMs);
    expect(s.m.state).toBe('IDLE');
    expect(s.data().filter((a) => a.type === 'rating')).toEqual([]);
  });

  it('menu timeout kembali ke IDLE', () => {
    const s = setup();
    s.press('SHORT');
    s.wait(TIMING.menuTimeoutMs);
    expect(s.m.state).toBe('IDLE');
  });
});

describe('settingsSchema', () => {
  it('menolak rentang target terlalu sempit', () => {
    expect(settingsSchema.safeParse({ mode: 'demo', targetMinCm: 10, targetMaxCm: 12, countdownMs: 3000, roundMs: 10000, muted: false }).success).toBe(false);
  });
});
