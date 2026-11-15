// Simulator perangkat untuk Demo Mode. Menjalankan logika yang sama dengan firmware (shared/src/game.ts)
// dan berbicara ke server lewat kontrak event yang sama. Identitas SIM-01, mode "demo" — tidak pernah menyamar sebagai alat fisik.
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_CONFIG, Machine, SCHEMA_VERSION, TouchClassifier, quantizeCm,
  type Action, type Beep, type GameConfig, type Snapshot,
} from '../../../shared/src/game.ts';

export const SIM_ID = 'SIM-01';
const QUEUE_MAX = 12; // sama dengan firmware
const FW = 'sim-3.0.0';

export type QStatus = 'pending' | 'acked' | 'rejected' | 'dropped';
export interface Queued { eventId: string; kind: 'game' | 'rating'; body: Record<string, unknown>; createdAt: number; status: QStatus; attempts: number; nextAt: number; error: string | null }
export interface SimView {
  running: boolean;
  snap: Snapshot;
  distanceCm: number;
  reading: number | null;
  sensorFault: boolean;
  offline: boolean;
  pressed: boolean;
  queue: Queued[];
  pending: number;
  dropped: number;
  netError: string | null;
}

// Nada (Hz, ms) — tabel yang sama dipakai firmware (firmware/src/main.cpp).
export const TONES: Record<Beep, [number, number][]> = {
  nav: [[880, 40]],
  confirm: [[660, 60], [990, 90]],
  tick: [[740, 90]],
  go: [[1175, 250]],
  lock: [[1320, 90]],
  timeout: [[220, 320]],
  finish: [[523, 110], [659, 110], [784, 110], [1047, 260]],
  error: [[180, 180]],
};

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

class Simulator {
  distanceCm = 20;
  sensorFault = false;
  offline = false;
  muted = false;
  private boot = hex(4);
  private seq = 0;
  private machine = new Machine(DEFAULT_CONFIG, (n) => Math.floor(Math.random() * n), () => `${SIM_ID}-${this.boot}-${++this.seq}`);
  private touch = new TouchClassifier();
  private raw = false;
  private startedAt = Date.now();
  private timer: number | null = null;
  private queue: Queued[] = [];
  private dropped = 0;
  private busy = { events: false, telemetry: false, heartbeat: false };
  private lastTelemetry = 0;
  private lastHeartbeat = 0;
  private lastState = '';
  private nextCfg: GameConfig | null = null;
  private netError: string | null = null;
  private audio: AudioContext | null = null;
  private listeners = new Set<() => void>();
  private lastNotify = 0;
  private view: SimView = this.build(Date.now());

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getView = () => this.view;

