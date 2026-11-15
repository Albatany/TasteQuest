import { useMemo, type ReactNode } from 'react';
import { MENU_ITEMS, ROUNDS } from '../../../shared/src/game.ts';
import type { DeviceView } from '../../../shared/src/schema.ts';
import { ago, cm, num1, playerName } from '../lib/api.ts';
import { useLive, useNow } from '../lib/live.tsx';
import { Confetti, CountUp, HmifLogo, Icon, PixelStar, Stars } from './ui.tsx';

type Size = { huge: string; big: string; mid: string; body: string; star: string; pad: string };
const SIZES: Record<'md' | 'xl', Size> = {
  md: { huge: 'text-7xl', big: 'text-5xl', mid: 'text-2xl', body: 'text-base', star: 'size-10', pad: 'p-6 min-h-[22rem]' },
  // Kiosk: skala mengikuti tinggi layar agar terbaca dari jauh di 1920×1080 dan tetap muat di 1366×768.
  xl: { huge: 'text-[clamp(4rem,19vh,13rem)] leading-none', big: 'text-[clamp(2.5rem,7.5vh,6rem)]', mid: 'text-[clamp(1.5rem,4.2vh,3rem)]', body: 'text-[clamp(1.1rem,2.7vh,2rem)]', star: 'size-[clamp(3rem,11vh,7rem)]', pad: 'p-[clamp(1rem,4vh,3rem)]' },
};

const STEPS = [
  ['hand', 'Sentuh sensor untuk membuka menu'],
  ['target', 'Atur jarak telapak tangan ke target'],
  ['lock', 'Sentuh sekali untuk mengunci jarak'],
] as const;

