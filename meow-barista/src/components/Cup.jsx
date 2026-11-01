// The brewing cup: drop target for ingredients, shows liquid layers, and becomes
// draggable ("swipe to serve") once the drink is ready.
import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { INGREDIENTS } from '../game/data';

const Cup = forwardRef(function Cup({ layers, totalParts, hover, ready, fever, shakeKey, onServeDrop }, ref) {
  const fillPer = totalParts > 0 ? 100 / totalParts : 0;
  return (
    <motion.div
      key={shakeKey}
      animate={shakeKey ? { x: [0, -14, 14, -10, 10, -4, 0] } : undefined}
      transition={{ duration: 0.4 }}
      className="relative"
    >
      <motion.div
        ref={ref}
        drag={ready}
        dragSnapToOrigin
        dragMomentum={false}
        whileDrag={{ scale: 1.15, rotate: 6 }}
        onDragEnd={(_, info) => ready && onServeDrop({ x: info.point.x - window.scrollX, y: info.point.y - window.scrollY })}
        animate={{ scale: hover ? 1.12 : ready ? [1, 1.06, 1] : 1 }}
        transition={ready ? { repeat: Infinity, duration: 0.9 } : { type: 'spring', stiffness: 400, damping: 18 }}
        className={`relative h-[104px] w-[92px] touch-none ${ready ? 'cursor-grab' : ''}`}
        style={{ touchAction: 'none' }}
      >
        {/* glow */}
        <div
          className={`absolute -inset-3 rounded-[40%] blur-xl transition-opacity ${
            hover ? 'bg-emerald-300 opacity-80' : ready ? 'bg-amber-300 opacity-70' : fever ? 'bg-amber-400 opacity-60' : 'opacity-0'
          }`}
        />
        {/* handle */}
        <div className="absolute right-[-18px] top-6 h-12 w-7 rounded-r-full border-[6px] border-l-0 border-white/90" />
        {/* glass */}
        <div className="absolute inset-0 overflow-hidden rounded-b-[34px] rounded-t-md border-[5px] border-white/90 bg-white/25 shadow-[inset_0_-6px_12px_rgba(0,0,0,0.15)] backdrop-blur-[1px]">
          <div className="absolute inset-x-0 bottom-0 flex flex-col-reverse">
            <AnimatePresence>
              {layers.map((id, i) => (
                <motion.div
                  key={`${id}-${i}`}
                  className={`relative w-full bg-gradient-to-b ${INGREDIENTS[id].layer}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${(fillPer / 100) * 94}px` }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 160, damping: 16 }}
                >
                  {id === 'ice' && <span className="absolute inset-0 flex items-center justify-center gap-1 text-sm">🧊🧊</span>}
                  {id === 'catnip' && <span className="absolute inset-0 flex items-center justify-center text-xs">🍃</span>}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {/* shine */}
          <div className="absolute left-2 top-2 h-[70%] w-2 rounded-full bg-white/50" />
        </div>
        {ready && (
          <motion.div className="absolute -top-7 left-1/2 -translate-x-1/2 text-2xl" animate={{ y: [0, -6, 0], opacity: [0.6, 1, 0.6] }} transition={{ repeat: Infinity, duration: 1.2 }}>
            ♨️
          </motion.div>
        )}
        {layers.length === 0 && !hover && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[10px] font-black uppercase leading-tight text-white/90">
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
