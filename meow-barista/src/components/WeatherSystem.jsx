// Café window showing the current time of day / weather, plus helpers that
// drive the weather cycle used by the game loop.
import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WEATHER, WEATHER_CYCLE } from '../game/data';

/** Next weather in the cycle. Rainy Day is an event: it only happens ~55% of the time. */
export function nextWeather(current) {
  let idx = WEATHER_CYCLE.indexOf(current);
  for (;;) {
    idx = (idx + 1) % WEATHER_CYCLE.length;
    const id = WEATHER_CYCLE[idx];
    if (id !== 'rainy' || Math.random() < 0.55) return id;
  }
}

const Rain = memo(function Rain() {
  const drops = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 1.2, dur: 0.55 + Math.random() * 0.35 })),
    []
  );
  return (
    <div className="absolute inset-0 overflow-hidden">
      {drops.map((d) => (
        <motion.span
          key={d.id}
          className="absolute top-0 block h-4 w-[2px] rounded-full bg-sky-100/70"
          style={{ left: `${d.left}%` }}
          initial={{ y: -20 }}
          animate={{ y: 140 }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}
    </div>
  );
});

const Stars = memo(function Stars() {
  const stars = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({ id: i, left: Math.random() * 100, top: Math.random() * 70, d: Math.random() * 2 })),
    []
  );
  return stars.map((s) => (
    <motion.span
      key={s.id}
      className="absolute h-1 w-1 rounded-full bg-white"
      style={{ left: `${s.left}%`, top: `${s.top}%` }}
      animate={{ opacity: [0.2, 1, 0.2] }}
      transition={{ duration: 2 + s.d, repeat: Infinity }}
    />
  ));
});

function Cloud({ top, delay, dark }) {
  return (
    <motion.div
      className={`absolute text-4xl ${dark ? 'opacity-80 grayscale' : 'opacity-90'}`}
      style={{ top }}
      initial={{ x: '-30%' }}
      animate={{ x: '130%' }}
      transition={{ duration: 28, delay, repeat: Infinity, ease: 'linear' }}
    >
      ☁️
    </motion.div>
  );
}

