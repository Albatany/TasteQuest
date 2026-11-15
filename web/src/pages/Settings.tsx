import { useEffect, useState, type FormEvent } from 'react';
import type { Mode, Settings as S } from '../../../shared/src/schema.ts';
import { HmifLogo, Icon, Loading, ModeBadge, Panel } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { useLive } from '../lib/live.tsx';

export function Settings() {
  const { operator, settings } = useLive();
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {!operator ? <Login /> : !settings ? <Loading /> : (
        <>
          <ModePanel settings={settings} />
          <GamePanel settings={settings} />
          <DataPanel mode={settings.mode} />
          <Logout />
        </>
      )}
      <About />
    </div>
  );
}

function Login() {
  const { setOperator } = useLive();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { password } });
      setOperator(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Login operator" icon="lock" tone="frame-gold">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="op-pass" className="text-sm font-semibold text-ink-100">Password operator</label>
        <input id="op-pass" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error} aria-describedby={error ? 'op-err' : 'op-help'}
          className="min-h-11 border-2 border-ink-600 bg-ink-950 px-3 text-ink-50" />
        {error ? <p id="op-err" role="alert" className="text-sm text-bad">{error}</p> : <p id="op-help" className="text-xs text-ink-300">Lihat OPERATOR_PASSWORD di file .env laptop server.</p>}
        <button type="submit" disabled={busy || !password} className="px-btn self-start"><Icon name="login" className="size-4" />{busy ? 'Memeriksa…' : 'Masuk'}</button>
      </form>
    </Panel>
  );
}

async function save(next: S) {
  await api('/api/settings', { method: 'PUT', body: next });
}

function ModePanel({ settings }: { settings: S }) {
  const [error, setError] = useState<string | null>(null);
  const switchTo = async (mode: Mode) => {
    const msg = mode === 'live'
      ? 'Ganti ke Mode LIVE? Dashboard & kiosk akan menampilkan data ESP8266 fisik dan simulator dinonaktifkan.'
      : 'Ganti ke Mode DEMO? Dashboard & kiosk akan menampilkan data simulator. Data live tetap aman.';
    if (!window.confirm(msg)) return;
    try {
      await save({ ...settings, mode });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Panel title="Mode data" icon="server" action={<ModeBadge mode={settings.mode} />}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(['demo', 'live'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={settings.mode === m} onClick={() => settings.mode !== m && switchTo(m)}
            className={`flex flex-col items-start gap-1 p-4 text-left ${settings.mode === m ? 'px-frame-gold' : 'px-frame-inset hover:brightness-125'}`}>
            <span className="font-pixel text-xl text-gold-400">{m === 'demo' ? 'DEMO' : 'LIVE'}</span>
            <span className="text-sm text-ink-200">{m === 'demo' ? 'Simulator di browser untuk uji coba dan presentasi tanpa alat.' : 'Data asli dari ESP8266. Kalau alat mati, dashboard menampilkan OFFLINE.'}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-300">Data DEMO dan LIVE disimpan terpisah, begitu juga statistik dan leaderboard-nya.</p>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </Panel>
  );
}

function GamePanel({ settings }: { settings: S }) {
  const toForm = (s: S) => ({ min: s.targetMinCm, max: s.targetMaxCm, countdown: s.countdownMs / 1000, round: s.roundMs / 1000, muted: s.muted });
  const [f, setF] = useState(() => toForm(settings));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setF(toForm(settings)), [settings]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save({ ...settings, targetMinCm: f.min, targetMaxCm: f.max, countdownMs: Math.round(f.countdown * 1000), roundMs: Math.round(f.round * 1000), muted: f.muted });
      setMsg({ ok: true, text: 'Tersimpan. Alat memakai pengaturan baru mulai permainan berikutnya.' });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  };
  const num = (id: keyof typeof f, label: string, min: number, max: number, step: number, unit: string) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`g-${id}`} className="text-sm font-semibold text-ink-100">{label}</label>
      <div className="flex items-center gap-2">
        <input id={`g-${id}`} type="number" required min={min} max={max} step={step} value={f[id] as number}
          onChange={(e) => setF({ ...f, [id]: Number(e.target.value) })}
          className="min-h-11 w-28 border-2 border-ink-600 bg-ink-950 px-3 text-ink-50 tabular" />
        <span className="text-sm text-ink-300">{unit}</span>
      </div>
    </div>
  );
  return (
    <Panel title="Permainan ProxiRush" icon="gamepad">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          {num('min', 'Target minimum', 5, 50, 1, 'cm')}
          {num('max', 'Target maksimum', 5, 50, 1, 'cm')}
          {num('countdown', 'Hitung mundur', 1, 10, 1, 'detik')}
          {num('round', 'Batas waktu ronde', 3, 30, 1, 'detik')}
        </div>
        <p className="text-xs text-ink-300">Rentang target minimal 5 cm. Sesuaikan dengan hasil kalibrasi HC-SR04 (lihat docs/WIRING.md).</p>
        <label htmlFor="g-muted" className="flex min-h-11 items-center gap-3">
          <input id="g-muted" type="checkbox" checked={f.muted} onChange={(e) => setF({ ...f, muted: e.target.checked })} className="size-5 accent-gold-500" />
          <span className="font-semibold">Mute buzzer</span>
        </label>
        <button type="submit" className="px-btn self-start"><Icon name="check" className="size-4" />Simpan pengaturan</button>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
      </form>
    </Panel>
  );
}

