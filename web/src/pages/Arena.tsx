import { useEffect, type KeyboardEvent } from 'react';
import { MENU_ITEMS, ROUNDS, resultTier } from '../../../shared/src/game.ts';
import { GameStage } from '../components/GameStage.tsx';
import { Icon, ModeBadge, Panel } from '../components/ui.tsx';
import { useActiveDevice, useLive, useMode } from '../lib/live.tsx';
import { sim, useSim, type QStatus, type SimView } from '../lib/sim.ts';

export function Arena() {
  const device = useActiveDevice();
  const mode = useMode();
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <Panel title="Panggung permainan" icon="gamepad" tone="frame-gold" action={<ModeBadge mode={mode} />}>
        <GameStage device={device} />
      </Panel>
      {mode === 'demo' ? <SimulatorPanel /> : (
        <Panel title="Mode LIVE" icon="cpu">
          <p className="text-ink-100">Permainan berjalan di ESP8266. Simulator dimatikan supaya data simulasi tidak bercampur dengan data alat.</p>
          <p className="mt-3 text-sm text-ink-300">Jarak mentah, Wi-Fi, dan error sensor bisa dilihat di Device Monitor. Mode bisa diganti di Pengaturan.</p>
        </Panel>
      )}
    </div>
  );
}

const Q_LABEL: Record<QStatus, [string, string]> = {
  pending: ['menunggu', 'text-warn'], acked: ['diterima server', 'text-ok'], rejected: ['ditolak', 'text-bad'], dropped: ['hilang (antrean penuh)', 'text-bad'],
};

