// Kontrak firmware ↔ server: payload yang benar-benar dibentuk kode firmware (payload.h) harus lolos skema Zod server.
// Butuh g++ dan ArduinoJson hasil `pio run -d firmware` (folder .pio). Bila tidak ada, test dilewati dengan alasan jelas.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { deviceEventSchema, heartbeatSchema, telemetrySchema } from '../../shared/src/schema.ts';

const AJ = 'firmware/.pio/libdeps/nodemcuv2/ArduinoJson/src';
const ready = existsSync(`${AJ}/ArduinoJson.h`) && spawnSync('g++', ['--version']).status === 0;
const SCHEMA: Record<string, z.ZodType> = { telemetry: telemetrySchema, game: deviceEventSchema, rating: deviceEventSchema, heartbeat: heartbeatSchema };

function dump(): [string, unknown][] {
  mkdirSync('data', { recursive: true });
  execFileSync('g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-Ifirmware/include', `-I${AJ}`, 'firmware/test/payload_dump.cpp', '-o', 'data/payload_dump']);
  return execFileSync('./data/payload_dump').toString().trim().split('\n').map((l) => {
    const [kind, json] = l.split('\t');
    return [kind, JSON.parse(json)];
  });
}

describe.skipIf(!ready)('kontrak payload firmware ↔ server (jalankan `npm run fw:build` sekali bila dilewati)', () => {
  const lines = ready ? dump() : [];

  it('mencakup telemetry, game, rating, dan heartbeat', () => {
    expect(lines.map(([k]) => k)).toEqual(['telemetry', 'telemetry', 'telemetry', 'game', 'telemetry', 'rating', 'rating', 'heartbeat', 'heartbeat']);
  });

  it.each(lines.map(([k, body], i) => [`${i + 1}. ${k}`, k, body] as const))('%s lolos skema server', (_label, kind, body) => {
    const r = SCHEMA[kind].safeParse(body);
    expect(r.success, JSON.stringify(r.error?.issues.map((x) => `${x.path.join('.')}: ${x.message}`))).toBe(true);
  });

  it('field null tetap dikirim eksplisit (bukan hilang)', () => {
    const idle = lines[0][1] as Record<string, unknown>;
    for (const k of ['sessionEventId', 'ratingEventId', 'distanceCm', 'targetCm', 'remainingMs', 'totalScore', 'notice', 'ratingStatus']) {
      expect(idle, k).toHaveProperty(k, null);
    }
    const game = lines[3][1] as { rounds: { measuredCm: number | null }[] };
    expect(game.rounds.map((r) => r.measuredCm === null)).toEqual([false, false, true]);
  });
});