export function GameStage({ device, size = 'md' }: { device: DeviceView | null; size?: 'md' | 'xl' }) {
  const s = SIZES[size];
  const { lastGame, lastRating, settings } = useLive();
  const now = useNow(100);
  const t = device?.telemetry ?? null;
  // Hitung mundur memakai jam lokal sejak telemetry diterima (jam laptop dan perangkat tidak perlu sinkron).
  const receivedAt = useMemo(() => Date.now(), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const remaining = t?.remainingMs == null ? null : Math.max(0, t.remainingMs - (now - receivedAt));

  if (!device || !device.online || !t) {
    const demo = (settings?.mode ?? 'demo') === 'demo';
    return (
      <div className={`flex flex-col items-center justify-center gap-4 text-center ${s.pad}`}>
        <Icon name="unlink" className={`${size === 'xl' ? 'size-28' : 'size-14'} text-bad`} />
        <p className={`font-pixel font-bold text-bad ${s.big}`}>{demo ? 'SIMULATOR BELUM AKTIF' : 'PERANGKAT OFFLINE'}</p>
        <p className={`max-w-2xl text-ink-200 ${s.body}`}>
          {demo
            ? 'Mode DEMO: jalankan simulator dari halaman ProxiRush Arena.'
            : `Menunggu ESP8266 terhubung. Terakhir terlihat: ${ago(device?.lastSeen ?? null, now)}.`}
        </p>
      </div>
    );
  }

  const round = t.round || 0;
  const last = t.results.at(-1);
  const roundDots = (
    <div className="flex items-center justify-center gap-2" aria-label={`Ronde ${round} dari ${ROUNDS}`}>
      {Array.from({ length: ROUNDS }, (_, i) => (
        <span key={i} className={`${size === 'xl' ? 'h-5 w-16' : 'h-3 w-10'} ${i < t.results.length ? 'bg-gold-500' : i === round - 1 ? 'bg-ink-200' : 'bg-ink-700'}`} />
      ))}
    </div>
  );
  const label = (text: string) => <p className={`font-bold uppercase tracking-widest text-ink-300 ${s.body}`}>{text}</p>;

  let body: ReactNode;
  switch (t.state) {
    case 'IDLE': {
      // Kiosk bergantian seperti layar OLED: ajakan main, kredit pembuat, logo HMIF (masing-masing 7 detik).
      const slide = size === 'xl' ? Math.floor(now / 7000) % 3 : 0;
      if (slide === 1) {
        body = (
          <div key="credits" className="anim-rise flex flex-col items-center gap-4">
            <p className={`font-score text-ink-300 ${s.mid}`}>MADE BY</p>
            <p className={`font-pixel font-bold text-gold-500 text-shadow-px ${s.big}`}>Muhammad Aziz Syah Dani</p>
            <p className={`text-ink-100 ${s.body}`}>from Informatika Universitas Jambi</p>
          </div>
        );
        break;
      }
      if (slide === 2) {
        body = (
          <div key="logo" className="anim-pop flex flex-col items-center gap-6">
            <HmifLogo className="h-[clamp(8rem,32vh,20rem)]" />
            <p className={`font-bold uppercase tracking-wide text-gold-400 ${s.body}`}>HMIF UNJA × FST Market Day 2026</p>
          </div>
        );
        break;
      }
      body = (
        <>
          <p className={`anim-blink font-pixel font-bold text-gold-500 ${s.big}`}>SIAP DICOBA!</p>
          <p className={`text-ink-100 ${s.body}`}>Uji ketepatan tanganmu dengan sensor ultrasonik. 3 ronde, skor maksimal 300.</p>
          <ol className={`grid gap-4 text-left ${size === 'xl' ? 'max-w-5xl' : 'max-w-xl'} sm:grid-cols-3`}>
            {STEPS.map(([icon, text], i) => (
              <li key={icon} className="px-frame-inset flex flex-col items-center gap-2 p-4 text-center">
                <span className={`font-score text-gold-500 ${s.mid}`}>{i + 1}</span>
                <Icon name={icon} className={`${size === 'xl' ? 'size-16' : 'size-9'} text-ink-100`} />
                <span className={`text-ink-100 ${size === 'xl' ? 'text-2xl' : 'text-sm'}`}>{text}</span>
              </li>
            ))}
          </ol>
        </>
      );
      break;
    }
    case 'MENU':
      body = (
        <>
          {label('Sentuh untuk pindah, tahan untuk memilih')}
          <ul className="flex w-full max-w-xl flex-col gap-3">
            {MENU_ITEMS.map((m, i) => (
              <li key={m} className={`flex items-center gap-3 px-5 py-3 font-pixel font-semibold ${s.mid} ${i === t.menuIndex ? 'px-frame-gold text-gold-500' : 'text-ink-300'}`}>
                <Icon name="play" className={`size-6 ${i === t.menuIndex ? '' : 'invisible'}`} />{m}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'READY':
      body = (
        <>
          <p className={`font-pixel font-bold text-gold-500 ${s.big}`}>{t.practice ? 'MODE LATIHAN' : 'PROXIRUSH'}</p>
          <p className={`max-w-2xl text-ink-100 ${s.body}`}>
            {ROUNDS} ronde. Gerakkan satu tangan di depan sensor sampai jaraknya pas dengan target, lalu sentuh pad dengan tangan lain untuk mengunci.
          </p>
          <p className={`anim-blink font-pixel text-ink-200 ${s.mid}`}>Tahan pad untuk mulai</p>
        </>
      );
      break;
    case 'COUNTDOWN':
      body = (
        <>
          {roundDots}
          {label(`Ronde ${round}, target ${t.targetCm} cm`)}
          <p key={Math.ceil((remaining ?? 0) / 1000)} className={`anim-pop font-score text-gold-500 ${s.huge}`}>
            {Math.max(1, Math.ceil((remaining ?? 0) / 1000))}
          </p>
          <p className={`font-pixel text-ink-200 ${s.mid}`}>Bersiap…</p>
        </>
      );
      break;
    case 'ROUND_ACTIVE': {
      const frac = remaining != null && settings ? remaining / settings.roundMs : 1;
      body = (
        <>
          {roundDots}
          {label(`Ronde ${round} dari ${ROUNDS}`)}
          <p className={`font-score text-ink-50 ${s.huge}`}>
            {t.targetCm}<span className={`font-pixel text-gold-500 ${s.big}`}> cm</span>
          </p>
          <div className={`w-full max-w-3xl bg-ink-800 ${size === 'xl' ? 'h-6' : 'h-3'}`} role="progressbar" aria-label="Sisa waktu" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
            <div className={`h-full ${frac < 0.3 ? 'bg-bad' : 'bg-gold-500'}`} style={{ width: `${Math.min(100, frac * 100)}%` }} />
          </div>
          <p className={`font-pixel text-ink-100 ${s.mid}`}><span className="font-score">{num1((remaining ?? 0) / 1000)}</span> detik lagi. Sentuh pad untuk mengunci</p>
          {t.practice
            ? <p className={`font-pixel text-ok ${s.mid}`}>Jarak tangan: <span className="font-score">{cm(t.distanceCm)}</span></p>
            : <p className={`text-ink-300 ${s.body}`}>Jarak dirahasiakan sampai dikunci</p>}
          {t.notice === 'NO_READING' && (
            <p role="alert" className={`px-frame-bad px-4 py-2 font-semibold text-ink-50 ${s.body}`}>Sensor tidak membaca tangan. Dekatkan telapak tangan lalu sentuh lagi.</p>
          )}
        </>
      );
      break;
    }
    case 'ROUND_RESULT':
      body = last && (
        <>
          {roundDots}
          {label(`Hasil ronde ${last.round}`)}
          {last.measuredCm === null ? (
            <p className={`anim-pop font-pixel font-bold text-bad ${s.big}`}>WAKTU HABIS</p>
          ) : (
            <p className={`font-semibold text-ink-100 tabular ${s.mid}`}>
              Terkunci di {cm(last.measuredCm)}. Target {last.targetCm} cm, selisih {cm(Math.abs(last.measuredCm - last.targetCm))}
            </p>
          )}
          <p className={`anim-pop font-score ${s.huge} ${last.score >= 90 ? 'text-ok' : last.score > 0 ? 'text-gold-500' : 'text-ink-500'}`}>
            +<CountUp value={last.score} ms={600} />
          </p>
        </>
      );
      break;
    case 'GAME_RESULT': {
      const mine = lastGame && lastGame.session.eventId === t.sessionEventId ? lastGame.session : null;
      const best = mine?.rank === 1;
      body = (
        <>
          {best && <Confetti />}
          {label(t.practice ? 'Latihan selesai, skor tidak masuk leaderboard' : 'Skor akhir')}
          <p className={`font-score text-gold-500 ${s.huge}`}>
            <CountUp value={t.totalScore ?? 0} /><span className={`text-ink-300 ${s.big}`}>/300</span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {t.results.map((r) => (
              <span key={r.round} className={`px-frame-inset px-3 py-1 font-semibold text-ink-100 tabular ${size === 'xl' ? 'text-3xl' : 'text-sm'}`}>
                R{r.round}: {r.measuredCm === null ? 'habis' : cm(r.measuredCm)}, {r.score} poin
              </span>
            ))}
          </div>
          {best && <p className={`anim-pop font-pixel font-bold text-ok ${s.big}`}>SKOR TERTINGGI BARU!</p>}
          {mine && !best && <p className={`font-pixel text-ink-100 ${s.mid}`}>{playerName(mine)}, peringkat #{mine.rank}</p>}
          {!t.practice && !mine && <p className={`text-ink-300 ${s.body}`}>Menyimpan hasil ke server…</p>}
        </>
      );
      break;
    }
    case 'RATING_OFFER':
      body = (
        <>
          <p className={`font-pixel font-bold text-gold-500 ${s.big}`}>Beri rating karya kami?</p>
          <p className={`text-ink-100 ${s.body}`}>Beri 1 sampai 5 bintang untuk karya IoT kami. Boleh dilewati, dan tanpa nama.</p>
          <div className={`flex gap-6 font-pixel ${s.mid}`}>
            <span className="px-frame-gold px-4 py-2 text-gold-500">Tahan = Ya</span>
            <span className="px-frame px-4 py-2 text-ink-200">Sentuh = Lewati</span>
          </div>
        </>
      );
      break;
    case 'RATING':
      body = (
        <>
          <p className={`font-pixel font-bold text-gold-500 ${s.big}`}>Seberapa keren karya kami?</p>
          <div className="flex gap-2" role="img" aria-label={t.stars ? `${t.stars} bintang dipilih` : 'Belum memilih bintang'}>
            {[1, 2, 3, 4, 5].map((i) => <PixelStar key={i} on={i <= t.stars} className={`${s.star} ${i === t.stars ? 'anim-pop' : ''}`} />)}
          </div>
          <p className={`font-pixel text-ink-100 ${s.mid}`}>{t.stars ? `${t.stars} bintang` : 'Sentuh untuk memilih'}</p>
          <p className={`text-ink-300 ${s.body}`}>Sentuh untuk ganti bintang, tahan untuk kirim. Diam 20 detik berarti batal.</p>
          {t.notice === 'PICK_STAR' && <p role="alert" className={`px-frame-bad px-4 py-2 text-ink-50 ${s.body}`}>Pilih minimal 1 bintang dulu.</p>}
        </>
      );
      break;
    case 'THANK_YOU': {
      const received = t.ratingStatus === 'acked' || (lastRating !== null && lastRating.eventId === t.ratingEventId);
      body = (
        <>
          <p className={`anim-pop font-pixel font-bold text-gold-500 ${s.big}`}>TERIMA KASIH!</p>
          {t.rated ? (
            <>
              <Stars value={t.stars} size={s.star} label={false} />
              <p role="status" className={`font-pixel ${s.mid} ${received ? 'text-ok' : t.ratingStatus === 'rejected' ? 'text-bad' : 'text-warn'}`}>
                {received ? 'Rating diterima server' : t.ratingStatus === 'rejected' ? 'Rating ditolak server' : 'Tersimpan di alat, menunggu koneksi'}
              </p>
            </>
          ) : (
            <p className={`text-ink-100 ${s.body}`}>Sampai jumpa lagi di stan Informatika!</p>
          )}
        </>
      );
      break;
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-5 text-center ${s.pad}`}>
      {body}
    </div>
  );
}
