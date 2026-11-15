import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { STATES } from '../../../shared/src/game.ts';
import type { DeviceView } from '../../../shared/src/schema.ts';
import { Empty, Icon, ModeBadge, OnlineDot, Panel } from '../components/ui.tsx';
import { ago, cm, timeWib } from '../lib/api.ts';
import { useLive, useMode, useNow } from '../lib/live.tsx';
import { stateLabel } from './Overview.tsx';

const rssiQuality = (r: number) => (r >= -60 ? ['Sangat baik', 4] : r >= -70 ? ['Baik', 3] : r >= -80 ? ['Lemah', 2] : ['Buruk', 1]) as [string, number];
const SENSOR_ERR: Record<string, string> = {
  TIMEOUT: 'Tidak ada pantulan. Mungkin tidak ada benda di depan sensor, atau kabel ECHO dan pembagi tegangannya bermasalah',
  OUT_OF_RANGE: 'Di luar jangkauan baca (terlalu dekat < 2 cm atau terlalu jauh)',
  STALE: 'Data usang. Sensor tidak mengirim bacaan baru',
  OLED_NOT_FOUND: 'OLED tidak terdeteksi di I2C (cek SDA/SCL, alamat 0x3C/0x3D)',
};
const uptime = (s: number) => `${Math.floor(s / 3600)} j ${Math.floor((s % 3600) / 60)} m ${s % 60} d`;

