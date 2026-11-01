// Collectible VIP Album: serve each VIP once to unlock their card and lore.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { VIPS } from '../game/data';
import { useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { Character, VIP_LOOKS } from './Avatars';
import { IngredientIcon, STAGE_ICONS } from './Icons';

export default function VIPAlbum() {
  const { save } = useGame();
  const [open, setOpen] = useState(null);
  const found = save.album.length;

  return (
    <div className="flex h-full flex-col px-3 pb-2">
      <div className="pt-1">
        <h2 className="title-outline text-[28px] leading-none">VIP Album</h2>
        <div className="mt-1 text-xs font-medium text-cream/75">Serve rare VIP guests to collect their stories.</div>
        <div className="pill-track mt-2 h-4 p-[2px]">
          <motion.div className="pill-fill h-full bg-gradient-to-r from-gold-300 via-[#ffb0c8] to-[#c3a4ff]" animate={{ width: `${Math.max(4, (found / VIPS.length) * 100)}%` }} />
        </div>
        <div className="mt-0.5 text-right font-display text-[12px] text-gold-200">
          {found}/{VIPS.length} collected
        </div>
      </div>

      <div className="mt-2 grid flex-1 auto-rows-min grid-cols-2 gap-3.5 overflow-y-auto overscroll-contain p-2 pb-4">
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
              className={`relative flex aspect-[4/5] flex-col items-center justify-end overflow-hidden rounded-[26px] p-2 pb-3 text-center ${
                unlocked ? 'bg-gradient-to-b from-[#fff8dc] via-[#ffe9a8] to-[#ffc95c] text-roast-800' : 'bg-gradient-to-b from-roast-700 to-roast-900 text-cream/60'
              }`}
              style={{
                boxShadow: unlocked
                  ? 'inset 0 3px 0 rgba(255,255,255,.9), 0 0 0 3px #f5b700, 0 0 0 6px #fff1b0, 0 8px 18px -6px rgba(0,0,0,.6), 0 0 22px rgba(255,210,63,.35)'
                  : 'inset 0 3px 8px rgba(0,0,0,.5), 0 0 0 3px #7c4a2b, 0 8px 16px -8px rgba(0,0,0,.6)',
              }}
            >
              {unlocked && <div className="holo absolute inset-0 rounded-[20px]" />}
              {unlocked && <div className="absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(circle_at_50%_60%,rgba(255,255,255,.9),transparent_65%)]" />}
              <div className={`relative ${unlocked ? '' : 'opacity-35 [filter:brightness(0)]'}`}>
                <Character look={VIP_LOOKS[v.id]} size={86} expr={unlocked ? 'happy' : 'idle'} still={!unlocked} />
              </div>
              <div className="relative mt-1 font-display text-[15px] leading-tight">{unlocked ? v.name : '???'}</div>
              <div className="relative text-[10px] font-semibold uppercase tracking-wide opacity-80">{unlocked ? v.title : 'Not yet met'}</div>
              <div className={`label-chip absolute left-2 top-2 ${unlocked ? 'bg-gold-500 text-white' : 'bg-black/30'}`}>#{i + 1}</div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.div
              className="relative w-full max-w-sm overflow-hidden rounded-[34px] bg-gradient-to-b from-[#fffbe8] via-[#fff0bf] to-[#ffd77a] p-5 text-center text-roast-800"
              style={{ boxShadow: 'inset 0 3px 0 #fff, 0 0 0 4px #f5b700, 0 0 0 8px #fff1b0, 0 0 50px rgba(255,210,63,.6)' }}
              initial={{ rotateY: 90, scale: 0.7 }}
              animate={{ rotateY: 0, scale: 1 }}
              exit={{ rotateY: -90, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="holo absolute inset-0" />
              <div className="relative -mt-2 flex justify-center"><Character look={VIP_LOOKS[open.id]} size={130} expr="love" /></div>
              <h3 className="title-outline relative text-[28px]">{open.name}</h3>
              <div className="relative text-xs font-bold uppercase tracking-widest text-gold-700">{open.title}</div>
              <p className="relative my-3 text-[14px] font-medium leading-relaxed">{open.lore}</p>
              <div className="card relative p-2.5 text-sm">
                <div className="font-display">★ Signature: {open.recipe.name}</div>
                <div className="mt-1 flex flex-wrap justify-center gap-1">
                  {open.recipe.seq.map((id, i) => (
                    <span key={`${id}-${i}`} className="card-inset relative flex items-center px-0.5">
                      <IngredientIcon id={id} size={24} />
                      <span className="absolute -left-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-roast-700 text-[8px] font-bold text-cream">{i + 1}</span>
                    </span>
                  ))}
                  {open.recipe.steps.map((s) => (
                    <span key={s} className="grid place-items-center rounded-xl bg-sky-200/80 px-1">
                      {(() => {
                        const Icon = STAGE_ICONS[s];
                        return <Icon size={22} />;
                      })()}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="btn btn-roast relative mt-4 px-8 py-2.5 font-display text-lg">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