function Curtain({ side }) {
  const left = side === 'left';
  return (
    <motion.svg
      viewBox="0 0 40 110"
      preserveAspectRatio="none"
      className={`absolute top-[-6px] z-[3] h-[calc(100%+14px)] w-[22%] ${left ? '-left-[8%]' : '-right-[8%]'}`}
      style={{ transformOrigin: '50% 0%' }}
      animate={{ skewX: [0, 1.5, 0], scaleX: left ? 1 : -1 }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path d="M0 0 L40 0 Q30 40 26 70 Q30 90 40 110 L0 110 Z" fill="#e8657a" stroke="#3a1d0e" strokeWidth="2.5" />
      <path d="M10 4 Q8 50 12 104 M22 4 Q18 40 18 70" stroke="#c94860" strokeWidth="3" fill="none" />
      <path d="M2 64 Q20 70 30 66" stroke="#ffd23f" strokeWidth="5" fill="none" strokeLinecap="round" />
    </motion.svg>
  );
}

export function WeatherWindow({ weather, fever }) {
  const w = WEATHER[weather];
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0 overflow-hidden rounded-t-[40px] rounded-b-lg border-[6px] border-[#8a5532] shadow-[inset_0_0_0_2px_#5c331d,0_6px_12px_-4px_rgba(42,22,12,0.6)]">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={weather}
            className={`absolute inset-0 bg-gradient-to-b ${w.sky}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
          />
        </AnimatePresence>
        {/* distant rooftops */}
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[34%] w-full opacity-80">
          <path d="M0 30 L0 16 L10 16 L10 8 L18 8 L18 14 L30 14 L34 6 L38 14 L50 14 L50 10 L62 10 L62 18 L74 18 L80 9 L86 18 L100 18 L100 30 Z" fill={weather === 'night' ? '#2a2550' : weather === 'rainy' ? '#56607a' : '#c98f7a'} />
          {weather === 'night' && [12, 22, 40, 55, 66, 90].map((x) => <rect key={x} x={x} y="20" width="3" height="3" fill="#ffd96a" />)}
        </svg>
        {weather === 'morning' && (
          <motion.div className="absolute right-5 text-3xl" initial={{ y: 50 }} animate={{ y: 10 }} transition={{ duration: 3 }}>
            <div className="h-9 w-9 rounded-full bg-gradient-to-b from-[#fff3b0] to-[#ffb547] shadow-[0_0_24px_10px_rgba(255,200,90,0.7)]" />
          </motion.div>
        )}
        {weather === 'afternoon' && (
          <>
            <motion.div className="absolute right-4 top-2 h-9 w-9 rounded-full bg-gradient-to-b from-[#fffbe0] to-[#ffd23f] shadow-[0_0_26px_12px_rgba(255,236,140,0.8)]" animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }} />
            <Cloud top="22%" delay={0} />
          </>
        )}
        {weather === 'rainy' && (
          <>
            <Cloud top="-6%" delay={0} dark />
            <Cloud top="8%" delay={-12} dark />
            <Rain />
          </>
        )}
        {weather === 'night' && (
          <>
            <Stars />
            <div className="absolute right-4 top-2 h-8 w-8 rounded-full bg-[#fff7d1] shadow-[0_0_20px_6px_rgba(255,247,200,0.6)]">
              <div className="absolute -right-1 -top-1 h-7 w-7 rounded-full bg-[#2a1b5c]" />
            </div>
          </>
        )}
        {/* glass reflection + mullions */}
        <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0)_30%,rgba(255,255,255,0)_60%,rgba(255,255,255,0.18)_70%,rgba(255,255,255,0)_80%)]" />
        <div className="absolute inset-y-0 left-1/2 w-[5px] -translate-x-1/2 bg-[#8a5532] shadow-[1px_0_0_#5c331d]" />
        <div className="absolute inset-x-0 top-[48%] h-[5px] bg-[#8a5532] shadow-[0_1px_0_#5c331d]" />
        {fever && <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-amber-400/40 to-fuchsia-500/30 mix-blend-screen" />}
      </div>
      <Curtain side="left" />
      <Curtain side="right" />
      {/* sill with a little succulent */}
      <div className="absolute -bottom-[8px] left-[-6%] z-[4] h-[10px] w-[112%] rounded-md bg-gradient-to-b from-[#e2b07c] to-[#a36a42] shadow-md" />
      <svg width="26" height="26" viewBox="0 0 26 26" className="absolute -bottom-[6px] right-[18%] z-[4] overflow-visible">
        <ellipse cx="8" cy="9" rx="4" ry="8" fill="#72d25f" stroke="#3a1d0e" strokeWidth="1.6" transform="rotate(-25 8 9)" />
        <ellipse cx="18" cy="9" rx="4" ry="8" fill="#5cc85a" stroke="#3a1d0e" strokeWidth="1.6" transform="rotate(25 18 9)" />
        <ellipse cx="13" cy="6" rx="4" ry="9" fill="#86de6e" stroke="#3a1d0e" strokeWidth="1.6" />
        <path d="M5 14 L21 14 L19 24 L7 24 Z" fill="#74c6f2" stroke="#3a1d0e" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function WeatherBanner({ weather }) {
  const w = WEATHER[weather];
  return (
    <motion.div
      key={weather}
      className="card pointer-events-none absolute left-1/2 top-[34%] z-40 w-[82%] px-4 py-2.5 text-center"
      style={{ x: '-50%' }}
      initial={{ opacity: 0, y: -20, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-20, 0, 0, -10], scale: [0.8, 1.05, 1, 0.95] }}
      transition={{ duration: 3, times: [0, 0.12, 0.8, 1] }}
    >
      <div className="font-display text-2xl text-roast-800">
        {w.icon} {w.label}
      </div>
      <div className="text-xs font-semibold text-roast-500">{w.blurb}</div>
    </motion.div>
  );
}

export default WeatherWindow;
