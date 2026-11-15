import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import type { DeviceView, LeaderRow, Mode, Settings } from '../../../shared/src/schema.ts';

export interface GameMsg { mode: Mode; session: LeaderRow; at: number }
export interface RatingMsg { mode: Mode; eventId: string; stars: number; sessionEventId: string | null; at: number }

interface LiveState {
  connected: boolean;
  devices: Record<string, DeviceView>;
  settings: Settings | null;
  operator: boolean;
  version: number; // naik setiap ada data baru → useApi memuat ulang snapshot
  lastGame: GameMsg | null;
  lastRating: RatingMsg | null;
  setOperator: (v: boolean) => void;
  setSettings: (s: Settings) => void;
}

const Ctx = createContext<LiveState | null>(null);

const getJson = <T,>(path: string) => fetch(path, { credentials: 'same-origin' }).then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r.status)));

export function LiveProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Record<string, DeviceView>>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [operator, setOperator] = useState(false);
  const [version, setVersion] = useState(0);
  const [lastGame, setLastGame] = useState<GameMsg | null>(null);
  const [lastRating, setLastRating] = useState<RatingMsg | null>(null);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    // Setelah (re)connect, ambil ulang seluruh snapshot dari server: event yang terlewat saat putus tidak hilang.
    const snapshot = () => {
      getJson<DeviceView[]>('/api/devices').then((list) => setDevices(Object.fromEntries(list.map((d) => [d.id, d]))), () => {});
      getJson<Settings>('/api/settings').then(setSettings, () => {});
      getJson<{ operator: boolean }>('/api/auth/me').then((d) => setOperator(d.operator), () => {});
      bump();
    };
    const s = io({ transports: ['websocket', 'polling'] });
    s.on('connect', () => {
      setConnected(true);
      snapshot();
    });
    s.on('disconnect', () => setConnected(false));
    s.on('device', (d: DeviceView) => setDevices((m) => ({ ...m, [d.id]: d })));
    s.on('settings', (st: Settings) => {
      setSettings(st);
      bump();
    });
    s.on('game', (g: Omit<GameMsg, 'at'>) => {
      setLastGame({ ...g, at: Date.now() });
      bump();
    });
    s.on('rating', (r: Omit<RatingMsg, 'at'>) => {
      setLastRating({ ...r, at: Date.now() });
      bump();
    });
    s.on('data', bump);
    return () => {
      s.close();
    };
  }, []);

  const value = useMemo(
    () => ({ connected, devices, settings, operator, version, lastGame, lastRating, setOperator, setSettings }),
    [connected, devices, settings, operator, version, lastGame, lastRating],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLive() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLive harus di dalam LiveProvider');
  return v;
}

export const useMode = (): Mode => useLive().settings?.mode ?? 'demo';

/** Perangkat yang relevan untuk mode aktif: ESP8266 (LIVE) atau SIM-01 (DEMO). */
export function useActiveDevice(): DeviceView | null {
  const { devices } = useLive();
  const mode = useMode();
  return useMemo(
    () => Object.values(devices)
      .filter((d) => d.source === mode)
      .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))[0] ?? null,
    [devices, mode],
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
