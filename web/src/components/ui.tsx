import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import chartLine from 'pixelarticons/svg/chart-line.svg?url';
import check from 'pixelarticons/svg/check.svg?url';
import clock from 'pixelarticons/svg/clock.svg?url';
import close from 'pixelarticons/svg/close.svg?url';
import cpu from 'pixelarticons/svg/cpu.svg?url';
import crown from 'pixelarticons/svg/crown.svg?url';
import download from 'pixelarticons/svg/download.svg?url';
import expand from 'pixelarticons/svg/expand.svg?url';
import gamepad from 'pixelarticons/svg/gamepad.svg?url';
import hand from 'pixelarticons/svg/hand.svg?url';
import home from 'pixelarticons/svg/home.svg?url';
import hourglass from 'pixelarticons/svg/hourglass.svg?url';
import infoBox from 'pixelarticons/svg/info-box.svg?url';
import lock from 'pixelarticons/svg/lock.svg?url';
import login from 'pixelarticons/svg/login.svg?url';
import logout from 'pixelarticons/svg/logout.svg?url';
import messageText from 'pixelarticons/svg/message-text.svg?url';
import monitor from 'pixelarticons/svg/monitor.svg?url';
import play from 'pixelarticons/svg/play.svg?url';
import reload from 'pixelarticons/svg/reload.svg?url';
import server from 'pixelarticons/svg/server.svg?url';
import sliders from 'pixelarticons/svg/sliders.svg?url';
import target from 'pixelarticons/svg/target.svg?url';
import trash from 'pixelarticons/svg/trash.svg?url';
import trophy from 'pixelarticons/svg/trophy.svg?url';
import unlink from 'pixelarticons/svg/unlink.svg?url';
import users from 'pixelarticons/svg/users.svg?url';
import volume from 'pixelarticons/svg/volume-2.svg?url';
import volumeX from 'pixelarticons/svg/volume-x.svg?url';
import warning from 'pixelarticons/svg/warning-diamond.svg?url';
import wifi from 'pixelarticons/svg/wifi.svg?url';
import zap from 'pixelarticons/svg/zap.svg?url';

const ICONS = {
  chartLine, check, clock, close, cpu, crown, download, expand, gamepad, hand, home, hourglass, infoBox, lock, login, logout,
  messageText, monitor, play, reload, server, sliders, target, trash, trophy, unlink, users, volume, volumeX, warning, wifi, zap,
};
export type IconName = keyof typeof ICONS;

/** Ikon pixelarticons (MIT) sebagai mask sehingga mengikuti warna teks. Dekoratif: label ada di teks sekitarnya. */
export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ maskImage: url, WebkitMaskImage: url, maskSize: '100% 100%', WebkitMaskSize: '100% 100%', maskRepeat: 'no-repeat' }}
    />
  );
}

// Bintang pixel orisinal TasteQuest (11×10). Bintang kosong memakai siluet yang sama dengan warna redup.
const STAR = ['.....#.....', '....###....', '....###....', '###########', '.#########.', '..#######..', '..#######..', '.####.####.', '.###...###.', '##.......##'];
const STAR_PATH = STAR.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x} ${y}h1v1h-1z` : ''))).join('');

export function PixelStar({ on, className = 'size-6' }: { on: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 11 10" className={`${className} ${on ? 'text-gold-500' : 'text-ink-700'}`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={STAR_PATH} fill="currentColor" />
    </svg>
  );
}

export function Stars({ value, size = 'size-6', label = true }: { value: number; size?: string; label?: boolean }) {
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${value.toFixed(1).replace('.', ',')} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => <PixelStar key={i} on={i <= rounded} className={size} />)}
      {label && <span className="sr-only">{rounded} dari 5</span>}
    </span>
  );
}

export function Panel({ title, icon, action, children, className = '', tone = 'frame', titleId }: {
  title?: ReactNode; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string;
  tone?: 'frame' | 'frame-gold' | 'frame-inset' | 'frame-ok' | 'frame-bad'; titleId?: string;
}) {
  return (
    <section className={`px-${tone} px-shadow p-4 sm:p-5 ${className}`} aria-labelledby={titleId}>
      {(title || action) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <h2 id={titleId} className="flex items-center gap-2 text-lg text-gold-400">
              {icon && <Icon name={icon} className="size-5 text-gold-500" />}
              {title}
            </h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon: IconName }) {
  return (
    <div className="px-frame px-shadow flex min-h-32 flex-col justify-between gap-2 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-200">
        <Icon name={icon} className="size-5 text-gold-500" />
        {label}
      </div>
      <div className="font-score text-3xl text-ink-50">{value}</div>
      {hint && <div className="text-xs text-ink-300">{hint}</div>}
    </div>
  );
}

export function ModeBadge({ mode, size = 'sm' }: { mode: 'demo' | 'live'; size?: 'sm' | 'lg' }) {
  const live = mode === 'live';
  return (
    <span
      className={`inline-flex items-center gap-2 font-pixel font-bold tracking-wider ${size === 'lg' ? 'px-4 py-1.5 text-xl' : 'px-2.5 py-0.5 text-sm'} ${live ? 'bg-ok text-ink-950' : 'bg-warn text-ink-950'}`}
      title={live ? 'Data dari ESP8266 fisik' : 'Data dari simulator, bukan dari alat fisik'}
    >
      <span className={`inline-block size-2 bg-ink-950 ${live ? 'anim-blink' : ''}`} aria-hidden="true" />
      {live ? 'LIVE' : 'DEMO'}
    </span>
  );
}

export function OnlineDot({ online, label }: { online: boolean; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${online ? 'text-ok' : 'text-bad'}`}>
      <span className={`inline-block size-2.5 ${online ? 'bg-ok' : 'bg-bad'}`} aria-hidden="true" />
      {label ?? (online ? 'ONLINE' : 'OFFLINE')}
    </span>
  );
}

