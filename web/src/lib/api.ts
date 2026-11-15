import { useEffect, useState } from 'react';
import { useLive } from './live.tsx';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiError('Server tidak dapat dihubungi. Pastikan laptop server menyala dan satu jaringan.', 0);
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const detail = data?.issues?.[0] ? ` (${data.issues[0].path}: ${data.issues[0].message})` : '';
    throw new ApiError((data?.error ?? `HTTP ${res.status}`) + detail, res.status);
  }
  return data as T;
}

/** GET yang otomatis dimuat ulang saat ada data baru dari Socket.IO. Data lama dipertahankan saat memuat ulang. */
export function useApi<T>(path: string) {
  const { version } = useLive();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path).then(
      (data) => alive && setState({ data, loading: false }),
      (e: Error) => alive && setState((s) => ({ data: s.data, error: e.message, loading: false })),
    );
    return () => {
      alive = false;
    };
  }, [path, version]);
  return state;
}

const TZ = 'Asia/Jakarta';
const timeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const timeWib = (iso: string) => `${timeFmt.format(new Date(iso))} WIB`;
export const dateTimeWib = (iso: string) => `${dateTimeFmt.format(new Date(iso))} WIB`;

export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return 'belum pernah';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'baru saja';
  if (s < 60) return `${s} detik lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return dateTimeWib(iso);
}

export const cm = (v: number | null | undefined) => (v === null || v === undefined ? 'tidak ada' : `${v.toFixed(1).replace('.', ',')} cm`);
export const num1 = (v: number | null | undefined) => (v === null || v === undefined ? 'belum ada' : v.toFixed(1).replace('.', ','));
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} dtk`;
export const playerName = (p: { playerNo: number; nickname: string | null }) => p.nickname || `Pemain #${p.playerNo}`;
