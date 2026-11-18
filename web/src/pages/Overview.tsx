import { ROUNDS } from '../../../shared/src/game.ts';
import type { LeaderRow, Mode } from '../../../shared/src/schema.ts';
import { Empty, ErrorBox, Icon, Loading, OnlineDot, Panel, Stars, Stat } from '../components/ui.tsx';
import { ago, num1, playerName, timeWib, useApi } from '../lib/api.ts';
import { useActiveDevice, useMode, useNow } from '../lib/live.tsx';
import { Podium } from './Leaderboard.tsx';

export interface OverviewData {
  mode: Mode;
  sessions: number;
  ratings: number;
  avgStars: number | null;
  top: LeaderRow[];
  recent: { kind: 'game' | 'rating'; id: number; at: string; value: number; playerNo: number | null; nickname: string | null }[];
}

const STATE_LABEL: Record<string, string> = {
  IDLE: 'Menunggu pengunjung', MENU: 'Di menu', READY: 'Siap mulai', COUNTDOWN: 'Hitung mundur', ROUND_ACTIVE: 'Ronde berjalan',
  ROUND_RESULT: 'Hasil ronde', GAME_RESULT: 'Skor akhir', RATING_OFFER: 'Tawaran rating', RATING: 'Memberi rating', THANK_YOU: 'Terima kasih',
  RP_PRACTICE: 'Latihan ProxiRush',
};
export const stateLabel = (s: string | undefined) => (s ? STATE_LABEL[s] ?? s : 'tidak diketahui');

export function Overview() {
  const { data, error, loading } = useApi<OverviewData>('/api/overview');
  const mode = useMode();
  const device = useActiveDevice();
  const now = useNow(1000);

  if (!data) return loading ? <Loading /> : <ErrorBox message={error ?? 'Gagal memuat.'} />;
  const best = data.top[0];

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBox message={`Data mungkin usang: ${error}`} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="gamepad" label="Sesi game" value={data.sessions} hint="Dihitung per permainan, bukan per orang" />
        <Stat icon="messageText" label="Rating masuk" value={data.ratings} hint="Satu orang bisa menilai lebih dari sekali" />
        <Stat
          icon="trophy"
          label="Rata-rata bintang"
          value={data.avgStars === null ? <span className="font-sans text-2xl">Belum ada</span> : num1(data.avgStars)}
          hint={data.avgStars === null ? 'Belum ada rating' : <Stars value={data.avgStars} size="size-4" />}
        />
        <Stat icon="crown" label="Skor tertinggi" value={best ? <>{best.totalScore}<span className="text-base text-ink-300">/{ROUNDS * 100}</span></> : <span className="font-sans text-2xl">Belum ada</span>} hint={best ? playerName(best) : 'Belum ada permainan'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Status perangkat" icon="cpu" className="xl:col-span-1">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-ink-300">Sumber</dt>
            <dd className="font-semibold">{mode === 'live' ? 'ESP8266 (LIVE)' : 'Simulator SIM-01 (DEMO)'}</dd>
            <dt className="text-ink-300">Koneksi</dt>
            <dd><OnlineDot online={!!device?.online} /></dd>
            <dt className="text-ink-300">State</dt>
            <dd className="font-pixel">{device?.online ? stateLabel(device.telemetry?.state) : 'offline'}</dd>
            <dt className="text-ink-300">Terakhir terlihat</dt>
            <dd>{device?.lastSeen ? `${ago(device.lastSeen, now)} (${timeWib(device.lastSeen)})` : 'belum pernah'}</dd>
          </dl>
          <a href="#/device" className="px-btn-ghost mt-5 w-full text-sm"><Icon name="monitor" className="size-4" />Buka Device Monitor</a>
        </Panel>

        <Panel title="Aktivitas terbaru" icon="clock" className="xl:col-span-2">
          {data.recent.length === 0 ? (
            <Empty icon="hourglass" title="Belum ada aktivitas">
              {mode === 'demo' ? 'Jalankan simulator di ProxiRush Arena untuk membuat data demo.' : 'Data muncul setelah pengunjung bermain atau memberi rating.'}
            </Empty>
          ) : (
            <ul className="divide-y-2 divide-ink-800">
              {data.recent.map((r) => (
                <li key={`${r.kind}-${r.id}`} className="flex items-center gap-3 py-2.5">
                  <Icon name={r.kind === 'game' ? 'gamepad' : 'messageText'} className="size-5 text-gold-500" />
                  <span className="flex-1">
                    {r.kind === 'game'
                      ? <>{playerName({ playerNo: r.playerNo ?? 0, nickname: r.nickname })} menyelesaikan ProxiRush dengan <b className="font-score text-sm text-gold-400">{r.value}</b> poin</>
                      : <span className="inline-flex flex-wrap items-center gap-2">Rating baru <Stars value={r.value} size="size-4" /></span>}
                  </span>
                  <time dateTime={r.at} className="text-sm text-ink-300 tabular">{timeWib(r.at)}</time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Top 3 ProxiRush" icon="trophy" action={<a href="#/leaderboard" className="text-sm font-semibold text-gold-400 underline-offset-4 hover:underline">Lihat semua</a>}>
        {data.top.length ? <Podium rows={data.top} /> : <Empty icon="trophy" title="Podium masih kosong">Jadilah yang pertama mencetak skor!</Empty>}
      </Panel>
    </div>
  );
}
