import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SETTINGS, settingsSchema, type GameEvent, type LeaderRow, type Mode, type RatingEvent, type Settings } from '../../shared/src/schema.ts';

// Tambahkan migrasi baru di akhir array; jangan ubah yang sudah ada.
export const MIGRATIONS = [
  `CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL CHECK (source IN ('demo','live')),
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    fw TEXT,
    ip TEXT
  );
  CREATE TABLE game_sessions (
    id INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL REFERENCES devices(id),
    mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
    player_no INTEGER NOT NULL,
    nickname TEXT,
    total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 300),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    finished_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE (mode, player_no)
  );
  CREATE INDEX idx_games_rank ON game_sessions (mode, total_score DESC, duration_ms, finished_at, id);
  CREATE TABLE game_rounds (
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 3),
    target_cm INTEGER NOT NULL,
    measured_cm REAL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    lock_ms INTEGER,
    PRIMARY KEY (session_id, round)
  );
  CREATE TABLE ratings (
    id INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL REFERENCES devices(id),
    mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    session_event_id TEXT,
    created_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  CREATE INDEX idx_ratings_time ON ratings (mode, created_at);
  CREATE TABLE device_log (
    id INTEGER PRIMARY KEY,
    device_id TEXT NOT NULL,
    at TEXT NOT NULL,
    message TEXT NOT NULL
  );
  CREATE INDEX idx_device_log ON device_log (device_id, id);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2: ProxiRush 5 ronde (skor maks 500). SQLite tidak bisa mengubah CHECK, jadi tabel dibangun ulang.
  // Sesi lama 3 ronde disalin apa adanya (tidak dikonversi).
  `CREATE TABLE game_sessions_v2 (
    id INTEGER PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL REFERENCES devices(id),
    mode TEXT NOT NULL CHECK (mode IN ('demo','live')),
    player_no INTEGER NOT NULL,
    nickname TEXT,
    total_score INTEGER NOT NULL CHECK (total_score BETWEEN 0 AND 500),
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    finished_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    UNIQUE (mode, player_no)
  );
  INSERT INTO game_sessions_v2 SELECT * FROM game_sessions;
  DROP TABLE game_sessions;
  ALTER TABLE game_sessions_v2 RENAME TO game_sessions;
  CREATE INDEX idx_games_rank ON game_sessions (mode, total_score DESC, duration_ms, finished_at, id);
  CREATE TABLE game_rounds_v2 (
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 5),
    target_cm INTEGER NOT NULL,
    measured_cm REAL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    lock_ms INTEGER,
    PRIMARY KEY (session_id, round)
  );
  INSERT INTO game_rounds_v2 SELECT * FROM game_rounds;
  DROP TABLE game_rounds;
  ALTER TABLE game_rounds_v2 RENAME TO game_rounds;`,
];

const RANK_ORDER = 'total_score DESC, duration_ms ASC, finished_at ASC, id ASC';
const ROUNDS_JSON = `(SELECT json_group_array(json_object('round', round, 'targetCm', target_cm, 'measuredCm', measured_cm, 'score', score, 'lockMs', lock_ms))
  FROM (SELECT * FROM game_rounds r WHERE r.session_id = g.id ORDER BY round))`;

type Row = Record<string, unknown>;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // Foreign key dimatikan selama migrasi: DROP TABLE saat membangun ulang tabel tidak boleh memicu cascade delete.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 3000;');

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const get = (sql: string, ...p: (string | number | null)[]) => db.prepare(sql).get(...p) as Row | undefined;
  const all = (sql: string, ...p: (string | number | null)[]) => db.prepare(sql).all(...p) as Row[];
  const run = (sql: string, ...p: (string | number | null)[]) => db.prepare(sql).run(...p);

  const version = Number(get('PRAGMA user_version')?.user_version ?? 0);
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  db.exec('PRAGMA foreign_keys = ON;');

  const toLeader = (r: Row): LeaderRow => ({
    rank: Number(r.rank), id: Number(r.id), eventId: String(r.event_id), playerNo: Number(r.player_no),
    nickname: (r.nickname as string | null) ?? null, totalScore: Number(r.total_score), durationMs: Number(r.duration_ms),
    finishedAt: String(r.finished_at), deviceId: String(r.device_id), rounds: JSON.parse(String(r.rounds)),
  });
  const leaderSql = (where: string) => `SELECT * FROM (
      SELECT g.*, ${ROUNDS_JSON} AS rounds, ROW_NUMBER() OVER (ORDER BY ${RANK_ORDER}) AS rank
      FROM game_sessions g WHERE mode = ?) ${where}`;

  return {
    close: () => db.close(),
    path,

    touchDevice(id: string, source: Mode, at: string, fw: string | null = null, ip: string | null = null) {
      run(`INSERT INTO devices (id, source, first_seen, last_seen, fw, ip) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen, fw = COALESCE(excluded.fw, fw), ip = COALESCE(excluded.ip, ip)`,
      id, source, at, at, fw, ip);
    },
    devices: () => all('SELECT id, source, last_seen AS lastSeen, fw, ip FROM devices ORDER BY last_seen DESC') as { id: string; source: Mode; lastSeen: string; fw: string | null; ip: string | null }[],

    log(deviceId: string, message: string, at = new Date().toISOString()) {
      const { lastInsertRowid } = run('INSERT INTO device_log (device_id, at, message) VALUES (?, ?, ?)', deviceId, at, message);
      run('DELETE FROM device_log WHERE id <= ?', Number(lastInsertRowid) - 1000); // simpan 1000 log terakhir
    },
    logs: (deviceId: string, limit = 20) =>
      all('SELECT at, message FROM device_log WHERE device_id = ? ORDER BY id DESC LIMIT ?', deviceId, limit) as { at: string; message: string }[],

    /** Idempoten: eventId yang sama tidak pernah menambah record. */
    insertGame(e: GameEvent, receivedAt: Date) {
      const dup = get('SELECT id FROM game_sessions WHERE event_id = ?', e.eventId);
      if (dup) return { status: 'duplicate' as const, id: Number(dup.id) };
      const durationMs = e.rounds.reduce((s, r) => s + (r.lockMs ?? e.roundMs), 0);
      const id = tx(() => {
        this.touchDevice(e.deviceId, e.mode, receivedAt.toISOString());
        const playerNo = Number(get('SELECT COALESCE(MAX(player_no), 0) + 1 AS n FROM game_sessions WHERE mode = ?', e.mode)?.n);
        const { lastInsertRowid } = run(`INSERT INTO game_sessions (event_id, device_id, mode, player_no, total_score, duration_ms, finished_at, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, e.eventId, e.deviceId, e.mode, playerNo, e.totalScore, durationMs,
        new Date(receivedAt.getTime() - e.ageMs).toISOString(), receivedAt.toISOString());
        const sid = Number(lastInsertRowid);
        for (const r of e.rounds) {
          run('INSERT INTO game_rounds (session_id, round, target_cm, measured_cm, score, lock_ms) VALUES (?, ?, ?, ?, ?, ?)',
            sid, r.round, r.targetCm, r.measuredCm, r.score, r.lockMs);
        }
        return sid;
      });
      return { status: 'created' as const, id };
    },

    insertRating(e: RatingEvent, receivedAt: Date) {
      const dup = get('SELECT id FROM ratings WHERE event_id = ?', e.eventId);
      if (dup) return { status: 'duplicate' as const, id: Number(dup.id) };
      const id = tx(() => {
        this.touchDevice(e.deviceId, e.mode, receivedAt.toISOString());
        return Number(run(`INSERT INTO ratings (event_id, device_id, mode, stars, session_event_id, created_at, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, e.eventId, e.deviceId, e.mode, e.stars, e.sessionEventId,
        new Date(receivedAt.getTime() - e.ageMs).toISOString(), receivedAt.toISOString()).lastInsertRowid);
      });
      return { status: 'created' as const, id };
    },

    leaderboard: (mode: Mode, limit = 50) => all(leaderSql('ORDER BY rank LIMIT ?'), mode, limit).map(toLeader),
    session(mode: Mode, id: number) {
      const r = get(leaderSql('WHERE id = ?'), mode, id);
      return r ? toLeader(r) : null;
    },

    setNickname(id: number, nickname: string | null) {
      return run('UPDATE game_sessions SET nickname = ? WHERE id = ?', nickname, id).changes > 0;
    },

    overview(mode: Mode) {
      const s = get(`SELECT (SELECT COUNT(*) FROM game_sessions WHERE mode = ?1) AS sessions,
        (SELECT COUNT(*) FROM ratings WHERE mode = ?1) AS ratings,
        (SELECT AVG(stars) FROM ratings WHERE mode = ?1) AS avgStars`, mode)!;
      const recent = all(`SELECT * FROM (
          SELECT 'game' AS kind, id, finished_at AS at, total_score AS value, player_no AS playerNo, nickname FROM game_sessions WHERE mode = ?1
          UNION ALL SELECT 'rating', id, created_at, stars, NULL, NULL FROM ratings WHERE mode = ?1)
        ORDER BY at DESC LIMIT 8`, mode);
      return {
        sessions: Number(s.sessions), ratings: Number(s.ratings),
        avgStars: s.avgStars === null ? null : Number(s.avgStars),
        top: this.leaderboard(mode, 3),
        recent,
      };
    },

    reviews(mode: Mode) {
      const s = get('SELECT COUNT(*) AS n, AVG(stars) AS avg FROM ratings WHERE mode = ?', mode)!;
      const counts = new Map(all('SELECT stars, COUNT(*) AS n FROM ratings WHERE mode = ? GROUP BY stars', mode).map((r) => [Number(r.stars), Number(r.n)]));
      // WIB = UTC+7 tanpa daylight saving, jadi offset tetap aman dipakai di SQL.
      const trend = all(`SELECT strftime('%Y-%m-%d %H:00', created_at, '+7 hours') AS bucket, COUNT(*) AS count, ROUND(AVG(stars), 2) AS avg
        FROM ratings WHERE mode = ? GROUP BY bucket ORDER BY bucket DESC LIMIT 48`, mode).reverse();
      return {
        count: Number(s.n),
        avg: s.avg === null ? null : Number(s.avg),
        distribution: [1, 2, 3, 4, 5].map((stars) => ({ stars, count: counts.get(stars) ?? 0 })),
        trend,
        recent: all('SELECT id, stars, session_event_id AS sessionEventId, created_at AS createdAt, device_id AS deviceId FROM ratings WHERE mode = ? ORDER BY created_at DESC, id DESC LIMIT 50', mode),
      };
    },

    settings(): Settings {
      const stored = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, JSON.parse(String(r.value))]));
      const merged = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });
      return merged.success ? merged.data : DEFAULT_SETTINGS;
    },
    saveSettings(s: Settings) {
      tx(() => {
        for (const [k, v] of Object.entries(s)) run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
      });
    },

    /** Hanya data mode demo. Record live tidak pernah tersentuh. */
    resetDemo() {
      return tx(() => ({
        ratings: Number(run("DELETE FROM ratings WHERE mode = 'demo'").changes),
        sessions: Number(run("DELETE FROM game_sessions WHERE mode = 'demo'").changes),
      }));
    },

    gamesForExport: (mode: Mode) => all(`SELECT g.id, g.player_no, g.nickname, g.total_score, g.duration_ms, g.finished_at, g.device_id, g.event_id,
        r.round, r.target_cm, r.measured_cm, r.score, r.lock_ms
      FROM game_sessions g JOIN game_rounds r ON r.session_id = g.id WHERE g.mode = ? ORDER BY g.id, r.round`, mode),
    ratingsForExport: (mode: Mode) => all('SELECT id, stars, created_at, device_id, session_event_id, event_id FROM ratings WHERE mode = ? ORDER BY id', mode),
  };
}

export type Db = ReturnType<typeof openDb>;
