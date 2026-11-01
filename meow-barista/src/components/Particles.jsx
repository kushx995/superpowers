// Global juice layer: emoji particle bursts and floating text pop-ups.
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ParticleContext = createContext(null);
const MAX_PARTICLES = 90;

export function ParticleProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const remove = useCallback((id) => setItems((list) => list.filter((p) => p.id !== id)), []);

  /** Emoji burst radiating from (x, y) in viewport coordinates. */
  const burst = useCallback((x, y, { emojis = ['✨'], count = 8, spread = 90, rise = 60, size = 22, duration = 0.9 } = {}) => {
    const fresh = Array.from({ length: count }, () => {
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
    });
    setItems((list) => [...list, ...fresh].slice(-MAX_PARTICLES));
  }, []);

  /** Floating label like "+12 🪙" or "PERFECT!". */
  const floatText = useCallback((x, y, text, className = 'text-amber-300') => {
    // keep labels on-screen when spawned near an edge
    const cx = Math.min(Math.max(x, 90), window.innerWidth - 90);
    const p = { id: ++idRef.current, type: 'text', x: cx, y, content: text, className };
    setItems((list) => [...list, p].slice(-MAX_PARTICLES));
  }, []);

  return (
    <ParticleContext.Provider value={{ burst, floatText }}>
      {children}
      <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
        <AnimatePresence>
          {items.map((p) =>
            p.type === 'emoji' ? (
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
            ) : (
              <motion.div
                key={p.id}
                className={`absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap font-display text-2xl font-black drop-shadow-[0_2px_0_rgba(0,0,0,0.6)] ${p.className}`}
                initial={{ x: p.x, y: p.y, scale: 0.4, opacity: 0 }}
                animate={{ y: p.y - 80, scale: [0.4, 1.3, 1], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                onAnimationComplete={() => remove(p.id)}
              >
                {p.content}
              </motion.div>
            )
          )}
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
