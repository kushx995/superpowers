// Multi-stage crafting QTEs: Grind (rapid tap) and Froth (stop the sliding needle
// in the green zone). Each stage resolves to PERFECT | GOOD | MISS.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';

const GRIND_TAPS = [12, 10, 8, 6];
const GRIND_TIME = 4200;
const FROTH_SPEED = [1.55, 1.3, 1.1, 0.92]; // bar-widths per second
const FROTH_GREEN = [0.12, 0.15, 0.18, 0.22];
const FROTH_TIMEOUT = 6000;

export const STAGE_META = {
  grind: { label: 'Grind', icon: '⚙️' },
  froth: { label: 'Froth', icon: '♨️' },
  serve: { label: 'Serve', icon: '🛎️' },
};

const RESULT_STYLE = {
  PERFECT: 'from-emerald-300 to-emerald-500 text-emerald-950',
  GOOD: 'from-amber-200 to-amber-400 text-amber-950',
  MISS: 'from-rose-300 to-rose-500 text-rose-950',
};

function useRaf(callback, active) {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    if (!active) return undefined;
    let id;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      cb.current(dt, now);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

function GrindStage({ level, onResult, paused }) {
  const need = GRIND_TAPS[Math.min(level, 3)];
  const [taps, setTaps] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(false);

  const finish = (result) => {
    if (done.current) return;
    done.current = true;
    onResult(result);
  };

  const elapsedRef = useRef(0);
  useRaf((dt) => {
    if (done.current) return;
    elapsedRef.current += dt;
    setElapsed(elapsedRef.current);
    if (elapsedRef.current >= GRIND_TIME) finish('MISS');
  }, !paused);

  const tap = () => {
    if (done.current || paused) return;
    audio.grind();
    haptic(HAPTIC.tap);
    const n = taps + 1;
    setTaps(n);
    if (n >= need) finish(elapsedRef.current <= GRIND_TIME * 0.6 ? 'PERFECT' : 'GOOD');
  };

  const pct = Math.min(1, taps / need);
  const timeLeft = Math.max(0, 1 - elapsed / GRIND_TIME);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center font-display text-lg font-black text-white drop-shadow">TAP TAP TAP! Grind the beans</div>
      <motion.button
        type="button"
        onPointerDown={tap}
        whileTap={{ scale: 0.88 }}
        className="relative grid h-32 w-32 touch-none place-items-center rounded-full border-b-8 border-mocha-900 bg-gradient-to-b from-mocha-300 to-mocha-500 shadow-chunky"
        aria-label="Grind"
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="7" />
          <circle cx="50" cy="50" r="46" fill="none" stroke="#34d399" strokeWidth="7" strokeLinecap="round" strokeDasharray={289} strokeDashoffset={289 * (1 - pct)} />
        </svg>
        <motion.span className="text-6xl" animate={{ rotate: taps * 45 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}>
          ⚙️
        </motion.span>
        <span className="absolute -bottom-2 rounded-full bg-mocha-900 px-2 text-sm font-black text-amber-200">
          {taps}/{need}
        </span>
      </motion.button>
      <div className="h-2 w-48 overflow-hidden rounded-full bg-black/30">
        <div className={`h-full ${timeLeft > 0.4 ? 'bg-emerald-400' : 'bg-rose-400'}`} style={{ width: `${timeLeft * 100}%` }} />
      </div>
    </div>
  );
}

function FrothStage({ level, onResult, paused }) {
  const lvl = Math.min(level, 3);
  const green = FROTH_GREEN[lvl];
  const speed = FROTH_SPEED[lvl];
  const [zone] = useState(() => 0.22 + Math.random() * 0.56); // green zone centre
  const [pos, setPos] = useState(0);
  const dir = useRef(1);
  const posRef = useRef(0);
  const elapsed = useRef(0);
  const done = useRef(false);
  const stopHiss = useRef(null);

  useEffect(() => {
    stopHiss.current = audio.frothLoop();
    return () => stopHiss.current?.();
  }, []);

  const finish = (result) => {
    if (done.current) return;
    done.current = true;
    stopHiss.current?.();
    onResult(result);
  };

  useRaf((dt) => {
    if (done.current) return;
    elapsed.current += dt;
    if (elapsed.current > FROTH_TIMEOUT) return finish('MISS');
    let p = posRef.current + dir.current * speed * (dt / 1000);
    if (p >= 1) {
      p = 1 - (p - 1);
      dir.current = -1;
    } else if (p <= 0) {
      p = -p;
      dir.current = 1;
    }
    posRef.current = p;
    setPos(p);
  }, !paused);

  const stop = () => {
    if (done.current || paused) return;
    const d = Math.abs(posRef.current - zone);
    if (d <= green / 2) finish('PERFECT');
    else if (d <= green / 2 + 0.11) finish('GOOD');
    else finish('MISS');
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="text-center font-display text-lg font-black text-white drop-shadow">Stop the needle in the GREEN zone!</div>
      <button type="button" onPointerDown={stop} className="relative h-14 w-full touch-none overflow-hidden rounded-2xl border-4 border-mocha-900 bg-rose-400/90" aria-label="Stop frothing">
        <div className="absolute inset-y-0 bg-amber-300" style={{ left: `${(zone - green / 2 - 0.11) * 100}%`, width: `${(green + 0.22) * 100}%` }} />
        <div className="absolute inset-y-0 bg-emerald-400 shadow-[0_0_16px_#34d399]" style={{ left: `${(zone - green / 2) * 100}%`, width: `${green * 100}%` }}>
          <span className="absolute inset-0 grid place-items-center text-[10px] font-black text-emerald-950">PERFECT</span>
        </div>
        <div className="absolute inset-y-[-4px] w-2 -translate-x-1/2 rounded bg-white shadow-[0_0_10px_white]" style={{ left: `${pos * 100}%` }} />
      </button>
      <motion.button
        type="button"
        onPointerDown={stop}
        whileTap={{ scale: 0.9 }}
        className="touch-none rounded-full border-b-4 border-sky-800 bg-gradient-to-b from-sky-300 to-sky-500 px-10 py-3 font-display text-2xl font-black text-white shadow-chunky"
      >
        ♨️ STOP!
      </motion.button>
    </div>
  );
}

/**
 * @param {object} props
 * @param {string[]} props.steps e.g. ['grind', 'froth']
 * @param {{grinder:number, frother:number}} props.upgrades
 * @param {(result: string, index: number) => void} props.onStage called after each stage
 * @param {(results: string[]) => void} props.onDone
 */
export default function QTECrafting({ steps, upgrades, onStage, onDone, paused }) {
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState(null);
  const results = useRef([]);

  const handleResult = (result) => {
    results.current.push(result);
    setFlash(result);
    onStage?.(result, index);
    if (result === 'PERFECT') {
      audio.chime(true);
      haptic(HAPTIC.perfect);
    } else if (result === 'GOOD') {
      audio.chime(false);
      haptic(HAPTIC.good);
    } else {
      audio.error();
      haptic(HAPTIC.error);
    }
    setTimeout(() => {
      setFlash(null);
      if (index + 1 >= steps.length) onDone(results.current);
      else setIndex(index + 1);
    }, 650);
  };

  const step = steps[index];
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-3xl bg-mocha-900/85 p-4 backdrop-blur-sm"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div className="mb-1 flex items-center gap-2">
        {[...steps, 'serve'].map((s, i) => (
          <div
            key={s + i}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ${
              i < index ? 'bg-emerald-500 text-white' : i === index ? 'bg-amber-300 text-mocha-900' : 'bg-white/15 text-white/60'
            }`}
          >
            <span>{STAGE_META[s].icon}</span>
            <span>
              {i + 1}. {STAGE_META[s].label}
            </span>
          </div>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step + index} className="w-full" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }}>
          {step === 'grind' && <GrindStage level={upgrades.grinder} onResult={handleResult} paused={paused || !!flash} />}
          {step === 'froth' && <FrothStage level={upgrades.frother} onResult={handleResult} paused={paused || !!flash} />}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {flash && (
          <motion.div
            className={`pointer-events-none absolute rounded-2xl bg-gradient-to-b px-6 py-2 font-display text-4xl font-black shadow-chunky ${RESULT_STYLE[flash]}`}
            initial={{ scale: 0.2, rotate: -15, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          >
            {flash}!
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
