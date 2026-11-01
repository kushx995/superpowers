// Collectible VIP Album: serve each VIP once to unlock their card and lore.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { INGREDIENTS, INGREDIENT_ORDER, VIPS } from '../game/data';
import { useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { STAGE_META } from './QTECrafting';

export default function VIPAlbum() {
  const { save } = useGame();
  const [open, setOpen] = useState(null);
  const found = save.album.length;

  return (
    <div className="flex h-full flex-col px-3 pb-2">
      <div className="pt-1">
        <h2 className="font-display text-2xl font-black text-cream">📖 VIP Album</h2>
        <div className="text-xs font-bold text-cream/70">Serve rare VIP guests to collect their stories.</div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-black/30">
          <motion.div className="h-full bg-gradient-to-r from-amber-300 to-pink-400" animate={{ width: `${(found / VIPS.length) * 100}%` }} />
        </div>
        <div className="mt-0.5 text-right text-[11px] font-black text-cream/80">
          {found}/{VIPS.length} collected
        </div>
      </div>

      <div className="mt-2 grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto overscroll-contain pb-4">
        {VIPS.map((v, i) => {
          const unlocked = save.album.includes(v.id);
          return (
            <motion.button
              type="button"
              key={v.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                audio.unlock();
                if (unlocked) {
                  audio.chime(true);
                  haptic(HAPTIC.tap);
                  setOpen(v);
                } else {
                  audio.error();
                  haptic(HAPTIC.tap);
                }
              }}
              className={`relative flex aspect-[3/4] flex-col items-center justify-center rounded-3xl border-4 p-2 text-center shadow-chunky ${
                unlocked ? 'border-amber-400 bg-gradient-to-b from-amber-50 to-amber-200 text-mocha-900' : 'border-mocha-700 bg-mocha-900/60 text-cream/60'
              }`}
            >
              {unlocked && <div className="holo absolute inset-0 rounded-[20px]" />}
              <div className={`relative text-6xl ${unlocked ? '' : 'brightness-0 opacity-40'}`}>{v.emoji}</div>
              <div className="relative mt-2 font-display text-sm font-black leading-tight">{unlocked ? v.name : '???'}</div>
              <div className="relative text-[10px] font-bold uppercase">{unlocked ? v.title : 'Not yet met'}</div>
              <div className="absolute left-2 top-2 rounded-full bg-black/20 px-1.5 text-[10px] font-black">#{i + 1}</div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div
              className="relative w-full max-w-sm overflow-hidden rounded-[32px] border-4 border-amber-400 bg-gradient-to-b from-amber-50 to-amber-200 p-5 text-center text-mocha-900"
              initial={{ rotateY: 90, scale: 0.7 }}
              animate={{ rotateY: 0, scale: 1 }}
              exit={{ rotateY: -90, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="holo absolute inset-0" />
              <div className="relative text-8xl">{open.emoji}</div>
              <h3 className="relative font-display text-2xl font-black">{open.name}</h3>
              <div className="relative text-xs font-black uppercase tracking-widest text-amber-700">{open.title}</div>
              <p className="relative my-3 text-sm font-semibold leading-relaxed">{open.lore}</p>
              <div className="relative rounded-2xl bg-white/70 p-2 text-sm">
                <div className="font-black">⭐ Signature: {open.recipe.name}</div>
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {INGREDIENT_ORDER.filter((id) => open.recipe.parts[id]).map((id) => (
                    <span key={id} className="rounded-lg bg-mocha-100 px-1.5 font-bold">
                      {INGREDIENTS[id].emoji}×{open.recipe.parts[id]}
                    </span>
                  ))}
                  {open.recipe.steps.map((s) => (
                    <span key={s} className="rounded-lg bg-sky-100 px-1.5">
                      {STAGE_META[s].icon}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="relative mt-4 rounded-2xl bg-mocha-900 px-6 py-2 font-black text-cream">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