function DataPanel({ mode }: { mode: Mode }) {
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const reset = async () => {
    try {
      const r = await api<{ removed: { sessions: number; ratings: number } }>('/api/admin/reset-demo', { body: { confirm } });
      setMsg({ ok: true, text: `Data demo dihapus: ${r.removed.sessions} sesi, ${r.removed.ratings} rating. Data live tidak disentuh.` });
      setConfirm('');
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };
  return (
    <Panel title="Data & ekspor" icon="download">
      <p className="mb-3 text-sm text-ink-200">Ekspor CSV untuk mode <b>{mode.toUpperCase()}</b> (UTF-8, waktu WIB):</p>
      <div className="flex flex-wrap gap-3">
        <a className="px-btn-ghost text-sm" href={`/api/export/games.csv?mode=${mode}`} download><Icon name="download" className="size-4" />Game & ronde</a>
        <a className="px-btn-ghost text-sm" href={`/api/export/ratings.csv?mode=${mode}`} download><Icon name="download" className="size-4" />Rating</a>
      </div>
      <div className="mt-6 border-t-2 border-ink-800 pt-4">
        <h3 className="text-base text-bad">Reset data demo</h3>
        <p className="mt-1 text-sm text-ink-200">Menghapus semua sesi dan rating mode DEMO, dan tidak bisa dibatalkan. Data LIVE tetap aman.</p>
        <label htmlFor="reset-confirm" className="mt-3 block text-sm font-semibold">Ketik <code className="bg-ink-800 px-1">RESET</code> untuk konfirmasi</label>
        <div className="mt-1 flex flex-wrap gap-3">
          <input id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off"
            className="min-h-11 w-40 border-2 border-ink-600 bg-ink-950 px-3 text-ink-50" />
          <button type="button" disabled={confirm !== 'RESET'} onClick={reset} className="px-btn-danger text-sm"><Icon name="trash" className="size-4" />Hapus data demo</button>
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${msg.ok ? 'text-ok' : 'text-bad'}`}>{msg.text}</p>}
      </div>
    </Panel>
  );
}

function Logout() {
  const { setOperator } = useLive();
  return (
    <Panel title="Sesi operator" icon="lock">
      <p className="mb-3 text-sm text-ink-200">Anda login sebagai operator. Logout sebelum meninggalkan laptop.</p>
      <button type="button" className="px-btn-ghost" onClick={async () => { await api('/api/auth/logout', { body: {} }).catch(() => {}); setOperator(false); }}>
        <Icon name="logout" className="size-4" />Logout
      </button>
    </Panel>
  );
}

function About() {
  return (
    <Panel title="Tentang TasteQuest" icon="infoBox" className="xl:col-span-2">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <HmifLogo className="h-20" />
        <div className="flex flex-col gap-1 text-sm text-ink-100">
          <p><b className="font-pixel text-gold-400">TasteQuest v3</b> berisi ProxiRush, permainan ketepatan jarak dengan sensor ultrasonik, dan Exhibition Rating untuk menilai karya. Hasilnya langsung tampil di dashboard ini.</p>
          <p>Alatnya memakai ESP8266 NodeMCU, sensor jarak HC-SR04, layar OLED SSD1306, sensor sentuh TTP223, dan buzzer. Semua berjalan di jaringan lokal tanpa cloud.</p>
          <p>Dibuat untuk pameran karya mata kuliah Informatika Universitas Jambi di HMIF UNJA × FST Market Day 2026.</p>
          <p className="font-pixel text-ink-50">© Muhammad Aziz Syah Dani 2026</p>
          <p className="text-xs text-ink-300">Logo HMIF diambil dari hmifunja.my.id. Ikon pixelarticons (MIT). Font Pixelify Sans, Press Start 2P, dan Plus Jakarta Sans (OFL), semuanya tersimpan lokal.</p>
        </div>
      </div>
    </Panel>
  );
}
