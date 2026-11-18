import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundScore } from '../../shared/src/game.ts';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

const TOKEN = 'test-device-token-1234567890';
const PASSWORD = 'operator-pass';
const dir = mkdtempSync(join(tmpdir(), 'tq-test-'));
const dbPath = join(dir, 'test.db');
const cfg = { ...loadConfig({ OPERATOR_PASSWORD: PASSWORD, DEVICE_TOKEN: TOKEN, DB_PATH: dbPath, DEVICE_OFFLINE_MS: '400' }), webDist: join(dir, 'nope') };

let app: ReturnType<typeof createApp>;
let base = '';
let cookie = '';

async function start() {
  app = createApp(cfg);
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- body respons diperiksa lewat assertion test
type Body = any;
async function api(path: string, opts: { method?: string; body?: unknown; token?: string; cookie?: string } = {}): Promise<{ status: number; headers: Headers; body: Body }> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(base + path, { method: opts.method ?? (opts.body ? 'POST' : 'GET'), headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
}

type R = [number, number | null, number | null];
function game(eventId: string, rounds: R[], o: { mode?: 'live' | 'demo'; deviceId?: string; ageMs?: number } = {}) {
  const rs = rounds.map(([t, m, l], i) => ({ round: i + 1, targetCm: t, measuredCm: m, score: roundScore(m, t), lockMs: l }));
  return {
    v: 1, type: 'game', eventId, ageMs: o.ageMs ?? 0, roundMs: 10000, rounds: rs,
    totalScore: rs.reduce((s, r) => s + r.score, 0), mode: o.mode ?? 'live', deviceId: o.deviceId ?? 'TQ-ESP01',
  };
}
const rating = (eventId: string, stars: number, o: { mode?: 'live' | 'demo'; deviceId?: string; ageMs?: number } = {}) =>
  ({ v: 1, type: 'rating', eventId, ageMs: o.ageMs ?? 0, stars, sessionEventId: null, mode: o.mode ?? 'live', deviceId: o.deviceId ?? 'TQ-ESP01' });
const heartbeat = (o: Record<string, unknown> = {}) =>
  ({ v: 1, deviceId: 'TQ-ESP01', mode: 'live', fw: '3.0.0', uptimeS: 10, rssi: -55, ip: '192.168.1.50', heap: 30000, queue: 0, dropped: 0, ...o });

beforeAll(start);
afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('auth perangkat & operator', () => {
  it('health publik', async () => {
    const r = await api('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, mode: 'demo' });
  });
  it('event tanpa/dengan token salah ditolak', async () => {
    expect((await api('/api/device/events', { body: rating('evt-noauth-1', 5) })).status).toBe(401);
    expect((await api('/api/device/events', { body: rating('evt-noauth-1', 5), token: 'wrong-token-xxxxxxxxxx' })).status).toBe(401);
  });
  it('login operator: password salah 401, benar memberi cookie HttpOnly', async () => {
    expect((await api('/api/auth/login', { body: { password: 'salah' } })).status).toBe(401);
    const r = await api('/api/auth/login', { body: { password: PASSWORD } });
    expect(r.status).toBe(200);
    const set = r.headers.get('set-cookie')!;
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    cookie = set.split(';')[0];
    expect((await api('/api/auth/me', { cookie })).body).toEqual({ operator: true });
  });
  it('mutasi admin wajib login', async () => {
    expect((await api('/api/settings', { method: 'PUT', body: {} })).status).toBe(401);
    expect((await api('/api/admin/reset-demo', { body: { confirm: 'RESET' } })).status).toBe(401);
    expect((await api('/api/export/games.csv')).status).toBe(401);
  });
});

describe('event game & rating', () => {
  it('simpan game live, retry duplikat idempoten', async () => {
    const e = game('evt-live-game-1', [[18, 18, 1500], [25, 26.3, 4000], [12, null, null], [22, 22.5, 2000], [15, 14, 10000]]);
    const a = await api('/api/device/events', { body: e, token: TOKEN });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ status: 'created' });
    const b = await api('/api/device/events', { body: e, token: TOKEN });
    expect(b.status).toBe(200);
    expect(b.body).toMatchObject({ status: 'duplicate' });
    const lb = await api('/api/leaderboard?mode=live');
    expect(lb.body.rows).toHaveLength(1);
    expect(lb.body.rows[0]).toMatchObject({ totalScore: 377, playerNo: 1, durationMs: 1500 + 4000 + 10000 + 2000 + 10000 });
    expect(lb.body.rows[0].rounds[2]).toMatchObject({ measuredCm: null, score: 0 });
    expect(lb.body.rows[0].rounds[3]).toMatchObject({ measuredCm: 22.5, score: 100 }); // zona 100
  });
  it('sesi harus tepat 5 ronde', async () => {
    const e = game('evt-three-rounds', [[18, 18, 1500], [25, 25, 1000], [12, 12, 1000]]);
    const r = await api('/api/device/events', { body: e, token: TOKEN });
    expect(r.status).toBe(422);
  });
  it('skor yang tidak sesuai rumus ditolak', async () => {
    const e = game('evt-bad-score-1', [[18, 18.5, 1500], [25, 25, 1000], [12, 12, 1000], [22, 22, 1000], [15, 15, 1000]]);
    e.rounds[0].score = 95; // rumus lama; zona 100 → 100
    e.totalScore = 495;
    const r = await api('/api/device/events', { body: e, token: TOKEN });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.issues)).toMatch(/rumus/);
  });
  it('rating 1–5 diterima, 0 dan 6 ditolak', async () => {
    for (const s of [1, 2, 3, 4, 5]) expect((await api('/api/device/events', { body: rating(`evt-rate-${s}-x`, s), token: TOKEN })).status).toBe(201);
    expect((await api('/api/device/events', { body: rating('evt-rate-0-x', 0), token: TOKEN })).status).toBe(422);
    expect((await api('/api/device/events', { body: rating('evt-rate-6-x', 6), token: TOKEN })).status).toBe(422);
    expect((await api('/api/device/events', { body: { ...rating('evt-rate-v2', 3), v: 2 }, token: TOKEN })).status).toBe(422);
  });
  it('JSON rusak → 400', async () => {
    const r = await fetch(`${base}/api/device/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: '{oops' });
    expect(r.status).toBe(400);
  });
});

describe('pemisahan demo/live', () => {
  it('token live tidak boleh mengirim data demo atau ID SIM-*', async () => {
    expect((await api('/api/device/events', { body: rating('evt-mix-1x', 4, { mode: 'demo' }), token: TOKEN })).status).toBe(403);
    expect((await api('/api/device/events', { body: rating('evt-mix-2x', 4, { deviceId: 'SIM-01' }), token: TOKEN })).status).toBe(403);
  });
  it('simulator: wajib login, harus SIM-*, mode demo', async () => {
    expect((await api('/api/device/events', { body: rating('evt-sim-1x', 4, { mode: 'demo', deviceId: 'SIM-01' }) })).status).toBe(401);
    expect((await api('/api/device/events', { body: rating('evt-sim-1x', 4, { mode: 'demo', deviceId: 'TQ-ESP01' }), cookie })).status).toBe(403);
    expect((await api('/api/device/events', { body: rating('evt-sim-1x', 4, { mode: 'live', deviceId: 'SIM-01' }), cookie })).status).toBe(403);
    expect((await api('/api/device/events', { body: rating('evt-sim-1x', 4, { mode: 'demo', deviceId: 'SIM-01' }), cookie })).status).toBe(201);
    const g = game('evt-sim-game-1', [[10, 10, 900], [20, 20, 900], [30, 30, 900], [15, 15, 900], [25, 25, 900]], { mode: 'demo', deviceId: 'SIM-01' });
    expect((await api('/api/device/events', { body: g, cookie })).status).toBe(201);
  });
  it('analytics & leaderboard terpisah per mode', async () => {
    const live = (await api('/api/overview?mode=live')).body;
    const demo = (await api('/api/overview?mode=demo')).body;
    expect(live).toMatchObject({ sessions: 1, ratings: 5, avgStars: 3 });
    expect(demo).toMatchObject({ sessions: 1, ratings: 1, avgStars: 4 });
    expect(demo.top[0].totalScore).toBe(500);
  });
  it('Mode LIVE menolak simulator', async () => {
    const s = (await api('/api/settings')).body;
    expect((await api('/api/settings', { method: 'PUT', body: { ...s, mode: 'live' }, cookie })).status).toBe(200);
    const r = await api('/api/device/events', { body: rating('evt-sim-live1', 4, { mode: 'demo', deviceId: 'SIM-01' }), cookie });
    expect(r.status).toBe(409);
    expect((await api('/api/overview')).body.mode).toBe('live');
    await api('/api/settings', { method: 'PUT', body: { ...s, mode: 'demo' }, cookie });
  });
  it('reset demo butuh konfirmasi dan tidak menyentuh data live', async () => {
    expect((await api('/api/admin/reset-demo', { body: {}, cookie })).status).toBe(400);
    const r = await api('/api/admin/reset-demo', { body: { confirm: 'RESET' }, cookie });
    expect(r.body.removed).toEqual({ ratings: 1, sessions: 1 });
    expect((await api('/api/overview?mode=demo')).body).toMatchObject({ sessions: 0, ratings: 0 });
    expect((await api('/api/overview?mode=live')).body).toMatchObject({ sessions: 1, ratings: 5 });
  });
});

describe('ranking & statistik', () => {
  it('urut skor tertinggi → durasi tercepat → selesai paling awal', async () => {
    // skor sama (500), durasi berbeda; dua terakhir durasi sama, selesai berbeda (ageMs)
    const perfect = (ms: number): R[] => [10, 20, 30, 15, 25].map((t) => [t, t, ms]);
    await api('/api/device/events', { body: game('evt-rank-slow', perfect(3000)), token: TOKEN });
    await api('/api/device/events', { body: game('evt-rank-fast', perfect(1000)), token: TOKEN });
    await api('/api/device/events', { body: game('evt-rank-late', perfect(2000), { ageMs: 0 }), token: TOKEN });
    await api('/api/device/events', { body: game('evt-rank-early', perfect(2000), { ageMs: 60000 }), token: TOKEN });
    const rows = (await api('/api/leaderboard?mode=live')).body.rows;
    expect(rows.map((r: { eventId: string }) => r.eventId)).toEqual(['evt-rank-fast', 'evt-rank-early', 'evt-rank-late', 'evt-rank-slow', 'evt-live-game-1']);
    expect(rows.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it('statistik review: rata-rata, distribusi, tren WIB, riwayat', async () => {
    const r = (await api('/api/reviews?mode=live')).body;
    expect(r.count).toBe(5);
    expect(r.avg).toBe(3);
    expect(r.distribution).toEqual([1, 2, 3, 4, 5].map((stars) => ({ stars, count: 1 })));
    expect(r.trend.length).toBeGreaterThanOrEqual(1);
    expect(r.trend.at(-1).bucket).toMatch(/^\d{4}-\d\d-\d\d \d\d:00$/);
    expect(r.recent).toHaveLength(5);
  });
  it('nickname operator + ekspor CSV aman dari formula injection', async () => {
    const id = (await api('/api/leaderboard?mode=live')).body.rows[0].id;
    expect((await api(`/api/sessions/${id}`, { method: 'PATCH', body: { nickname: '=HYPERLINK("x")' }, cookie })).status).toBe(200);
    const c = await api('/api/export/games.csv?mode=live', { cookie });
    expect(c.status).toBe(200);
    expect(c.headers.get('content-type')).toMatch(/text\/csv/);
    expect(c.body).toMatch(/^session_id,pemain,nickname/);
    const raw = new Uint8Array(await (await fetch(`${base}/api/export/games.csv?mode=live`, { headers: { cookie } })).arrayBuffer());
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM agar Excel membaca UTF-8 (fetch.text() membuangnya)
    expect(c.body).toContain(`"'=HYPERLINK(""x"")"`);
    const rcsv = await api('/api/export/ratings.csv?mode=live', { cookie });
    expect(rcsv.body.trim().split('\r\n')).toHaveLength(6);
  });
});

describe('pengaturan & perangkat', () => {
  it('validasi pengaturan dan config dikirim ke perangkat', async () => {
    const s = (await api('/api/settings')).body;
    expect((await api('/api/settings', { method: 'PUT', body: { ...s, targetMinCm: 20, targetMaxCm: 21 }, cookie })).status).toBe(422);
    expect((await api('/api/settings', { method: 'PUT', body: { ...s, roundMs: 8000, muted: true }, cookie })).status).toBe(200);
    const hb = await api('/api/device/heartbeat', { body: heartbeat(), token: TOKEN });
    expect(hb.body.config).toMatchObject({ roundMs: 8000, muted: true });
  });
  it('real-time: game, telemetry, dan status offline disiarkan via Socket.IO', async () => {
    const sock: Socket = connect(base, { transports: ['websocket'] });
    await new Promise<void>((r) => sock.on('connect', () => r()));
    const gotGame = new Promise((r) => sock.once('game', r));
    await api('/api/device/events', { body: game('evt-rt-game-1', [[11, 11.5, 2000], [22, 21, 2000], [15, 15, 2000], [18, 18, 2000], [25, 25, 2000]]), token: TOKEN });
    expect(await gotGame).toMatchObject({ mode: 'live', session: { eventId: 'evt-rt-game-1', totalScore: 100 + 90 + 100 + 100 + 100 } });

    const gotDevice = new Promise<{ telemetry: { state: string } }>((r) => sock.on('device', (d) => d.telemetry?.state === 'ROUND_ACTIVE' && r(d)));
    const tel = {
      v: 1, deviceId: 'TQ-ESP01', mode: 'live', state: 'ROUND_ACTIVE', menuIndex: 0, practice: false, round: 1, targetCm: 18,
      remainingMs: 8000, results: [], totalScore: null, stars: 0, notice: null, rated: false, sessionEventId: null,
      ratingEventId: null, ratingStatus: null, distanceCm: 17.4, sensorError: null, touch: false, touchStuck: false, muted: false, queue: 0,
    };
    expect((await api('/api/device/telemetry', { token: TOKEN, body: { ...tel, state: 'RP_PRACTICE', round: 0, targetCm: null } })).status).toBe(200);
    await api('/api/device/telemetry', { token: TOKEN, body: tel });
    expect((await gotDevice).telemetry.state).toBe('ROUND_ACTIVE');

    const offline = new Promise<{ online: boolean }>((r) => sock.on('device', (d) => d.id === 'TQ-ESP01' && !d.online && r(d)));
    expect((await offline).online).toBe(false);
    const devs = (await api('/api/devices')).body;
    const esp = devs.find((d: { id: string }) => d.id === 'TQ-ESP01');
    expect(esp.lastSeen).toBeTruthy();
    expect(esp.errors.map((e: { message: string }) => e.message).join('|')).toMatch(/offline/);
    sock.close();
  });
});

describe('payload perangkat ditolak', () => {
  it('422 juga tercatat di log Device Monitor (bukan hanya di Serial)', async () => {
    await api('/api/device/heartbeat', { body: heartbeat(), token: TOKEN });
    const r = await api('/api/device/telemetry', { body: { v: 1, deviceId: 'TQ-ESP01', mode: 'live', state: 'IDLE' }, token: TOKEN });
    expect(r.status).toBe(422);
    const esp = (await api('/api/devices')).body.find((d: { id: string }) => d.id === 'TQ-ESP01');
    expect(esp.errors[0].message).toMatch(/^Data telemetry ditolak server: /);
  });
});

describe('persistensi', () => {
  it('data bertahan setelah restart server/SQLite', async () => {
    const before = (await api('/api/overview?mode=live')).body;
    await app.close();
    await start();
    const after = (await api('/api/overview?mode=live')).body;
    expect(after.sessions).toBe(before.sessions);
    expect(after.ratings).toBe(before.ratings);
    expect((await api('/api/settings')).body.roundMs).toBe(8000);
    const esp = (await api('/api/devices')).body.find((d: { id: string }) => d.id === 'TQ-ESP01');
    expect(esp).toMatchObject({ online: false });
    expect(esp.lastSeen).toBeTruthy();
    expect((await api('/api/auth/me', { cookie })).body).toEqual({ operator: false }); // sesi login di memori: login ulang setelah restart
  });
  it('rate limit login', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await api('/api/auth/login', { body: { password: 'x' } })).status;
    expect(last).toBe(429);
  });
});