export function Loading({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-ink-300">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => <span key={i} className="anim-blink inline-block size-2 bg-gold-500" style={{ animationDelay: `${i * 0.2}s` }} />)}
      </span>
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="px-frame-bad flex flex-wrap items-center gap-3 p-4 text-ink-100">
      <Icon name="warning" className="size-6 text-bad" />
      <span className="flex-1">{message}</span>
      {onRetry && <button type="button" className="px-btn-ghost text-sm" onClick={onRetry}><Icon name="reload" className="size-4" />Coba lagi</button>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon name={icon} className="anim-bob size-10 text-ink-500" />
      <p className="font-pixel text-lg text-ink-200">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink-300">{children}</p>}
    </div>
  );
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Angka yang menghitung naik (score count-up). Langsung ke nilai akhir bila reduced-motion. */
export function CountUp({ value, ms = 900 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className="tabular">{shown}</span>;
}

export function Confetti({ count = 60 }: { count?: number }) {
  const bits = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    dur: 2.4 + Math.random() * 1.8,
    color: ['#d4a657', '#dcc4a8', '#2fbfa3', '#faf7f2', '#e8913a'][i % 5],
  })), [count]);
  return (
    <div aria-hidden="true">
      {bits.map((b, i) => <span key={i} className="confetti" style={{ left: `${b.left}%`, background: b.color, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }} />)}
    </div>
  );
}

export function Wordmark({ size = 'md' }: { size?: 'md' | 'xl' }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid place-items-center bg-gold-500 text-ink-950 ${size === 'xl' ? 'size-16' : 'size-10'}`} aria-hidden="true">
        <Icon name="target" className={size === 'xl' ? 'size-11' : 'size-7'} />
      </span>
      <div className="leading-none">
        <div className={`font-pixel font-bold text-gold-500 text-shadow-px ${size === 'xl' ? 'text-5xl' : 'text-2xl'}`}>
          TASTE<span className="text-ink-50">QUEST</span>
        </div>
        <div className={`mt-1 font-pixel text-ink-300 ${size === 'xl' ? 'text-xl' : 'text-xs'}`}>PLAY. EXPLORE. RATE.</div>
      </div>
    </div>
  );
}

export function HmifLogo({ className = 'h-10' }: { className?: string }) {
  const [ok, setOk] = useState(true);
  // Logo resmi diunduh dari hmifunja.my.id (lihat docs/BRAND.md). Bila file hilang, tampil placeholder berlabel.
  return ok
    ? <img src="/brand/logo-hmif.png" alt="Logo HMIF Universitas Jambi" className={`${className} w-auto object-contain`} onError={() => setOk(false)} />
    : <span className={`${className} inline-grid place-items-center border-2 border-dashed border-ink-500 px-3 font-pixel text-xs text-ink-300`}>LOGO HMIF (letakkan di /brand/logo-hmif.png)</span>;
}

export function Credits({ big = false }: { big?: boolean }) {
  return (
    <footer className={`flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink-800 ${big ? 'px-10 py-5' : 'px-4 py-5 sm:px-6'}`}>
      <div className="flex items-center gap-4">
        <HmifLogo className={big ? 'h-16' : 'h-11'} />
        <div className={big ? 'text-xl' : 'text-sm'}>
          <div className="font-bold uppercase tracking-wide text-gold-400">HMIF UNJA × FST Market Day 2026</div>
          <div className="text-ink-300">Pameran karya Informatika Universitas Jambi</div>
        </div>
      </div>
      <div className={`font-bold text-ink-100 ${big ? 'text-2xl' : 'text-sm'}`}>© Muhammad Aziz Syah Dani 2026</div>
    </footer>
  );
}
