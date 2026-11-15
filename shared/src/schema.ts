// Kontrak event v1 antara firmware/simulator → server. Divalidasi di backend (trust boundary).
import { z } from 'zod';
import { ROUNDS, SCHEMA_VERSION, STATES, roundScore } from './game.ts';

export const MODES = ['demo', 'live'] as const;
export type Mode = (typeof MODES)[number];

const id = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/, 'ID perangkat tidak valid');
const eventId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'eventId tidak valid');
const base = {
  v: z.literal(SCHEMA_VERSION, { error: `Versi skema harus ${SCHEMA_VERSION}` }),
  deviceId: id,
  mode: z.enum(MODES),
};
const oneDecimal = (n: number) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-6;

export const roundSchema = z.object({
  round: z.int().min(1).max(ROUNDS),
  targetCm: z.int().min(5).max(50),
  measuredCm: z.number().min(2).max(400).refine(oneDecimal, 'measuredCm maksimal 1 desimal').nullable(),
  score: z.int().min(0).max(100),
  lockMs: z.int().min(0).max(60000).nullable(),
});

export const gameEventSchema = z.object({
  ...base,
  type: z.literal('game'),
  eventId,
  ageMs: z.int().min(0).max(7 * 86400000), // umur event saat dikirim: perangkat tidak punya jam (tanpa NTP/internet)
  roundMs: z.int().min(3000).max(30000), // durasi ronde yang dipakai perangkat; untuk tie-break waktu
  rounds: z.array(roundSchema).length(ROUNDS),
  totalScore: z.int().min(0).max(ROUNDS * 100),
}).superRefine((g, ctx) => {
  const targets = new Set(g.rounds.map((r) => r.targetCm));
  if (targets.size !== ROUNDS) ctx.addIssue({ code: 'custom', message: 'Target tiap ronde harus berbeda', path: ['rounds'] });
  g.rounds.forEach((r, i) => {
    if (r.round !== i + 1) ctx.addIssue({ code: 'custom', message: 'Urutan ronde harus 1..3', path: ['rounds', i, 'round'] });
    if ((r.measuredCm === null) !== (r.lockMs === null)) ctx.addIssue({ code: 'custom', message: 'measuredCm dan lockMs harus sama-sama null saat timeout', path: ['rounds', i] });
    if (r.lockMs !== null && r.lockMs > g.roundMs) ctx.addIssue({ code: 'custom', message: 'lockMs melebihi durasi ronde', path: ['rounds', i, 'lockMs'] });
    if (r.score !== roundScore(r.measuredCm, r.targetCm)) ctx.addIssue({ code: 'custom', message: 'Skor ronde tidak sesuai rumus', path: ['rounds', i, 'score'] });
  });
  if (g.totalScore !== g.rounds.reduce((s, r) => s + r.score, 0)) ctx.addIssue({ code: 'custom', message: 'Total skor tidak sesuai', path: ['totalScore'] });
});

export const ratingEventSchema = z.object({
  ...base,
  type: z.literal('rating'),
  eventId,
  ageMs: z.int().min(0).max(7 * 86400000),
  stars: z.int().min(1).max(5),
  sessionEventId: eventId.nullable(),
});

export const deviceEventSchema = z.discriminatedUnion('type', [gameEventSchema, ratingEventSchema]);

export const heartbeatSchema = z.object({
  ...base,
  fw: z.string().max(32),
  uptimeS: z.int().min(0),
  rssi: z.int().min(-127).max(0).nullable(),
  ip: z.string().max(45).nullable(),
  heap: z.int().min(0).nullable(),
  queue: z.int().min(0).max(64),
  dropped: z.int().min(0),
});

export const telemetrySchema = z.object({
  ...base,
  state: z.enum(STATES),
  menuIndex: z.int().min(0).max(2),
  practice: z.boolean(),
  round: z.int().min(0).max(ROUNDS),
  targetCm: z.int().min(5).max(50).nullable(),
  remainingMs: z.int().min(0).max(120000).nullable(),
  results: z.array(roundSchema).max(ROUNDS),
  totalScore: z.int().min(0).max(ROUNDS * 100).nullable(),
  stars: z.int().min(0).max(5),
  notice: z.enum(['NO_READING', 'PICK_STAR']).nullable(),
  rated: z.boolean(),
  sessionEventId: eventId.nullable(),
  ratingEventId: eventId.nullable(),
  ratingStatus: z.enum(['pending', 'acked', 'rejected']).nullable(),
  distanceCm: z.number().min(0).max(400).nullable(),
  sensorError: z.string().max(24).nullable(),
  touch: z.boolean(),
  touchStuck: z.boolean(),
  muted: z.boolean(),
  queue: z.int().min(0).max(64),
});

export const settingsSchema = z.object({
  mode: z.enum(MODES),
  targetMinCm: z.int().min(5).max(50),
  targetMaxCm: z.int().min(5).max(50),
  countdownMs: z.int().min(1000).max(10000),
  roundMs: z.int().min(3000).max(30000),
  muted: z.boolean(),
}).refine((s) => s.targetMaxCm - s.targetMinCm >= 4, { message: 'Rentang target minimal 5 cm (maks − min ≥ 4)', path: ['targetMaxCm'] });

export type GameEvent = z.infer<typeof gameEventSchema>;
export type RatingEvent = z.infer<typeof ratingEventSchema>;
export type DeviceEvent = z.infer<typeof deviceEventSchema>;
export type Heartbeat = z.infer<typeof heartbeatSchema>;
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'demo', targetMinCm: 10, targetMaxCm: 30, countdownMs: 3000, roundMs: 10000, muted: false,
};

/** Bentuk data yang dibaca browser dari /api/devices dan event Socket.IO "device". */
export interface DeviceView {
  id: string;
  source: Mode;
  online: boolean;
  lastSeen: string | null; // ISO UTC
  heartbeat: Omit<Heartbeat, 'v' | 'deviceId' | 'mode'> | null;
  telemetry: (Omit<Telemetry, 'v' | 'deviceId' | 'mode'> & { at: string }) | null;
  errors: { at: string; message: string }[];
}

/** Baris leaderboard (server → browser). */
export interface LeaderRow {
  rank: number;
  id: number;
  eventId: string;
  playerNo: number;
  nickname: string | null;
  totalScore: number;
  durationMs: number;
  finishedAt: string;
  deviceId: string;
  rounds: { round: number; targetCm: number; measuredCm: number | null; score: number; lockMs: number | null }[];
}
