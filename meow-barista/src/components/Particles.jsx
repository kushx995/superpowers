// Global juice layer: emoji bursts, coloured droplets/sparkle trails, ripples and
// golden-outlined floating text ("+12", "PERFECT!").
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ParticleContext = createContext(null);
const MAX_PARTICLES = 120;

const TONES = { gold: 'ft-gold', mint: 'ft-mint', berry: 'ft-berry', sky: 'ft-sky' };

export function ParticleProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => setItems((list) => list.filter((p) => p.id !== id)), []);
  const push = useCallback((fresh) => setItems((list) => [...list, ...fresh].slice(-MAX_PARTICLES)), []);

  /** Emoji burst radiating from (x, y) in viewport coordinates. */
  const burst = useCallback(
    (x, y, { emojis = ['✨'], count = 8, spread = 90, rise = 60, size = 22, duration = 0.9 } = {}) => {
      push(
        Array.from({ length: count }, () => {
          const angle = Math.random() * Math.PI * 2;
          const dist = spread * (0.4 + Math.random() * 0.6);
          return {
            id: ++idRef.current,
            type: 'emoji',
            x,
            y,
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist - rise,
            rot: (Math.random() - 0.5) * 120,
            content: emojis[Math.floor(Math.random() * emojis.length)],
            size: size * (0.7 + Math.random() * 0.6),
            duration: duration * (0.8 + Math.random() * 0.4),
          };
        })
      );
    },
    [push]
  );

  /** Coloured liquid droplets / glowing sparks (e.g. pour splash). */
  const splash = useCallback(
    (x, y, color, { count = 10, spread = 60, size = 9, glow = true } = {}) => {
      push(
        Array.from({ length: count }, () => {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
          const dist = spread * (0.4 + Math.random() * 0.6);
          return {
            id: ++idRef.current,
            type: 'dot',
            x,
            y,
            dx: Math.cos(angle) * dist,
            dy: Math.sin(angle) * dist,
            color,
            glow,
            size: size * (0.5 + Math.random() * 0.8),
            duration: 0.5 + Math.random() * 0.35,
          };
        })
      );
    },
    [push]
  );

  /** Single trailing sparkle while dragging. */
  const trail = useCallback(
    (x, y, color) => {
      push([
        {
          id: ++idRef.current,
          type: 'dot',
          x: x + (Math.random() - 0.5) * 14,
          y: y + (Math.random() - 0.5) * 14,
          dx: (Math.random() - 0.5) * 16,
          dy: 10 + Math.random() * 16,
          color,
          glow: true,
          size: 5 + Math.random() * 7,
          duration: 0.45,
        },
      ]);
    },
    [push]
  );

  /** Expanding ring (drop ripple / Fever shockwave). */
  const ripple = useCallback((x, y, color = '#ffe27a', scale = 3) => {
    push([{ id: ++idRef.current, type: 'ring', x, y, color, scale }]);
  }, [push]);

  /** Floating label. tone: gold | mint | berry | sky. */
  const floatText = useCallback(
    (x, y, text, tone = 'gold', big = false) => {
      const half = Math.min(window.innerWidth / 2 - 8, String(text).length * (big ? 12 : 9) + 14);
      const cx = Math.min(Math.max(x, half), window.innerWidth - half);
      push([{ id: ++idRef.current, type: 'text', x: cx, y, content: text, tone: TONES[tone] ? tone : 'gold', big }]);
    },
    [push]
  );

  return (
    <ParticleContext.Provider value={{ burst, splash, trail, ripple, floatText }}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
        <AnimatePresence>
          {items.map((p) => {
            if (p.type === 'emoji')
              return (
                <motion.div
                  key={p.id}
                  className="absolute left-0 top-0 select-none"
                  style={{ fontSize: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }}
                  initial={{ x: p.x, y: p.y, scale: 0.3, opacity: 1, rotate: 0 }}
                  animate={{ x: p.x + p.dx, y: p.y + p.dy, scale: 1, opacity: 0, rotate: p.rot }}
                  transition={{ duration: p.duration, ease: 'easeOut' }}
                  onAnimationComplete={() => remove(p.id)}
                >
                  {p.content}
                </motion.div>
              );
            if (p.type === 'dot')
              return (
                <motion.div
                  key={p.id}
                  className="absolute left-0 top-0 rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    marginLeft: -p.size / 2,
                    marginTop: -p.size / 2,
                    background: `radial-gradient(circle at 35% 30%, #fff 0%, ${p.color} 45%, ${p.color} 100%)`,
                    boxShadow: p.glow ? `0 0 ${p.size}px ${p.color}` : 'none',
                  }}
                  initial={{ x: p.x, y: p.y, scale: 1, opacity: 1 }}
                  animate={{ x: p.x + p.dx, y: [p.y, p.y + p.dy, p.y + p.dy + 30], scale: 0.2, opacity: 0 }}
                  transition={{ duration: p.duration, ease: 'easeOut' }}
                  onAnimationComplete={() => remove(p.id)}
                />
              );
            if (p.type === 'ring')
              return (
                <motion.div
                  key={p.id}
                  className="absolute left-0 top-0 h-12 w-12 rounded-full"
                  style={{ marginLeft: -24, marginTop: -24, border: `4px solid ${p.color}`, boxShadow: `0 0 16px ${p.color}, inset 0 0 12px ${p.color}` }}
                  initial={{ x: p.x, y: p.y, scale: 0.2, opacity: 0.95 }}
                  animate={{ scale: p.scale, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  onAnimationComplete={() => remove(p.id)}
                />
              );
            return (
              <motion.div
                key={p.id}
                className="absolute left-0 top-0"
                initial={{ x: p.x, y: p.y, opacity: 0 }}
                animate={{ y: [p.y, p.y - 30, p.y - 95], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.25, times: [0, 0.15, 1], ease: 'easeOut' }}
                onAnimationComplete={() => remove(p.id)}
              >
                <motion.div
                  className={`float-text ${TONES[p.tone]} ${p.big ? 'ft-big' : ''} whitespace-nowrap`}
                  style={{ x: '-50%' }}
                  initial={{ scale: 0.3, rotate: -8 }}
                  animate={{ scale: [0.3, 1.35, 1], rotate: [-8, 4, 0] }}
                  transition={{ duration: 0.45, ease: 'backOut' }}
                >
                  {p.content}
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ParticleContext.Provider>
  );
}

export function useParticles() {
  const ctx = useContext(ParticleContext);
  if (!ctx) throw new Error('useParticles must be used inside <ParticleProvider>');
  return ctx;
}

/** Centre of an element in viewport coordinates. */
export function centerOf(el) {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
