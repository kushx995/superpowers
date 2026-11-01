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

export function WeatherWindow({ weather, fever }) {
  const w = WEATHER[weather];
  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border-4 border-mocha-700 shadow-inner">
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
      {weather === 'morning' && (
        <motion.div className="absolute right-4 text-4xl" initial={{ y: 60 }} animate={{ y: 14 }} transition={{ duration: 3 }}>
          🌞
        </motion.div>
      )}
      {weather === 'afternoon' && (
        <>
          <motion.div className="absolute right-3 top-1 text-4xl" animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
            ☀️
          </motion.div>
          <Cloud top="30%" delay={0} />
        </>
      )}
      {weather === 'rainy' && (
        <>
          <Cloud top="-4%" delay={0} dark />
          <Cloud top="10%" delay={-12} dark />
          <Rain />
        </>
      )}
      {weather === 'night' && (
        <>
          <Stars />
          <div className="absolute right-4 top-2 text-3xl drop-shadow-[0_0_12px_rgba(255,255,200,0.9)]">🌙</div>
        </>
      )}
      {/* window frame mullions */}
      <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 bg-mocha-700" />
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 bg-mocha-700" />
      {fever && <div className="absolute inset-0 animate-pulse bg-gradient-to-t from-amber-400/40 to-fuchsia-500/30 mix-blend-screen" />}
    </div>
  );
}

export function WeatherBanner({ weather }) {
  const w = WEATHER[weather];
  return (
    <motion.div
      key={weather}
      className="pointer-events-none absolute left-1/2 top-24 z-40 w-[85%] -translate-x-1/2 rounded-2xl border-2 border-white/60 bg-black/60 px-4 py-2 text-center text-white backdrop-blur"
      initial={{ opacity: 0, y: -20, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], y: [-20, 0, 0, -10], scale: [0.8, 1, 1, 0.95] }}
      transition={{ duration: 3, times: [0, 0.12, 0.8, 1] }}
    >
      <div className="font-display text-xl font-black">
        {w.icon} {w.label}
      </div>
      <div className="text-xs opacity-90">{w.blurb}</div>
    </motion.div>
  );
}

export default WeatherWindow;