function SimulatorPanel() {
  const { operator, settings } = useLive();
  const v = useSim();

  useEffect(() => {
    if (settings) sim.configure(settings, settings.muted);
  }, [settings]);

  if (!operator) {
    return (
      <Panel title="Simulator perangkat" icon="cpu">
        <p className="text-ink-100">Simulator mengirim data atas nama operator, jadi perlu login dulu.</p>
        <a href="#/settings" className="px-btn mt-4"><Icon name="login" className="size-4" />Login operator</a>
      </Panel>
    );
  }

  const key = (down: boolean) => (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) sim.press(down);
  };

  return (
    <Panel
      title="Simulator SIM-01"
      icon="cpu"
      action={(
        <button type="button" className={v.running ? 'px-btn-ghost text-sm' : 'px-btn text-sm'} onClick={() => (v.running ? sim.stop() : sim.start())}>
          <Icon name={v.running ? 'close' : 'play'} className="size-4" />{v.running ? 'Matikan' : 'Nyalakan'}
        </button>
      )}
    >
      <div className="flex flex-col gap-5">
        <Oled v={v} />

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <button
            type="button"
            disabled={!v.running}
            aria-pressed={v.pressed}
            aria-describedby="pad-help"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); sim.press(true); }}
            onPointerUp={() => sim.press(false)}
            onPointerCancel={() => sim.press(false)}
            onKeyDown={key(true)}
            onKeyUp={key(false)}
            onContextMenu={(e) => e.preventDefault()}
            className={`px-btn row-span-2 min-h-28 touch-none flex-col text-lg ${v.pressed ? 'px-pressed' : ''}`}
          >
            <Icon name="hand" className="size-8" />
            Pad sentuh TTP223
          </button>
          <button type="button" disabled={!v.running} className="px-btn-ghost text-sm" onClick={() => sim.pulse(120)}>Sentuh singkat</button>
          <button type="button" disabled={!v.running} className="px-btn-ghost text-sm" onClick={() => sim.pulse(1400)}>Tahan 1,4 dtk</button>
        </div>
        <p id="pad-help" className="-mt-2 text-xs text-ink-300">Klik atau tekan Spasi sebentar untuk pindah menu dan mengunci jarak. Tahan 1,2 detik untuk memilih. Logikanya sama dengan firmware.</p>

        <div className="flex flex-col gap-2">
          <label htmlFor="sim-distance" className="flex items-center justify-between text-sm font-semibold text-ink-100">
            <span>Jarak tangan ke HC-SR04 (simulasi)</span>
            <output htmlFor="sim-distance" className="font-score text-sm text-gold-400">{v.distanceCm.toFixed(1).replace('.', ',')} cm</output>
          </label>
          <input id="sim-distance" type="range" min={2} max={60} step={0.1} value={v.distanceCm} onChange={(e) => sim.set({ distanceCm: Number(e.target.value) })} className="h-8 w-full accent-gold-500" />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Toggle id="sim-fault" checked={v.sensorFault} onChange={(c) => sim.set({ sensorFault: c })} label="Sensor error" hint="Tanpa pantulan / timeout" />
          <Toggle id="sim-offline" checked={v.offline} onChange={(c) => sim.set({ offline: c })} label="Putuskan Wi-Fi" hint="Event ditahan di antrean" />
        </div>

        {v.netError && <p role="alert" className="px-frame-bad p-3 text-sm text-ink-50">Server: {v.netError}</p>}

        <div>
          <h3 className="mb-2 flex items-center justify-between text-sm text-ink-200">
            <span>Antrean event (RAM)</span>
            <span className="font-sans text-xs text-ink-300">{v.pending} menunggu, {v.dropped} hilang</span>
          </h3>
          {v.queue.length === 0 ? <p className="text-sm text-ink-300">Belum ada event.</p> : (
            <ul className="flex flex-col gap-1 text-xs">
              {v.queue.map((q) => (
                <li key={q.eventId} className="flex items-center justify-between gap-2 bg-ink-950 px-2 py-1.5">
                  <span className="truncate font-mono text-ink-200" title={q.eventId}>{q.kind === 'game' ? 'Game' : 'Rating'}: {q.eventId.slice(-10)}</span>
                  <span className={`shrink-0 font-semibold ${Q_LABEL[q.status][1]}`}>{Q_LABEL[q.status][0]}{q.status === 'pending' && q.attempts ? ` (coba ${q.attempts}×)` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (c: boolean) => void; label: string; hint: string }) {
  return (
    <label htmlFor={id} className={`flex min-h-11 items-center gap-3 px-3 py-2 ${checked ? 'px-frame-bad' : 'px-frame-inset'}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-bad" />
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-ink-50">{label}</span>
        <span className="text-xs text-ink-300">{hint}</span>
      </span>
    </label>
  );
}

/** Ringkasan teks layar OLED firmware (firmware/include/screens.h). Tampilan grafisnya: npm run oled:preview. */
const RESULT_LABEL = ['COBA LAGI', 'NICE', 'PRO', 'MASTER']; // sama dengan firmware screens.h

function oledLines(v: SimView): string[] {
  const s = v.snap;
  const left = Math.ceil((s.remainingMs ?? 0) / 1000);
  const roundLabel = `RONDE ${s.round}/${ROUNDS}`;
  switch (s.state) {
    case 'IDLE': return ['TASTEQUEST', 'ProxiRush + Rating', '', 'Sentuh utk mulai'];
    case 'MENU': return ['MENU', ...MENU_ITEMS.map((m, i) => `${i === s.menuIndex ? '>' : ' '} ${m}`), 'Sentuh:pilih Tahan:OK'];
    case 'READY': return [s.practice ? 'LATIHAN' : 'PROXIRUSH', `${ROUNDS} ronde`, 'Atur jarak, sentuh', 'Tahan=mulai Sentuh=batal'];
    case 'COUNTDOWN': return [roundLabel, `Target ${s.targetCm} cm`, '', `   ${left}`];
    case 'ROUND_ACTIVE': return [
      `${roundLabel}   ${left}s`, `TARGET ${s.targetCm} cm`,
      s.notice === 'NO_READING' ? 'Sensor tak terbaca!' : s.practice ? `Jarak ${v.reading === null ? '--' : v.reading.toFixed(1)} cm` : 'Jarak: rahasia',
      'SENTUH=KUNCI, ATAU TUNGGU',
    ];
    case 'ROUND_RESULT': {
      const r = s.results.at(-1)!;
      return r.measuredCm === null ? ['WAKTU HABIS', `Target ${r.targetCm} cm`, '+0 poin', ''] : [`Target ${r.targetCm} cm`, `Kunci ${r.measuredCm.toFixed(1)} cm`, `Selisih ${Math.abs(r.measuredCm - r.targetCm).toFixed(1)} cm`, `+${r.score} poin`];
    }
    case 'GAME_RESULT': return [
      s.practice ? 'LATIHAN SELESAI' : `SKOR AKHIR ${RESULT_LABEL[resultTier(s.totalScore ?? 0)]}`, `${s.totalScore} / ${ROUNDS * 100}`,
      s.results.map((r) => `${r.score}`).join(' '), 'Sentuh: lanjut',
    ];
    case 'RATING_OFFER': return ['Beri rating karya?', '', 'Tahan  = Ya', 'Sentuh = Lewati'];
    case 'RATING': return ['Nilai karya kami', `${'*'.repeat(s.stars)}${'.'.repeat(5 - s.stars)} (${s.stars})`, s.notice === 'PICK_STAR' ? 'Pilih bintang dulu' : '', 'Sentuh:ganti Tahan:OK'];
    case 'THANK_YOU': {
      const st = v.queue.find((q) => q.eventId === s.ratingEventId)?.status;
      return ['TERIMA KASIH!', '', s.rated ? (st === 'acked' ? 'Terkirim ke server' : st === 'rejected' ? 'Ditolak server' : 'Tersimpan, antre') : 'Sampai jumpa!', ''];
    }
  }
}

function Oled({ v }: { v: SimView }) {
  return (
    <figure className="flex flex-col gap-1">
      <div data-testid="oled" className="mx-auto aspect-[2/1] w-full max-w-sm border-4 border-ink-800 bg-black p-3 font-mono text-sm leading-6 text-sky-100">
        {v.running ? oledLines(v).map((l, i) => <div key={i} className="truncate whitespace-pre">{l || ' '}</div>) : <div className="text-ink-400">(mati)</div>}
      </div>
      <figcaption className="text-center text-xs text-ink-300">Pratinjau OLED 128×64 (SSD1306)</figcaption>
    </figure>
  );
}