  start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.loop(), 20);
    this.lastHeartbeat = 0;
    this.notify(true);
  }
  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.raw = false;
    this.notify(true);
  }
  /** Konfigurasi dari server diterapkan hanya saat IDLE agar permainan berjalan tidak berubah di tengah. */
  configure(cfg: GameConfig, muted: boolean) {
    this.nextCfg = cfg;
    this.muted = muted;
  }
  press(down: boolean) {
    this.unlockAudio();
    this.raw = down;
    this.notify(true);
  }
  /** Tombol pintas: sentuhan singkat (120 ms) atau tahan (1,4 dtk) — tetap melewati classifier yang sama. */
  pulse(ms: number) {
    this.press(true);
    window.setTimeout(() => this.press(false), ms);
  }
  set(patch: Partial<Pick<Simulator, 'distanceCm' | 'sensorFault' | 'offline'>>) {
    Object.assign(this, patch);
    this.notify(true);
  }

  private reading(): number | null {
    return this.sensorFault ? null : quantizeCm(this.distanceCm);
  }

  private loop() {
    const now = Date.now();
    if (this.nextCfg && this.machine.state === 'IDLE') {
      this.machine.cfg = this.nextCfg;
      this.nextCfg = null;
    }
    const ev = this.touch.sample(now, this.raw);
    if (ev) this.handle(this.machine.input(now, ev, this.reading()));
    this.handle(this.machine.tick(now));
    const changed = this.machine.state !== this.lastState;
    if (!this.offline) {
      void this.flush();
      if (now - this.lastHeartbeat >= 5000) void this.heartbeat(now);
      if (changed || now - this.lastTelemetry >= 300) void this.telemetry(now);
    }
    this.lastState = this.machine.state;
    this.notify(changed);
  }

  private handle(actions: Action[]) {
    for (const a of actions) {
      if (a.type === 'beep') this.beep(a.beep);
      else {
        const { type, eventId, ...rest } = a;
        const pending = this.queue.filter((q) => q.status === 'pending');
        if (pending.length >= QUEUE_MAX) {
          pending[0].status = 'dropped'; // antrean penuh: event tertua hilang dan dihitung
          this.dropped++;
        }
        this.queue.push({
          eventId, kind: type, createdAt: Date.now(), status: 'pending', attempts: 0, nextAt: 0, error: null,
          body: { v: SCHEMA_VERSION, deviceId: SIM_ID, mode: 'demo', type, eventId, ...rest },
        });
        this.queue = this.queue.filter((q, i) => q.status === 'pending' || i >= this.queue.length - 12);
      }
    }
  }

  private async send(path: string, body: unknown) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json().catch(() => null);
    const error = (data?.error as string | undefined) ?? null;
    if (res.status === 401 || res.status === 409) {
      // Logout atau Mode LIVE: simulator berhenti agar tidak membanjiri server. Antrean event tetap disimpan.
      this.stop();
      this.netError = error;
    }
    return { status: res.status, error };
  }

  private async flush() {
    if (this.busy.events) return;
    const q = this.queue.find((e) => e.status === 'pending' && e.nextAt <= Date.now());
    if (!q) return;
    this.busy.events = true;
    try {
      const r = await this.send('/api/device/events', { ...q.body, ageMs: Date.now() - q.createdAt });
      if (r.status < 300) {
        q.status = 'acked';
        q.error = null;
      } else if (r.status >= 400 && r.status < 500 && ![401, 408, 409, 429].includes(r.status)) {
        q.status = 'rejected'; // payload salah: jangan diulang selamanya
        q.error = r.error ?? `HTTP ${r.status}`;
      } else {
        throw new Error(r.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      q.attempts++;
      q.nextAt = Date.now() + Math.min(30000, 1000 * 2 ** (q.attempts - 1)); // backoff 1, 2, 4 … 30 dtk, ID tetap sama
      q.error = (e as Error).name === 'TimeoutError' ? 'Timeout' : (e as Error).message;
    } finally {
      this.busy.events = false;
      this.notify(true);
    }
  }

  private async heartbeat(now: number) {
    if (this.busy.heartbeat) return;
    this.busy.heartbeat = true;
    this.lastHeartbeat = now;
    try {
      const r = await this.send('/api/device/heartbeat', {
        v: SCHEMA_VERSION, deviceId: SIM_ID, mode: 'demo', fw: FW, uptimeS: Math.floor((now - this.startedAt) / 1000),
        rssi: null, ip: null, heap: null, queue: this.pendingCount(), dropped: this.dropped,
      });
      this.netError = r.status < 300 ? null : r.error;
    } catch {
      this.netError = 'Server tidak dapat dihubungi';
    } finally {
      this.busy.heartbeat = false;
    }
  }

  private async telemetry(now: number) {
    if (this.busy.telemetry) return;
    this.busy.telemetry = true;
    this.lastTelemetry = now;
    const snap = this.machine.snapshot(now);
    try {
      const r = await this.send('/api/device/telemetry', {
        v: SCHEMA_VERSION, deviceId: SIM_ID, mode: 'demo', ...snap,
        ratingStatus: this.statusOf(snap.ratingEventId),
        distanceCm: this.reading(), sensorError: this.sensorFault ? 'TIMEOUT' : null,
        touch: this.touch.pressed, touchStuck: this.touch.heldMs(now) > 15000, muted: this.muted, queue: this.pendingCount(),
      });
      if (r.status >= 300) this.netError = r.error;
    } catch {
      this.netError = 'Server tidak dapat dihubungi';
    } finally {
      this.busy.telemetry = false;
    }
  }

  private statusOf(eventId: string | null) {
    const s = this.queue.find((q) => q.eventId === eventId)?.status;
    return s === 'acked' || s === 'rejected' || s === 'pending' ? s : null;
  }
  private pendingCount() {
    return this.queue.filter((q) => q.status === 'pending').length;
  }

  private unlockAudio() {
    try {
      this.audio ??= new AudioContext();
      if (this.audio.state === 'suspended') void this.audio.resume();
    } catch {
      this.audio = null; // audio tidak tersedia: simulasi tetap jalan tanpa suara
    }
  }
  private beep(b: Beep) {
    if (this.muted || !this.audio) return;
    let t = this.audio.currentTime;
    for (const [hz, ms] of TONES[b]) {
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.type = 'square';
      o.frequency.value = hz;
      g.gain.value = 0.04;
      o.connect(g).connect(this.audio.destination);
      o.start(t);
      o.stop(t + ms / 1000);
      t += ms / 1000 + 0.02;
    }
  }

  private build(now: number): SimView {
    return {
      running: this.timer !== null,
      snap: this.machine.snapshot(now),
      distanceCm: this.distanceCm,
      reading: this.reading(),
      sensorFault: this.sensorFault,
      offline: this.offline,
      pressed: this.raw,
      queue: this.queue.slice(-8).reverse(),
      pending: this.pendingCount(),
      dropped: this.dropped,
      netError: this.offline ? null : this.netError,
    };
  }
  private notify(force = false) {
    const now = Date.now();
    if (!force && now - this.lastNotify < 100) return;
    this.lastNotify = now;
    this.view = this.build(now);
    this.listeners.forEach((fn) => fn());
  }
}

export const sim = new Simulator();
export const useSim = () => useSyncExternalStore(sim.subscribe, sim.getView);
