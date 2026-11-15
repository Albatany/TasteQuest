import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import { z } from 'zod';
import { SIM_PREFIX } from '../../shared/src/game.ts';
import {
  MODES, deviceEventSchema, heartbeatSchema, settingsSchema, telemetrySchema,
  type DeviceView, type Mode,
} from '../../shared/src/schema.ts';
import type { Config } from './config.ts';
import { openDb } from './db.ts';

export const VERSION = '3.0.0';
const COOKIE = 'tq_op';

const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

/** Format WIB untuk CSV: "2026-11-20 14:03:22". */
const wib = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

function csv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // cegah formula injection di spreadsheet
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (hits.size > 5000) hits.clear();
    const key = req.ip ?? 'unknown';
    let h = hits.get(key);
    if (!h || now > h.reset) hits.set(key, (h = { n: 0, reset: now + windowMs }));
    if (++h.n > max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
      return;
    }
    next();
  };
}

function parse<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | undefined {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  res.status(422).json({ error: 'Payload tidak valid', issues: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  return undefined;
}

type LiveDevice = DeviceView & { lastSeenMs: number };

export function createApp(cfg: Config) {
  const db = openDb(cfg.dbPath);
  const app = express();
  const server = createServer(app);
  const io = new Server(server, { serveClient: false });
  const sessions = new Map<string, number>(); // token operator → kedaluwarsa (ms). Hilang saat restart: cukup login ulang.
  const devices = new Map<string, LiveDevice>();
  const emitTimers = new Map<string, NodeJS.Timeout>();
  const lastEmit = new Map<string, number>();
  const sensorLogAt = new Map<string, number>(); // `${device}:${error}` → waktu log terakhir
  let settings = db.settings();

  for (const d of db.devices()) {
    devices.set(d.id, {
      id: d.id, source: d.source, online: false, lastSeen: d.lastSeen, lastSeenMs: 0,
      heartbeat: null, telemetry: null, errors: db.logs(d.id),
    });
  }

  const view = ({ lastSeenMs: _, ...d }: LiveDevice): DeviceView => d;
  const emitDevice = (id: string) => {
    const d = devices.get(id);
    if (d) io.emit('device', view(d));
  };
  // Telemetry di-broadcast maksimal 5×/detik per perangkat (trailing, jadi nilai terakhir tidak hilang).
  const queueEmit = (id: string) => {
    if (emitTimers.has(id)) return;
    const wait = Math.max(0, (lastEmit.get(id) ?? 0) + 200 - Date.now());
    emitTimers.set(id, setTimeout(() => {
      emitTimers.delete(id);
      lastEmit.set(id, Date.now());
      emitDevice(id);
    }, wait));
  };
  const logDevice = (d: LiveDevice, message: string) => {
    const at = new Date().toISOString();
    db.log(d.id, message, at);
    d.errors = [{ at, message }, ...d.errors].slice(0, 20);
  };
  const seen = (id: string, source: Mode) => {
    let d = devices.get(id);
    if (!d) devices.set(id, (d = { id, source, online: false, lastSeen: null, lastSeenMs: 0, heartbeat: null, telemetry: null, errors: [] }));
    d.lastSeenMs = Date.now();
    d.lastSeen = new Date(d.lastSeenMs).toISOString();
    if (!d.online) {
      d.online = true;
      logDevice(d, 'Perangkat terhubung');
    }
    return d;
  };
  const offlineTimer = setInterval(() => {
    for (const d of devices.values()) {
      if (d.online && Date.now() - d.lastSeenMs > cfg.offlineMs) {
        d.online = false;
        logDevice(d, `Perangkat offline (tidak ada data ${Math.round(cfg.offlineMs / 1000)} detik)`);
        db.touchDevice(d.id, d.source, d.lastSeen!);
        emitDevice(d.id);
      }
    }
  }, 1000);

  const cookieToken = (req: Request) => /(?:^|;\s*)tq_op=([a-f0-9]{64})/.exec(req.headers.cookie ?? '')?.[1];
  const isOperator = (req: Request) => {
    const t = cookieToken(req);
    const exp = t ? sessions.get(t) : undefined;
    if (!t || !exp) return false;
    if (exp < Date.now()) {
      sessions.delete(t);
      return false;
    }
    return true;
  };
  const requireOperator = (req: Request, res: Response, next: NextFunction) => {
    if (isOperator(req)) next();
    else res.status(401).json({ error: 'Login operator diperlukan.' });
  };

  /** Live = token perangkat (Bearer). Demo = simulator browser milik operator yang login, hanya saat Mode DEMO. */
  const requireDevice = (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    let source: Mode | null = null;
    if (auth?.startsWith('Bearer ')) source = safeEqual(auth.slice(7), cfg.deviceToken) ? 'live' : null;
    else if (isOperator(req)) source = 'demo';
    if (!source) {
      res.status(401).json({ error: 'Token perangkat tidak valid.' });
      return;
    }
    if (source === 'demo' && settings.mode !== 'demo') {
      res.status(409).json({ error: 'Mode LIVE aktif: simulator dinonaktifkan.' });
      return;
    }
    const body = req.body as { mode?: unknown; deviceId?: unknown } | undefined;
    const isSim = typeof body?.deviceId === 'string' && body.deviceId.startsWith(SIM_PREFIX);
    if (body?.mode !== source || isSim !== (source === 'demo')) {
      res.status(403).json({ error: source === 'live' ? 'Token live tidak boleh mengirim data demo atau ID SIM-*.' : 'Data demo tidak boleh memakai identitas live.' });
      return;
    }
    res.locals.source = source;
    next();
  };

  // Payload perangkat yang ditolak validasi juga dicatat di log Device Monitor (maks. 1×/menit per jenis), bukan hanya di Serial.
  const parseDevice = <T,>(schema: z.ZodType<T>, req: Request, res: Response): T | undefined => {
    const data = parse(schema, req.body, res);
    const d = data ? undefined : devices.get(String(req.body?.deviceId));
    const key = `${d?.id}:${req.path}`;
    if (d && Date.now() - (sensorLogAt.get(key) ?? 0) > 60_000) {
      sensorLogAt.set(key, Date.now());
      const issue = schema.safeParse(req.body).error?.issues[0];
      logDevice(d, `Data ${req.path.split('/').pop()} ditolak server: ${issue?.path.join('.')} ${issue?.message}. Perbarui firmware.`);
      queueEmit(d.id);
    }
    return data;
  };

  const deviceConfig = () => ({
    targetMinCm: settings.targetMinCm, targetMaxCm: settings.targetMaxCm,
    countdownMs: settings.countdownMs, roundMs: settings.roundMs, muted: settings.muted,
  });
  const modeOf = (req: Request): Mode => (MODES.includes(req.query.mode as Mode) ? (req.query.mode as Mode) : settings.mode);

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use('/api', express.json({ limit: '16kb' }));
  app.use('/api/device', rateLimit(1200, 60_000));
  app.use('/api', rateLimit(600, 60_000));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: VERSION, mode: settings.mode, time: new Date().toISOString() });
  });

  // ---------- Perangkat (ESP8266 atau simulator) ----------
  app.post('/api/device/heartbeat', requireDevice, (req, res) => {
    const hb = parseDevice(heartbeatSchema, req, res);
    if (!hb) return;
    const d = seen(hb.deviceId, hb.mode);
    const { v: _v, deviceId: _id, mode: _m, ...rest } = hb;
    if (d.heartbeat && hb.uptimeS < d.heartbeat.uptimeS) logDevice(d, `Perangkat restart (uptime ${hb.uptimeS} dtk)`);
    if (d.heartbeat && hb.dropped > d.heartbeat.dropped) logDevice(d, `${hb.dropped - d.heartbeat.dropped} event hilang karena antrean RAM penuh`);
    d.heartbeat = rest;
    db.touchDevice(d.id, d.source, d.lastSeen!, hb.fw, hb.ip);
    queueEmit(d.id);
    res.json({ ok: true, config: deviceConfig() });
  });

  app.get('/api/device/config', requireDevice, (_req, res) => {
    res.json(deviceConfig());
  });

  app.post('/api/device/telemetry', requireDevice, (req, res) => {
    const t = parseDevice(telemetrySchema, req, res);
    if (!t) return;
    const d = seen(t.deviceId, t.mode);
    const { v: _v, deviceId: _id, mode: _m, ...rest } = t;
    // TIMEOUT wajar saat tidak ada objek di depan sensor; catat perubahan error maksimal sekali per menit per jenis.
    const key = `${d.id}:${t.sensorError}`;
    if (t.sensorError && t.sensorError !== d.telemetry?.sensorError && Date.now() - (sensorLogAt.get(key) ?? 0) > 60_000) {
      sensorLogAt.set(key, Date.now());
      logDevice(d, `Error sensor: ${t.sensorError}`);
    }
    if (t.touchStuck && !d.telemetry?.touchStuck) logDevice(d, 'Touch tertahan terlalu lama (cek mode TTP223/kabel)');
    d.telemetry = { ...rest, at: new Date().toISOString() };
    queueEmit(d.id);
    res.json({ ok: true });
  });

  app.post('/api/device/events', requireDevice, (req, res) => {
    const e = parseDevice(deviceEventSchema, req, res);
    if (!e) return;
    const d = seen(e.deviceId, e.mode);
    const now = new Date();
    if (e.type === 'game') {
      const r = db.insertGame(e, now);
      if (r.status === 'created') {
        const session = db.session(e.mode, r.id);
        io.emit('game', { mode: e.mode, session });
      }
      res.status(r.status === 'created' ? 201 : 200).json({ ok: true, status: r.status, eventId: e.eventId });
    } else {
      const r = db.insertRating(e, now);
      if (r.status === 'created') io.emit('rating', { mode: e.mode, eventId: e.eventId, stars: e.stars, sessionEventId: e.sessionEventId });
      res.status(r.status === 'created' ? 201 : 200).json({ ok: true, status: r.status, eventId: e.eventId });
    }
    queueEmit(d.id);
  });

  // ---------- Data dashboard (baca saja) ----------
  app.get('/api/devices', (_req, res) => {
    res.json([...devices.values()].map(view));
  });
  app.get('/api/overview', (req, res) => {
    res.json({ mode: modeOf(req), ...db.overview(modeOf(req)) });
  });
  app.get('/api/leaderboard', (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ mode: modeOf(req), rows: db.leaderboard(modeOf(req), limit) });
  });
  app.get('/api/reviews', (req, res) => {
    res.json({ mode: modeOf(req), ...db.reviews(modeOf(req)) });
  });
  app.get('/api/settings', (_req, res) => {
    res.json(settings);
  });

  // ---------- Operator ----------
  app.post('/api/auth/login', rateLimit(10, 60_000), (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!safeEqual(password, cfg.operatorPassword)) {
      res.status(401).json({ error: 'Password operator salah.' });
      return;
    }
    const token = randomBytes(32).toString('hex');
    const maxAge = cfg.sessionHours * 3600;
    sessions.set(token, Date.now() + maxAge * 1000);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
    res.json({ operator: true });
  });
  app.post('/api/auth/logout', (req, res) => {
    const t = cookieToken(req);
    if (t) sessions.delete(t);
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ operator: false });
  });
  app.get('/api/auth/me', (req, res) => {
    res.json({ operator: isOperator(req) });
  });

  app.put('/api/settings', requireOperator, (req, res) => {
    const s = parse(settingsSchema, req.body, res);
    if (!s) return;
    settings = s;
    db.saveSettings(s);
    io.emit('settings', settings);
    res.json(settings);
  });

  app.patch('/api/sessions/:id', requireOperator, (req, res) => {
    const body = parse(z.object({ nickname: z.string().trim().max(24).nullable() }), req.body, res);
    if (!body) return;
    const ok = db.setNickname(Number(req.params.id), body.nickname || null);
    if (!ok) {
      res.status(404).json({ error: 'Sesi tidak ditemukan.' });
      return;
    }
    io.emit('data', { reason: 'nickname' });
    res.json({ ok: true });
  });

  app.get('/api/export/:kind', requireOperator, (req, res) => {
    const mode = modeOf(req);
    let body: string;
    if (req.params.kind === 'games.csv') {
      body = csv([
        ['session_id', 'pemain', 'nickname', 'total_skor', 'durasi_ms', 'selesai_wib', 'perangkat', 'event_id', 'ronde', 'target_cm', 'terukur_cm', 'skor_ronde', 'lock_ms'],
        ...db.gamesForExport(mode).map((r) => [r.id, `P${r.player_no}`, r.nickname, r.total_score, r.duration_ms, wib(String(r.finished_at)), r.device_id, r.event_id, r.round, r.target_cm, r.measured_cm, r.score, r.lock_ms] as (string | number | null)[]),
      ]);
    } else if (req.params.kind === 'ratings.csv') {
      body = csv([
        ['rating_id', 'bintang', 'waktu_wib', 'perangkat', 'sesi_event_id', 'event_id'],
        ...db.ratingsForExport(mode).map((r) => [r.id, r.stars, wib(String(r.created_at)), r.device_id, r.session_event_id, r.event_id] as (string | number | null)[]),
      ]);
    } else {
      res.status(404).json({ error: 'Ekspor tidak dikenal.' });
      return;
    }
    const date = wib(new Date().toISOString()).slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tastequest-${mode}-${req.params.kind.replace('.csv', '')}-${date}.csv"`);
    res.send(body);
  });

  app.post('/api/admin/reset-demo', requireOperator, (req, res) => {
    if (req.body?.confirm !== 'RESET') {
      res.status(400).json({ error: 'Ketik RESET untuk konfirmasi.' });
      return;
    }
    const removed = db.resetDemo();
    io.emit('data', { reason: 'reset', mode: 'demo' });
    res.json({ ok: true, removed });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
  });

  // ---------- Dashboard (build produksi, same-origin) ----------
  const index = join(cfg.webDist, 'index.html');
  app.use(express.static(cfg.webDist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (existsSync(index)) res.sendFile(index);
    else res.status(503).type('text').send('Dashboard belum di-build. Jalankan: npm run build');
  });

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON tidak valid.' });
      return;
    }
    if (err.status === 413) {
      res.status(413).json({ error: 'Payload terlalu besar.' });
      return;
    }
    console.error('[server] error:', err.message);
    res.status(500).json({ error: 'Kesalahan server.' });
  });

  return {
    app, server, io, db,
    close: async () => {
      clearInterval(offlineTimer);
      emitTimers.forEach(clearTimeout);
      io.close();
      await new Promise<void>((r) => server.close(() => r()));
      db.close();
    },
  };
}