export function DeviceMonitor() {
  const { devices } = useLive();
  const mode = useMode();
  const list = useMemo(
    () => Object.values(devices).sort((a, b) => Number(b.source === mode) - Number(a.source === mode) || Number(b.online) - Number(a.online) || a.id.localeCompare(b.id)),
    [devices, mode],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const device = list.find((d) => d.id === picked) ?? list[0] ?? null;

  if (!device) {
    return (
      <Panel>
        <Empty icon="cpu" title="Belum ada perangkat terdaftar">
          Perangkat muncul setelah mengirim heartbeat pertama. Untuk ESP8266, cek Wi-Fi, BACKEND_URL, dan DEVICE_TOKEN. Untuk demo, nyalakan simulator di ProxiRush Arena.
        </Empty>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {list.length > 1 && (
        <div role="tablist" aria-label="Pilih perangkat" className="flex flex-wrap gap-2">
          {list.map((d) => (
            <button key={d.id} type="button" role="tab" aria-selected={d === device} onClick={() => setPicked(d.id)}
              className={`flex items-center gap-2 ${d === device ? 'px-btn' : 'px-btn-ghost'} text-sm`}>
              {d.id} <span className="font-sans text-xs">({d.source === 'live' ? 'alat' : 'simulator'})</span>
            </button>
          ))}
        </div>
      )}
      <DevicePanels key={device.id} d={device} />
    </div>
  );
}

function DevicePanels({ d }: { d: DeviceView }) {
  const now = useNow(1000);
  const t = d.telemetry;
  const hb = d.heartbeat;
  const stale = d.online && t ? now - new Date(t.at).getTime() > 3000 : false;
  const [history, setHistory] = useState<{ i: number; time: string; d: number | null }[]>([]);
  useEffect(() => {
    if (!t) return;
    setHistory((h) => [...h.slice(-79), { i: (h.at(-1)?.i ?? 0) + 1, time: timeWib(t.at), d: t.distanceCm }]);
  }, [t]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Panel title={d.id} icon="cpu" tone={d.online ? 'frame-ok' : 'frame-bad'} action={<ModeBadge mode={d.source} />}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-ink-300">Status</dt><dd><OnlineDot online={d.online} /></dd>
          <dt className="text-ink-300">Heartbeat terakhir</dt><dd>{d.lastSeen ? <>{ago(d.lastSeen, now)}<br /><span className="text-ink-300">{timeWib(d.lastSeen)}</span></> : 'belum pernah'}</dd>
          <dt className="text-ink-300">Firmware</dt><dd className="font-mono">{hb?.fw ?? 'belum ada'}</dd>
          <dt className="text-ink-300">IP</dt><dd className="font-mono">{hb?.ip ?? 'belum ada'}</dd>
          <dt className="text-ink-300">Uptime</dt><dd className="tabular">{hb ? uptime(hb.uptimeS) : 'belum ada'}</dd>
          <dt className="text-ink-300">Heap bebas</dt><dd className="tabular">{hb?.heap != null ? `${(hb.heap / 1024).toFixed(1)} KB` : 'belum ada'}</dd>
          <dt className="text-ink-300">Antrean event</dt>
          <dd className="tabular">{hb ? <>{t?.queue ?? hb.queue} menunggu, <span className={hb.dropped ? 'text-bad' : ''}>{hb.dropped} hilang</span></> : 'belum ada'}</dd>
        </dl>
        <p className="mt-4 text-xs text-ink-300">Antrean ada di RAM perangkat: event yang belum terkirim hilang bila listrik mati.</p>
      </Panel>

      <Panel title="Wi-Fi" icon="wifi">
        {hb?.rssi == null ? (
          <p className="text-ink-300">{d.source === 'demo' ? 'Simulator tidak punya Wi-Fi, jadi tidak ada RSSI.' : 'Belum ada data RSSI.'}</p>
        ) : (() => {
          const [q, bars] = rssiQuality(hb.rssi);
          return (
            <div className="flex items-end gap-6">
              <div className="flex items-end gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((b) => <span key={b} className={`w-4 ${b <= bars ? (bars >= 3 ? 'bg-ok' : 'bg-warn') : 'bg-ink-700'}`} style={{ height: `${b * 14}px` }} />)}
              </div>
              <div>
                <div className="font-score text-3xl">{hb.rssi} <span className="font-sans text-lg text-ink-300">dBm</span></div>
                <div className="text-sm text-ink-200">Sinyal {q.toLowerCase()}</div>
              </div>
            </div>
          );
        })()}
        <p className="mt-4 text-xs text-ink-300">ESP8266 hanya mendukung 2,4 GHz. Di bawah −80 dBm request mulai sering timeout.</p>
      </Panel>

      <Panel title="Sentuh & buzzer" icon="hand">
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex items-center justify-between">
            <span className="text-ink-300">TTP223 (D7)</span>
            <span className={`font-pixel ${t?.touchStuck ? 'text-bad' : t?.touch ? 'text-gold-500' : 'text-ink-100'}`}>{!t ? 'belum ada' : t.touchStuck ? 'TERTAHAN' : t.touch ? 'DISENTUH' : 'lepas'}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="text-ink-300">Buzzer (D0)</span>
            <span className="flex items-center gap-2 font-pixel"><Icon name={t?.muted ? 'volumeX' : 'volume'} className="size-4" />{!t ? 'belum ada' : t.muted ? 'MUTE' : 'aktif'}</span>
          </li>
        </ul>
        {t?.touchStuck && <p role="alert" className="mt-3 text-sm text-bad">Touch tertahan &gt; 15 detik. Pastikan TTP223 mode momentary (jumper B terbuka) dan kabel OUT tidak short.</p>}
      </Panel>

      <Panel title="Jarak live HC-SR04 (operator)" icon="target" className="xl:col-span-2">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className={`font-score text-5xl ${t?.distanceCm == null ? 'text-ink-500' : 'text-ink-50'}`}>{cm(t?.distanceCm)}</div>
            <div className="text-sm text-ink-300">Nilai tengah beberapa bacaan terakhir. Pengunjung tidak melihat angka ini saat kompetisi.</div>
          </div>
          {t?.sensorError && <p role="status" className="px-frame-inset max-w-md px-3 py-2 text-sm text-warn"><b className="font-mono">{t.sensorError}</b>: {SENSOR_ERR[t.sensorError] ?? 'Error sensor'}. Tidak ada jarak palsu yang dipakai.</p>}
          {stale && <p role="status" className="px-frame-inset px-3 py-2 text-sm text-warn">Telemetry usang ({ago(t!.at, now)})</p>}
          {!d.online && <p role="status" className="px-frame-inset px-3 py-2 text-sm text-bad">Perangkat offline. Angka di atas adalah data terakhir.</p>}
        </div>
        <figure className="mt-4">
          <figcaption className="mb-1 text-sm font-semibold text-ink-200">Riwayat jarak sesi ini (cm), maks. 80 sampel</figcaption>
          <div className="h-40">
            {history.length < 2 ? <p className="text-sm text-ink-300">Menunggu telemetry…</p> : (
              <ResponsiveContainer>
                <LineChart data={history} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="#342116" vertical={false} />
                  <XAxis dataKey="i" hide />
                  <YAxis domain={[0, 'auto']} stroke="#4a2f20" tick={{ fill: '#c69a74', fontSize: 12 }} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#140d08', border: '2px solid #64402b', borderRadius: 0 }} labelFormatter={(_, p) => p[0]?.payload.time ?? ''} formatter={(v) => [v == null ? 'error' : `${v} cm`, 'Jarak']} />
                  <Line dataKey="d" stroke="#d4a657" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </figure>
      </Panel>

      <Panel title="State machine" icon="sliders">
        <ol className="flex flex-col gap-1 text-sm">
          {STATES.map((s) => {
            const on = t?.state === s && d.online;
            return (
              <li key={s} aria-current={on ? 'step' : undefined} className={`flex items-center justify-between px-2 py-1 font-mono ${on ? 'bg-gold-500 font-bold text-ink-950' : 'text-ink-300'}`}>
                {s}<span className="font-sans text-xs">{on ? stateLabel(s) : ''}</span>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel title="Log perangkat" icon="infoBox" className="xl:col-span-3">
        {d.errors.length === 0 ? <p className="text-sm text-ink-300">Belum ada catatan.</p> : (
          <ul className="grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
            {d.errors.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3 bg-ink-950 px-3 py-1.5">
                <time dateTime={e.at} className="shrink-0 text-ink-300 tabular">{timeWib(e.at)}</time>
                <span className={/error|offline|hilang|tertahan/i.test(e.message) ? 'text-warn' : 'text-ink-100'}>{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
