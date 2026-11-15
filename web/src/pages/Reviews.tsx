import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Mode } from '../../../shared/src/schema.ts';
import { Empty, ErrorBox, Loading, Panel, PixelStar, Stars } from '../components/ui.tsx';
import { num1, timeWib, useApi } from '../lib/api.ts';

interface ReviewsData {
  mode: Mode;
  count: number;
  avg: number | null;
  distribution: { stars: number; count: number }[];
  trend: { bucket: string; count: number; avg: number }[];
  recent: { id: number; stars: number; sessionEventId: string | null; createdAt: string; deviceId: string }[];
}

// Satu seri per chart: satu warna (gold), grid & sumbu redup, tanpa dual-axis.
const MARK = '#d4a657';
const AXIS = { stroke: '#4a2f20', tick: { fill: '#c69a74', fontSize: 12 }, tickLine: false };
const tooltipStyle = { background: '#140d08', border: '2px solid #64402b', borderRadius: 0, color: '#faf7f2' };
const hourLabel = (b: string) => `${b.slice(8, 10)}/${b.slice(5, 7)} ${b.slice(11)}`;

function MiniChart({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-ink-200">{title}</figcaption>
      <div className="h-44 w-full">{children}</div>
    </figure>
  );
}

export function Reviews() {
  const { data, error, loading } = useApi<ReviewsData>('/api/reviews');
  if (!data) return loading ? <Loading /> : <ErrorBox message={error ?? 'Gagal memuat.'} />;
  const max = Math.max(1, ...data.distribution.map((d) => d.count));
  const trend = data.trend.map((t) => ({ ...t, label: hourLabel(t.bucket) }));

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBox message={`Data mungkin usang: ${error}`} />}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel title="Ringkasan" icon="messageText" tone="frame-gold">
          {data.count === 0 ? (
            <Empty icon="messageText" title="Belum ada rating">Rating muncul setelah pengunjung menilai karya lewat sensor sentuh.</Empty>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="font-score text-6xl text-gold-500">{num1(data.avg)}</div>
              <Stars value={data.avg ?? 0} size="size-7" />
              <p className="text-ink-200">dari <b className="text-ink-50">{data.count}</b> rating masuk</p>
              <p className="text-xs text-ink-300">Satu orang bisa memberi lebih dari satu rating. Rating bersifat sukarela dan tanpa nama.</p>
            </div>
          )}
        </Panel>

        <Panel title="Distribusi bintang" icon="chartLine">
          <ul className="flex flex-col gap-3" aria-label="Distribusi rating per bintang">
            {[...data.distribution].reverse().map((d) => {
              const pct = data.count ? Math.round((d.count / data.count) * 100) : 0;
              return (
                <li key={d.stars} className="grid grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center gap-3">
                  <span className="flex items-center gap-1 font-score text-sm text-ink-100">
                    {d.stars} <PixelStar on className="size-5" />
                  </span>
                  <span className="h-6 bg-ink-800" aria-hidden="true">
                    <span className="block h-full bg-gold-500 transition-[width] duration-500" style={{ width: `${(d.count / max) * 100}%` }} />
                  </span>
                  <span className="text-right text-sm text-ink-200 tabular">{d.count} <span className="text-ink-300">({pct}%)</span></span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Tren per jam (WIB)" icon="clock">
        {trend.length === 0 ? (
          <Empty icon="chartLine" title="Belum ada data tren" />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <MiniChart title="Jumlah rating per jam">
                <ResponsiveContainer>
                  <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="#342116" vertical={false} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis allowDecimals={false} {...AXIS} />
                    <Tooltip cursor={{ fill: '#342116' }} contentStyle={tooltipStyle} formatter={(v) => [`${v} rating`, 'Jumlah']} />
                    <Bar dataKey="count" fill={MARK} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </MiniChart>
              <MiniChart title="Rata-rata bintang per jam (skala 1 sampai 5)">
                <ResponsiveContainer>
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="#342116" vertical={false} />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} {...AXIS} />
                    <Tooltip cursor={{ stroke: '#8b5e3c' }} contentStyle={tooltipStyle} formatter={(v) => [`${num1(Number(v))} bintang`, 'Rata-rata']} />
                    <Line dataKey="avg" stroke={MARK} strokeWidth={2} dot={{ r: 4, fill: MARK, stroke: '#22150d', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </MiniChart>
            </div>
            <details className="mt-4 text-sm">
              <summary className="font-semibold text-gold-400">Lihat data sebagai tabel</summary>
              <table className="mt-2 w-full max-w-lg text-left tabular">
                <thead><tr className="border-b-2 border-ink-700 text-ink-200"><th className="py-1">Jam (WIB)</th><th className="text-right">Jumlah</th><th className="text-right">Rata-rata</th></tr></thead>
                <tbody>{trend.map((t) => <tr key={t.bucket} className="border-b border-ink-800"><td className="py-1">{t.bucket}</td><td className="text-right">{t.count}</td><td className="text-right">{num1(t.avg)}</td></tr>)}</tbody>
              </table>
            </details>
          </>
        )}
      </Panel>

      <Panel title="Riwayat rating" icon="clock">
        {data.recent.length === 0 ? <Empty icon="hourglass" title="Riwayat kosong" /> : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.recent.map((r) => (
              <li key={r.id} className="px-frame-inset flex items-center justify-between gap-3 px-3 py-2">
                <Stars value={r.stars} size="size-4" />
                <span className="text-xs text-ink-300">{r.sessionEventId ? 'setelah bermain' : 'rating langsung'}</span>
                <time dateTime={r.createdAt} className="text-sm text-ink-200 tabular">{timeWib(r.createdAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
