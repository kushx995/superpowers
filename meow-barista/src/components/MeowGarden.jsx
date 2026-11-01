// Meow Garden / Cat Hotel: adopt rescue cats, feed & pet them, and collect
// passive "Purr Power" income (also earned while offline).
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { RESCUE_CATS } from '../game/data';
import { catFullness, useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { centerOf, useParticles } from './Particles';

function WanderingCat({ def, index, hungry, onPet }) {
  // deterministic-ish wander path per cat
  const path = useMemo(() => {
    const xs = Array.from({ length: 4 }, () => 5 + Math.random() * 75);
    return { x: [...xs, xs[0]].map((v) => `${v}%`), dur: 9 + Math.random() * 6 };
  }, []);
  return (
    <motion.button
      type="button"
      className="absolute flex flex-col items-center"
      style={{ bottom: `${8 + (index % 3) * 22}%`, left: 0 }}
      animate={hungry ? { left: path.x[0] } : { left: path.x }}
      transition={{ duration: path.dur, repeat: Infinity, ease: 'easeInOut' }}
      whileTap={{ scale: 1.3, rotate: [-10, 10, 0] }}
      onClick={onPet}
      aria-label={`Pet ${def.name}`}
    >
      <motion.span className="text-4xl drop-shadow" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8 + (index % 3) * 0.2 }}>
        {def.emoji}
      </motion.span>
      {hungry && <span className="-mt-1 rounded-full bg-white/90 px-1 text-[10px] font-black text-rose-600">hungry!</span>}
      {!hungry && <span className="-mt-1 text-[10px] font-black text-emerald-900/70">{def.name}</span>}
    </motion.button>
  );
}

