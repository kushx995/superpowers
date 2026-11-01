// Glass mug drop target. Liquid layers pour in with spring physics, glow softly and
// carry a gently animated wavy surface; becomes draggable ("swipe to serve") once ready.
import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const LIQUID = {
  espresso: { top: '#8a4a1f', bottom: '#2b1206', glow: 'rgba(160,90,40,0.55)', surface: '#c47a3c', particle: '#7a3f1a' },
  milk: { top: '#fffdf6', bottom: '#eedfc4', glow: 'rgba(255,250,235,0.7)', surface: '#ffffff', particle: '#fff8ec' },
  catnip: { top: '#b4f58a', bottom: '#3d9e2e', glow: 'rgba(130,240,110,0.65)', surface: '#d6ffb8', particle: '#72d25f' },
  ice: { top: 'rgba(235,250,255,0.9)', bottom: 'rgba(150,215,245,0.85)', glow: 'rgba(170,230,255,0.7)', surface: '#ffffff', particle: '#bfeaff' },
};

const INNER_H = 82;

function Layer({ id, height, isTop }) {
  const c = LIQUID[id];
  return (
    <motion.div
      className="liquid-glow relative w-full"
      style={{ background: `linear-gradient(180deg, ${c.top}, ${c.bottom})` }}
      initial={{ height: 0 }}
      animate={{ height }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
    >
      {/* inner glow */}
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 14px ${c.glow}` }} />
      {id === 'ice' &&
        [10, 34, 56].map((l, i) => (
          <motion.div
            key={l}
            className="absolute h-4 w-4 rounded-[4px] border-2 border-white/90 bg-sky-200/70 shadow-[inset_0_2px_0_#fff]"
            style={{ left: `${l}%`, top: 3 + (i % 2) * 5 }}
            animate={{ rotate: [i * 10, i * 10 + 8, i * 10], y: [0, -2, 0] }}
            transition={{ duration: 2 + i * 0.4, repeat: Infinity }}
          />
        ))}
      {id === 'catnip' && (
        <div className="absolute inset-0">
          {[20, 50, 75].map((l) => (
            <motion.span key={l} className="absolute h-1.5 w-1.5 rounded-full bg-white/80" style={{ left: `${l}%`, bottom: 2 }} animate={{ y: [0, -14], opacity: [1, 0] }} transition={{ duration: 1.4, repeat: Infinity, delay: l / 40 }} />
          ))}
        </div>
      )}
      {isTop && (
        <motion.svg viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -top-[5px] left-0 h-[8px] w-[200%]" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}>
          <path d="M0 6 Q12.5 0 25 6 T50 6 T75 6 T100 6 T125 6 T150 6 T175 6 T200 6 V12 H0 Z" fill={c.top} />
          <path d="M0 6 Q12.5 0 25 6 T50 6 T75 6 T100 6 T125 6 T150 6 T175 6 T200 6" stroke={c.surface} strokeWidth="2" fill="none" opacity="0.8" />
        </motion.svg>
      )}
    </motion.div>
  );
}

const Cup = forwardRef(function Cup({ layers, totalParts, hover, ready, fever, shakeKey, onServeDrop, onServeDrag }, ref) {
  const per = totalParts > 0 ? INNER_H / totalParts : 0;
  return (
    <motion.div key={shakeKey} animate={shakeKey ? { x: [0, -14, 14, -10, 10, -4, 0], rotate: [0, -6, 6, -3, 0] } : undefined} transition={{ duration: 0.45 }} className="relative">
      <motion.div
        ref={ref}
        drag={ready}
        dragSnapToOrigin
        dragMomentum={false}
        whileDrag={{ scale: 1.15, rotate: 6 }}
        onDrag={(_, info) => ready && onServeDrag?.({ x: info.point.x - window.scrollX, y: info.point.y - window.scrollY })}
        onDragEnd={(_, info) => ready && onServeDrop({ x: info.point.x - window.scrollX, y: info.point.y - window.scrollY })}
        animate={{ scale: hover ? 1.14 : ready ? [1, 1.06, 1] : 1, y: hover ? -4 : 0 }}
        transition={ready ? { repeat: Infinity, duration: 0.9 } : { type: 'spring', stiffness: 400, damping: 18 }}
        className={`relative h-[94px] w-[84px] touch-none ${ready ? 'cursor-grab' : ''}`}
        style={{ touchAction: 'none' }}
      >
        {/* halo */}
        <div
          className="absolute -inset-5 rounded-full blur-xl transition-opacity duration-200"
          style={{
            opacity: hover || ready || fever ? 0.85 : 0,
            background: hover ? 'radial-gradient(circle, #9fe3c6, transparent 70%)' : 'radial-gradient(circle, #ffd23f, transparent 70%)',
          }}
        />
        {/* saucer shadow */}
        <div className="absolute -bottom-2 left-1/2 h-4 w-[120%] -translate-x-1/2 rounded-[50%] bg-black/30 blur-[3px]" />
        {/* handle */}
        <div className="absolute right-[-18px] top-6 h-[44px] w-[26px] rounded-r-[20px] border-[6px] border-l-0 border-white/80 shadow-[2px_2px_4px_rgba(0,0,0,0.25)]" />
        {/* glass body */}
        <div className="absolute inset-0 overflow-hidden rounded-b-[32px] rounded-t-[10px] border-[5px] border-white/85 bg-white/20 shadow-[inset_0_-8px_14px_rgba(0,0,0,0.15),0_6px_14px_-6px_rgba(0,0,0,0.5)] backdrop-blur-[2px]">
          <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse">
            <AnimatePresence>
              {layers.map((id, i) => (
                <Layer key={`${id}-${i}`} id={id} height={per} isTop={i === layers.length - 1} />
              ))}
            </AnimatePresence>
          </div>
          {/* glass shine */}
          <div className="absolute left-2 top-3 h-[68%] w-2.5 rounded-full bg-gradient-to-b from-white/80 to-white/10" />
          <div className="absolute right-3 top-4 h-5 w-1.5 rounded-full bg-white/50" />
        </div>
        {ready && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="absolute block h-5 w-2.5 rounded-full bg-white/70 blur-[2px]"
                style={{ left: (i - 1) * 12 }}
                animate={{ y: [8, -16], opacity: [0, 0.9, 0], scaleX: [1, 1.6] }}
                transition={{ duration: 1.3, repeat: Infinity, delay: i * 0.4 }}
              />
            ))}
          </div>
        )}
        {layers.length === 0 && !hover && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center font-display text-[11px] leading-tight text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
            drop
            <br />
            here
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

export default Cup;
