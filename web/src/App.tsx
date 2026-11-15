import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Credits, Icon, ModeBadge, OnlineDot, Wordmark, type IconName } from './components/ui.tsx';
import { useActiveDevice, useLive, useMode } from './lib/live.tsx';
import { Arena } from './pages/Arena.tsx';
import { DeviceMonitor } from './pages/DeviceMonitor.tsx';
import { Kiosk } from './pages/Kiosk.tsx';
import { Leaderboard } from './pages/Leaderboard.tsx';
import { Overview } from './pages/Overview.tsx';
import { Reviews } from './pages/Reviews.tsx';
import { Settings } from './pages/Settings.tsx';

const PAGES: { path: string; label: string; icon: IconName; el: () => ReactElement }[] = [
  { path: '/', label: 'Overview', icon: 'home', el: () => <Overview /> },
  { path: '/arena', label: 'ProxiRush Arena', icon: 'gamepad', el: () => <Arena /> },
  { path: '/leaderboard', label: 'Leaderboard', icon: 'trophy', el: () => <Leaderboard /> },
  { path: '/reviews', label: 'Visitor Reviews', icon: 'messageText', el: () => <Reviews /> },
  { path: '/device', label: 'Device Monitor', icon: 'cpu', el: () => <DeviceMonitor /> },
  { path: '/settings', label: 'Pengaturan', icon: 'sliders', el: () => <Settings /> },
];

function useHashPath() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export function App() {
  const path = useHashPath();
  const page = PAGES.find((p) => p.path === path) ?? PAGES[0];
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    document.title = path === '/kiosk' ? 'TasteQuest Kiosk' : `${page.label} · TasteQuest`;
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus(); // pembaca layar diberi tahu halaman berganti
  }, [path, page.label]);

  if (path === '/kiosk') return <Kiosk />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <button type="button" className="sr-only-focusable fixed left-2 top-2 z-50 px-btn" onClick={() => mainRef.current?.focus()}>
        Lewati ke konten
      </button>
      <aside className="flex flex-col border-ink-800 bg-ink-950/90 lg:sticky lg:top-0 lg:h-dvh lg:border-r-2">
        <div className="flex items-center justify-between gap-3 p-4">
          <Wordmark />
          <span className="lg:hidden"><HeaderStatus compact /></span>
        </div>
        <nav aria-label="Navigasi utama" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {PAGES.map((p) => {
            const active = p === page;
            return (
              <a
                key={p.path}
                href={`#${p.path}`}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap px-3 py-2 font-pixel font-semibold transition-colors ${active ? 'px-frame-gold text-gold-500' : 'border-[6px] border-transparent text-ink-200 hover:bg-ink-900 hover:text-ink-50'}`}
              >
                <Icon name={p.icon} />
                {p.label}
              </a>
            );
          })}
          <a href="#/kiosk" className="flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap border-[6px] border-transparent px-3 py-2 font-pixel font-semibold text-ink-200 hover:bg-ink-900 hover:text-ink-50">
            <Icon name="expand" />
            Kiosk
          </a>
        </nav>
        <div className="mt-auto hidden p-4 lg:block">
          <HeaderStatus />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <ConnectionBanner />
        <main ref={mainRef} tabIndex={-1} className="flex-1 p-4 outline-none sm:p-6">
          <h1 className="mb-6 flex items-center gap-3 text-3xl text-gold-500 sm:text-4xl">
            <Icon name={page.icon} className="size-8" />
            {page.label}
          </h1>
          {page.el()}
        </main>
        <Credits />
      </div>
    </div>
  );
}

function HeaderStatus({ compact = false }: { compact?: boolean }) {
  const mode = useMode();
  const device = useActiveDevice();
  if (compact) return <ModeBadge mode={mode} />;
  return (
    <div className="px-frame-inset flex flex-col gap-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-ink-300">Mode data</span>
        <ModeBadge mode={mode} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-300">{mode === 'live' ? 'ESP8266' : 'Simulator'}</span>
        <OnlineDot online={!!device?.online} />
      </div>
    </div>
  );
}

function ConnectionBanner() {
  const { connected } = useLive();
  const [show, setShow] = useState(false);
  useEffect(() => {
    // Beri jeda singkat saat pertama memuat agar banner tidak berkedip.
    const t = setTimeout(() => setShow(!connected), connected ? 0 : 1500);
    return () => clearTimeout(t);
  }, [connected]);
  if (!show) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-bad px-4 py-2 font-semibold text-ink-950 sm:px-6">
      <Icon name="unlink" />
      Koneksi ke server terputus. Dashboard mencoba menyambung lagi dan akan memuat ulang data sendiri.
    </div>
  );
}
