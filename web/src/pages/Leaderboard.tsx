import { useState } from 'react';
import type { LeaderRow, Mode } from '../../../shared/src/schema.ts';
import { Empty, ErrorBox, Icon, Loading, Panel } from '../components/ui.tsx';
import { api, cm, dateTimeWib, playerName, seconds, useApi } from '../lib/api.ts';
import { useLive } from '../lib/live.tsx';

const PODIUM = [
  { place: 2, height: 'h-24', tone: 'bg-ink-300' },
  { place: 1, height: 'h-36', tone: 'bg-gold-500' },
  { place: 3, height: 'h-16', tone: 'bg-ink-500' },
];

export function Podium({ rows, big = false }: { rows: LeaderRow[]; big?: boolean }) {
  return (
    <ol className="grid grid-cols-3 items-end gap-3" aria-label="Podium tiga besar">
      {PODIUM.map(({ place, height, tone }) => {
        const r = rows[place - 1];
        return (
          <li key={place} className="flex flex-col items-center gap-2 text-center" style={{ order: place === 1 ? 2 : place === 2 ? 1 : 3 }}>
            {r ? (
              <>
                {place === 1 && <Icon name="crown" className={`${big ? 'size-12' : 'size-8'} anim-bob text-gold-500`} />}
                <span className={`max-w-full truncate font-pixel font-semibold text-ink-50 ${big ? 'text-2xl' : 'text-base'}`}>{playerName(r)}</span>
                <span className={`font-score text-gold-400 ${big ? 'text-3xl' : 'text-xl'}`}>{r.totalScore}</span>
              </>
            ) : (
              <span className="text-sm text-ink-300">kosong</span>
            )}
            <div className={`${height} ${tone} grid w-full place-items-start justify-center pt-2`} style={{ clipPath: 'polygon(0 6px,6px 6px,6px 0,calc(100% - 6px) 0,calc(100% - 6px) 6px,100% 6px,100% 100%,0 100%)' }}>
              <span className={`font-score text-ink-950 ${big ? 'text-4xl' : 'text-2xl'}`}>{place}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Leaderboard() {
  const { data, error, loading } = useApi<{ mode: Mode; rows: LeaderRow[] }>('/api/leaderboard?limit=100');
  const { operator } = useLive();

  if (!data) return loading ? <Loading /> : <ErrorBox message={error ?? 'Gagal memuat.'} />;
  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBox message={`Data mungkin usang: ${error}`} />}
      <Panel title="Podium" icon="crown" tone="frame-gold">
        {data.rows.length ? <Podium rows={data.rows} /> : <Empty icon="trophy" title="Belum ada skor">Leaderboard terisi otomatis setelah permainan ProxiRush selesai.</Empty>}
      </Panel>
      <Panel title={`Peringkat lengkap (${data.rows.length})`} icon="trophy">
        <p className="mb-4 text-sm text-ink-300">
          Peringkat ditentukan oleh skor tertinggi. Kalau skornya sama, yang total waktu kuncinya lebih cepat ada di atas, lalu yang selesai lebih dulu. Ronde yang habis waktu dihitung penuh.
          {operator ? ' Klik nama untuk memberi nickname.' : ''}
        </p>
        {data.rows.length === 0 ? (
          <Empty icon="hourglass" title="Kosong" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
              <caption className="sr-only">Leaderboard ProxiRush mode {data.mode}</caption>
              <thead>
                <tr className="border-b-2 border-ink-700 font-pixel text-ink-200">
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">Pemain</th>
                  <th scope="col" className="py-2 pr-3 text-right">Skor</th>
                  <th scope="col" className="py-2 pr-3">Ronde (target: jarak terkunci, poin)</th>
                  <th scope="col" className="py-2 pr-3 text-right">Waktu kunci</th>
                  <th scope="col" className="py-2">Selesai</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-b border-ink-800 align-top hover:bg-ink-900/60">
                    <td className={`py-3 pr-3 font-score ${r.rank <= 3 ? 'text-gold-500' : 'text-ink-300'}`}>{r.rank}</td>
                    <td className="py-3 pr-3">{operator ? <NicknameEditor row={r} /> : <span className="font-semibold">{playerName(r)}</span>}</td>
                    <td className="py-3 pr-3 text-right font-score text-ink-50">{r.totalScore}</td>
                    <td className="py-3 pr-3">
                      <ul className="flex flex-wrap gap-1.5">
                        {r.rounds.map((x) => (
                          <li key={x.round} className="bg-ink-800 px-2 py-0.5 tabular" title={`Target ${x.targetCm} cm`}>
                            <span className="text-ink-300">{x.targetCm} cm:</span> {x.measuredCm === null ? <span className="text-bad">habis</span> : cm(x.measuredCm)}, <b className="text-gold-400">{x.score}</b>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-3 pr-3 text-right tabular text-ink-200">{seconds(r.durationMs)}</td>
                    <td className="py-3 text-ink-300 tabular"><time dateTime={r.finishedAt}>{dateTimeWib(r.finishedAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function NicknameEditor({ row }: { row: LeaderRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(row.nickname ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <button type="button" className="font-semibold text-ink-50 underline decoration-ink-600 underline-offset-4 hover:decoration-gold-500" onClick={() => setEditing(true)}>
        {playerName(row)}
      </button>
    );
  }
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sessions/${row.id}`, { method: 'PATCH', body: { nickname: value.trim() || null } });
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const id = `nick-${row.id}`;
  return (
    <form className="flex flex-col gap-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label htmlFor={id} className="text-xs text-ink-300">Nickname Pemain #{row.playerNo} (kosongkan untuk hapus)</label>
      <div className="flex gap-2">
        <input id={id} autoFocus maxLength={24} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          className="min-h-10 w-40 border-2 border-ink-600 bg-ink-950 px-2 text-ink-50" />
        <button type="submit" disabled={busy} className="px-btn text-sm">Simpan</button>
        <button type="button" className="px-btn-ghost text-sm" onClick={() => setEditing(false)}>Batal</button>
      </div>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </form>
  );
}
