// Migrasi v1 (3 ronde, maks 300) → v2 (5 ronde, maks 500): data lama tetap utuh dan terbaca dashboard.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, expect, it } from 'vitest';
import { roundScore } from '../../shared/src/game.ts';
import { MIGRATIONS, openDb } from '../src/db.ts';

const dir = mkdtempSync(join(tmpdir(), 'tq-mig-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('sesi 3 ronde lama tetap terbaca; sesi 5 ronde (500) bisa disimpan; cascade tetap jalan', () => {
  const path = join(dir, 'old.db');
  const v1 = new DatabaseSync(path);
  v1.exec(MIGRATIONS[0]);
  v1.exec(`PRAGMA user_version = 1;
    INSERT INTO devices VALUES ('SIM-01', 'demo', '2026-11-15T01:00:00Z', '2026-11-15T01:00:00Z', NULL, NULL);
    INSERT INTO game_sessions VALUES (1, 'evt-old-3-ronde', 'SIM-01', 'demo', 1, 'Lama', 300, 3000, '2026-11-15T01:00:00Z', '2026-11-15T01:00:00Z');
    INSERT INTO game_rounds VALUES (1, 1, 10, 10, 100, 1000), (1, 2, 20, 20, 100, 1000), (1, 3, 30, 30, 100, 1000);`);
  v1.close();

  const db = openDb(path);
  expect(db.leaderboard('demo')).toMatchObject([{ eventId: 'evt-old-3-ronde', totalScore: 300, nickname: 'Lama', rounds: [{ round: 1 }, { round: 2 }, { round: 3 }] }]);
  const rounds = [[10, 10], [20, 20.5], [30, 30], [15, 15], [25, 25.9]].map(([t, m], i) => ({ round: i + 1, targetCm: t, measuredCm: m, score: roundScore(m, t), lockMs: 1000 }));
  db.insertGame({ v: 1, type: 'game', deviceId: 'SIM-01', mode: 'demo', eventId: 'evt-new-5-ronde', ageMs: 0, roundMs: 10000, rounds, totalScore: 500 }, new Date());
  expect(db.leaderboard('demo').map((r) => [r.totalScore, r.rounds.length])).toEqual([[500, 5], [300, 3]]);
  expect(db.resetDemo()).toEqual({ ratings: 0, sessions: 2 });
  db.close();
  const raw = new DatabaseSync(path);
  expect(raw.prepare('SELECT COUNT(*) AS n FROM game_rounds').get()).toEqual({ n: 0 });
  expect(raw.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
  raw.close();
});
