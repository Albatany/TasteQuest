import { GameStage } from '../components/GameStage.tsx';
import { Credits, Empty, Icon, ModeBadge, Stars, Wordmark } from '../components/ui.tsx';
import { num1, timeWib, useApi } from '../lib/api.ts';
import { useActiveDevice, useMode, useNow } from '../lib/live.tsx';
import { Podium } from './Leaderboard.tsx';
import type { OverviewData } from './Overview.tsx';

export function Kiosk() {
  const device = useActiveDevice();
  const mode = useMode();
  const now = useNow(1000);
  const { data } = useApi<OverviewData>('/api/overview');

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-6 px-10 py-5">
        <Wordmark size="xl" />
        <div className="flex items-center gap-6">
          <ModeBadge mode={mode} size="lg" />
          <time className="font-score text-2xl text-ink-100">{timeWib(new Date(now).toISOString())}</time>
          <button type="button" className="px-btn-ghost text-sm" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
            <Icon name="expand" className="size-4" />Layar penuh
          </button>
          <a href="#/" className="text-sm text-ink-300 underline-offset-4 hover:underline">Dashboard</a>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-8 px-10 lg:grid-cols-[minmax(0,1fr)_32rem]">
        <section aria-label="Permainan langsung" className="px-frame-gold px-lg px-shadow flex min-h-0 items-center justify-center overflow-hidden">
          <GameStage device={device} size="xl" />
        </section>
        <aside className="hidden min-h-0 flex-col gap-8 lg:flex">
          <section className="px-frame px-lg px-shadow flex flex-1 flex-col justify-between p-6" aria-labelledby="k-top">
            <h2 id="k-top" className="mb-4 flex items-center gap-3 text-3xl text-gold-400"><Icon name="trophy" className="size-8 text-gold-500" />Top 3 ProxiRush</h2>
            {data?.top.length ? <Podium rows={data.top} big /> : <Empty icon="trophy" title="Jadilah yang pertama!" />}
          </section>
          <section className="px-frame px-lg px-shadow p-6" aria-labelledby="k-rate">
            <h2 id="k-rate" className="mb-3 flex items-center gap-3 text-3xl text-gold-400"><Icon name="messageText" className="size-8 text-gold-500" />Rating pengunjung</h2>
            {data && data.avgStars !== null ? (
              <div className="flex items-center gap-5">
                <span className="font-score text-6xl text-gold-500">{num1(data.avgStars)}</span>
                <div className="flex flex-col gap-2">
                  <Stars value={data.avgStars} size="size-9" />
                  <span className="text-xl text-ink-200">{data.ratings} rating masuk</span>
                </div>
              </div>
            ) : <p className="text-xl text-ink-200">Belum ada rating. Nilai karya kami setelah mencoba!</p>}
          </section>
        </aside>
      </main>

      <Credits big />
    </div>
  );
}