export default function MeowGarden() {
  const { save, bonuses, adoptCat, feedCat, feedCost, collectGarden } = useGame();
  const { burst, floatText } = useParticles();
  const adopted = save.cats.map((c) => ({ ...c, def: RESCUE_CATS.find((r) => r.id === c.id), full: catFullness(c) }));
  const pending = Math.floor(save.gardenPending);

  const fx = (e, emojis, text, cls) => {
    const c = centerOf(e.currentTarget);
    burst(c.x, c.y, { emojis, count: 10 });
    if (text) floatText(c.x, c.y - 20, text, cls);
  };

  const onCollect = (e) => {
    audio.unlock();
    const amt = collectGarden();
    if (amt > 0) {
      audio.register();
      haptic(HAPTIC.perfect);
      fx(e, ['🪙', '💰', '✨'], `+${amt} 🪙`, 'text-amber-300');
    } else {
      audio.error();
    }
  };

  const onAdopt = (e, def) => {
    audio.unlock();
    if (adoptCat(def.id)) {
      audio.voice('meow', 1.2);
      audio.unlock_fanfare();
      haptic(HAPTIC.buy);
      fx(e, ['💖', '🐾', '✨'], `Welcome, ${def.name}!`, 'text-pink-300');
    } else {
      audio.error();
      haptic(HAPTIC.error);
    }
  };

  const onFeed = (e, c) => {
    audio.unlock();
    if (feedCat(c.id)) {
      audio.pour('milk');
      audio.purr();
      haptic(HAPTIC.drop);
      fx(e, ['🐟', '🍗', '💕'], 'Nom nom!', 'text-emerald-300');
    } else {
      audio.error();
      haptic(HAPTIC.error);
    }
  };

  const onPet = (e, def) => {
    audio.unlock();
    audio.voice('meow', 1 + Math.random() * 0.4);
    audio.purr();
    haptic(HAPTIC.good);
    fx(e, ['💕', '💖', '😻'], null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pb-2">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="font-display text-2xl font-black text-cream">🌷 Meow Garden</h2>
          <div className="text-xs font-bold text-cream/70">
            Purr Power {bonuses.purrPower.toFixed(1)}/min · +{Math.round(bonuses.purrBonus * 100)}% café coins
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          animate={pending > 0 ? { scale: [1, 1.06, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.2 }}
          onClick={onCollect}
          className={`rounded-2xl border-b-4 px-3 py-2 text-center font-black shadow-chunky ${pending > 0 ? 'border-amber-700 bg-amber-400 text-mocha-900' : 'border-mocha-700 bg-mocha-500 text-cream/70'}`}
        >
          <div className="text-[10px] uppercase">Collect</div>
          <div>🪙 {pending}</div>
        </motion.button>
      </div>

      {/* Garden scene */}
      <div className="relative mt-2 h-48 shrink-0 overflow-hidden rounded-3xl border-4 border-emerald-800 bg-gradient-to-b from-sky-300 via-sky-200 to-emerald-300">
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-b from-emerald-400 to-emerald-600" />
        <div className="absolute left-3 top-2 text-3xl">🌳</div>
        <div className="absolute right-4 top-6 text-2xl">🌻</div>
        <div className="absolute bottom-2 right-3 text-2xl">🏡</div>
        <div className="absolute bottom-3 left-[40%] text-xl">🌼</div>
        <div className="absolute bottom-10 left-6 text-lg">🦋</div>
        {adopted.length === 0 && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center font-display text-lg font-black text-emerald-950/80">
            Adopt a rescue cat below to start earning Purr Power while you're away! 🐾
          </div>
        )}
        {adopted.map((c, i) => (
          <WanderingCat key={c.id} def={c.def} index={i} hungry={c.full < 25} onPet={(e) => onPet(e, c.def)} />
        ))}
      </div>

      <div className="mt-2 flex-1 space-y-2 overflow-y-auto overscroll-contain pb-4">
        {adopted.length > 0 && <div className="text-xs font-black uppercase tracking-widest text-cream/70">Your cats</div>}
        {adopted.map((c) => {
          const cost = feedCost(c.id);
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-cream p-2.5 text-mocha-900 shadow">
              <div className="text-3xl">{c.def.emoji}</div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-black">{c.def.name}</span>
                  <span className="text-[11px] font-bold text-mocha-500">{c.def.rate}/min</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-mocha-100">
                  <div
                    className={`h-full ${c.full > 50 ? 'bg-emerald-400' : c.full >= 25 ? 'bg-amber-400' : 'bg-rose-500'}`}
                    style={{ width: `${c.full}%`, transition: 'width 1s linear' }}
                  />
                </div>
                <div className="text-[10px] font-bold text-mocha-500">{c.full < 25 ? 'Hungry — purring at 30%' : `Full ${Math.round(c.full)}%`}</div>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={(e) => onFeed(e, c)}
                disabled={c.full > 95}
                className="rounded-xl border-b-4 border-emerald-800 bg-emerald-400 px-2 py-1.5 text-xs font-black text-emerald-950 shadow-chunky disabled:opacity-40"
              >
                🐟 Feed
                <div className="text-[10px]">🪙 {cost}</div>
              </motion.button>
            </div>
          );
        })}

        <div className="pt-1 text-xs font-black uppercase tracking-widest text-cream/70">Rescue shelter</div>
        {RESCUE_CATS.filter((r) => !save.cats.some((c) => c.id === r.id)).map((def) => {
          const can = save.coins >= def.cost;
          return (
            <div key={def.id} className="flex items-center gap-3 rounded-2xl bg-cream/90 p-2.5 text-mocha-900 shadow">
              <div className={`text-3xl ${can ? '' : 'grayscale'}`}>{def.emoji}</div>
              <div className="flex-1">
                <div className="font-black">
                  {def.name} <span className="text-[11px] font-bold text-emerald-700">+{def.rate}/min</span>
                </div>
                <div className="text-[11px] leading-tight text-mocha-500">{def.bio}</div>
              </div>
              <motion.button
                type="button"
                whileTap={can ? { scale: 0.88 } : { x: [0, -5, 5, 0] }}
                onClick={(e) => onAdopt(e, def)}
                className={`rounded-xl border-b-4 px-2 py-1.5 text-xs font-black shadow-chunky ${can ? 'border-pink-800 bg-pink-400 text-white' : 'border-mocha-500 bg-mocha-300/60 text-mocha-700'}`}
              >
                💖 Adopt
                <div className="text-[10px]">🪙 {def.cost.toLocaleString()}</div>
              </motion.button>
            </div>
          );
        })}
        {save.cats.length === RESCUE_CATS.length && <div className="text-center text-sm font-black text-cream">Every rescue cat has a home! 🏆</div>}
      </div>
    </div>
  );
}
