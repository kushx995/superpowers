// Multi-stage crafting QTEs: Grind (rapid tap) and Froth (stop the sliding needle
// in the green zone). Each stage resolves to PERFECT | GOOD | MISS.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { STAGE_ICONS } from './Icons';

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

const RESULT_TONE = { PERFECT: 'ft-mint', GOOD: 'ft-gold', MISS: 'ft-berry' };

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
    <div className="flex flex-col items-center gap-2">
      <div className="title-outline text-center text-lg">Tap tap tap! Grind the beans</div>
      <motion.button
        type="button"
        onPointerDown={tap}
        whileTap={{ scale: 0.9 }}
        className="relative grid h-[100px] w-[100px] touch-none place-items-center rounded-full"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #f6d6b0, #c08a5b 55%, #7c4a2b)',
          boxShadow: 'inset 0 4px 0 rgba(255,240,215,.7), inset 0 -8px 14px rgba(42,22,12,.45), 0 7px 0 #3f2214, 0 16px 24px -8px rgba(0,0,0,.7)',
        }}
        aria-label="Grind"
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(42,22,12,0.45)" strokeWidth="8" />
          <circle cx="50" cy="50" r="45" fill="none" stroke="url(#grindGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray={283} strokeDashoffset={283 * (1 - pct)} style={{ transition: 'stroke-dashoffset 120ms ease-out', filter: 'drop-shadow(0 0 4px #72d2aa)' }} />
          <defs>
            <linearGradient id="grindGrad" x1="0" x2="1">
              <stop offset="0" stopColor="#c8f0dc" />
              <stop offset="1" stopColor="#43b98a" />
            </linearGradient>
          </defs>
        </svg>
        <motion.span animate={{ rotate: taps * 45 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>
          <STAGE_ICONS.grind size={52} />
        </motion.span>
        <span className="absolute -bottom-3 rounded-full bg-gradient-to-b from-roast-700 to-roast-900 px-3 py-0.5 font-display text-base text-gold-300 shadow-md">
          {taps}/{need}
        </span>
      </motion.button>
      <div className="pill-track mt-2 h-3.5 w-52 p-[2px]">
        <div className={`pill-fill h-full bg-gradient-to-b ${timeLeft > 0.4 ? 'from-mint-300 to-mint-500' : 'from-berry-400 to-berry-600'}`} style={{ width: `${timeLeft * 100}%` }} />
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

  const left = (v) => `${Math.max(0, v) * 100}%`;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="title-outline text-center text-lg">Stop in the green zone!</div>
      <button
        type="button"
        onPointerDown={stop}
        className="pill-track relative h-14 w-full touch-none overflow-hidden !rounded-[22px] p-1"
        aria-label="Stop frothing"
      >
        <div className="absolute inset-1 rounded-[18px] bg-gradient-to-b from-berry-400 to-berry-600 shadow-[inset_0_2px_0_rgba(255,255,255,.4)]" />
        <div className="absolute inset-y-1 bg-gradient-to-b from-gold-300 to-gold-500" style={{ left: left(zone - green / 2 - 0.11), width: `${(green + 0.22) * 100}%` }} />
        <motion.div
          className="absolute inset-y-1 bg-gradient-to-b from-mint-300 to-mint-500"
          style={{ left: left(zone - green / 2), width: `${green * 100}%`, boxShadow: '0 0 18px #72d2aa, inset 0 2px 0 rgba(255,255,255,.6)' }}
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        >
          <span className="absolute inset-0 grid place-items-center font-display text-[11px] text-mint-800">PERFECT</span>
        </motion.div>
        {/* milk-foam needle */}
        <div className="absolute inset-y-0 w-0" style={{ left: `${pos * 100}%` }}>
          <div className="absolute inset-y-0 -left-[5px] w-[10px] rounded-full bg-white shadow-[0_0_12px_#fff,0_0_0_2px_#3f2214]" />
          <div className="absolute -left-[9px] -top-1 h-[18px] w-[18px] rounded-full border-2 border-roast-800 bg-cream" />
        </div>
      </button>
      <motion.button type="button" onPointerDown={stop} whileTap={{ scale: 0.92 }} className="btn btn-sky touch-none px-10 py-2.5 font-display text-2xl">
        <STAGE_ICONS.froth size={30} /> STOP!
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
export default function QTECrafting({ steps, upgrades, onStage, onDone, paused, label, onCancel }) {
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
      className="panel-wood absolute inset-0 z-30 flex flex-col items-center justify-center gap-1.5 px-4 py-2"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      {label && <div className="font-display text-[12px] text-gold-200">{label}</div>}
      {onCancel && (
        <button type="button" onClick={onCancel} className="btn btn-cream absolute right-2 top-2 z-10 px-2 py-1 font-display text-[11px]" aria-label="Craft later">
          Later ✕
        </button>
      )}
      <div className="flex items-center gap-2">
        {[...steps, 'serve'].map((s, i) => (
          <div
            key={s + i}
            className={`flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2.5 text-xs font-bold shadow-md ${
              i < index ? 'bg-gradient-to-b from-mint-300 to-mint-500 text-mint-800' : i === index ? 'bg-gradient-to-b from-gold-200 to-gold-400 text-roast-800 ring-2 ring-gold-200' : 'bg-white/10 text-cream/60'
            }`}
          >
            {(() => {
              const Icon = STAGE_ICONS[s];
              return <Icon size={18} />;
            })()}
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
            className={`float-text ft-big pointer-events-none absolute ${RESULT_TONE[flash]}`}
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
