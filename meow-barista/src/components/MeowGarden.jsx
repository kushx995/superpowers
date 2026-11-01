// Meow Garden / Cat Hotel: adopt rescue cats, feed & pet them, and collect
// passive "Purr Power" income (also earned while offline).
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RESCUE_CATS } from '../game/data';
import { catFullness, useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { centerOf, useParticles } from './Particles';
import { Character } from './Avatars';
import { CoinIcon } from './Icons';

const INK = '#3a1d0e';

function GardenBackdrop() {
  return (
    <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="gsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fdcff" />
          <stop offset="1" stopColor="#e9f8ff" />
        </linearGradient>
        <linearGradient id="ghill1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fe38a" />
          <stop offset="1" stopColor="#6cc35e" />
        </linearGradient>
        <linearGradient id="ghill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ed36c" />
          <stop offset="1" stopColor="#4ea849" />
        </linearGradient>
        <radialGradient id="gsun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c7" />
          <stop offset="0.5" stopColor="#ffe27a" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffe27a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="200" fill="url(#gsky)" />
      <circle cx="300" cy="34" r="40" fill="url(#gsun)" />
      <g fill="#fff" opacity="0.9">
        <ellipse cx="70" cy="34" rx="26" ry="10" />
        <ellipse cx="90" cy="28" rx="18" ry="10" />
        <ellipse cx="200" cy="22" rx="20" ry="7" />
      </g>
      <path d="M0 110 Q80 70 170 100 T360 92 V200 H0 Z" fill="url(#ghill1)" />
      {/* cat hotel */}
      <g transform="translate(250 58)" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
        <rect x="6" y="30" width="78" height="52" rx="6" fill="#fff3df" />
        <path d="M0 34 L45 4 L90 34 Z" fill="#e8657a" />
        <rect x="36" y="52" width="18" height="30" rx="9" fill="#a36a42" />
        <circle cx="22" cy="50" r="8" fill="#bfe7ff" />
        <circle cx="68" cy="50" r="8" fill="#bfe7ff" />
        <path d="M30 22 Q45 14 60 22" fill="none" stroke="#fff" strokeWidth="2" />
        <text x="45" y="26" textAnchor="middle" fontSize="9" fontFamily="Lilita One" fill="#fff" stroke="none">CAT HOTEL</text>
      </g>
      <path d="M0 140 Q90 110 190 136 T360 128 V200 H0 Z" fill="url(#ghill2)" />
      {/* fence */}
      <g stroke={INK} strokeWidth="2" fill="#fff8ec">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${8 + i * 22} 150 l0 -26 l6 -6 l6 6 l0 26 z`} />
        ))}
        <rect x="4" y="132" width="200" height="5" rx="2" />
      </g>
      {/* tree */}
      <g stroke={INK} strokeWidth="2.5">
        <rect x="34" y="70" width="12" height="46" rx="4" fill="#9c6640" />
        <circle cx="40" cy="58" r="26" fill="#5cc85a" />
        <circle cx="22" cy="72" r="16" fill="#72d25f" />
        <circle cx="60" cy="70" r="17" fill="#72d25f" />
        <circle cx="34" cy="50" r="4" fill="#e8657a" stroke="none" />
        <circle cx="52" cy="60" r="4" fill="#e8657a" stroke="none" />
      </g>
      {/* flowers */}
      {[
        [110, 176, '#ff8fb3'], [140, 186, '#ffd23f'], [220, 180, '#9ee6ff'], [300, 188, '#ff8fb3'], [330, 170, '#ffd23f'], [20, 184, '#c3a4ff'],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <path d={`M${x} ${y} l0 12`} stroke="#3e9b2f" strokeWidth="2" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={x + Math.cos((a * Math.PI) / 180) * 4} cy={y + Math.sin((a * Math.PI) / 180) * 4} r="3.2" fill={c} stroke={INK} strokeWidth="1" />
          ))}
          <circle cx={x} cy={y} r="2.4" fill="#fff6c7" />
        </g>
      ))}
    </svg>
  );
}

function WanderingCat({ cat, index, hungry, onPet, petted }) {
  const path = useMemo(() => {
    const xs = Array.from({ length: 4 }, () => 4 + Math.random() * 70);
    return { x: [...xs, xs[0]].map((v) => `${v}%`), dur: 10 + Math.random() * 6 };
  }, []);
  const row = index % 3;
  return (
    <motion.button
      type="button"
      className="absolute flex flex-col items-center"
      style={{ bottom: `${4 + row * 15}%`, left: 0, zIndex: 10 - row }}
      animate={hungry ? { left: path.x[0] } : { left: path.x }}
      transition={{ duration: path.dur, repeat: Infinity, ease: 'easeInOut' }}
      whileTap={{ scale: 1.2 }}
      onClick={onPet}
      aria-label={`Pet ${cat.def.name}`}
    >
      <motion.div animate={hungry ? { rotate: 0 } : { y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.7 + row * 0.15 }}>
        <Character look={cat.id} size={62 - row * 6} expr={petted ? 'love' : hungry ? 'sad' : 'idle'} />
      </motion.div>
      <span className={`label-chip -mt-1 ${hungry ? 'bg-berry-500 text-white' : 'bg-cream/90 text-roast-700'} shadow`}>{hungry ? 'hungry!' : cat.def.name}</span>
    </motion.button>
  );
}

export default function MeowGarden() {
  const { save, bonuses, adoptCat, feedCat, feedCost, collectGarden } = useGame();
  const { burst, floatText, splash } = useParticles();
  const [petted, setPetted] = useState(null);
  const adopted = save.cats.map((c) => ({ ...c, def: RESCUE_CATS.find((r) => r.id === c.id), full: catFullness(c) }));
  const pending = Math.floor(save.gardenPending);

  const fx = (e, emojis, text, tone) => {
    const c = centerOf(e.currentTarget);
    burst(c.x, c.y, { emojis, count: 10 });
    if (text) floatText(c.x, c.y - 20, text, tone);
  };

  const onCollect = (e) => {
    audio.unlock();
    const amt = collectGarden();
    if (amt > 0) {
      audio.register();
      haptic(HAPTIC.perfect);
      const c = centerOf(e.currentTarget);
      splash(c.x, c.y, '#ffd23f', { count: 18, spread: 90 });
      fx(e, ['✨'], `+${amt} Coins!`, 'gold');
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
      fx(e, ['💖', '🐾', '✨'], `Welcome, ${def.name}!`, 'berry');
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
      fx(e, ['🐟', '💕'], 'Nom nom!', 'mint');
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
    setPetted(def.id);
    setTimeout(() => setPetted((p) => (p === def.id ? null : p)), 1200);
    fx(e, ['💕', '💖'], null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden px-3 pb-2">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="title-outline text-[28px] leading-none">Meow Garden</h2>
          <div className="mt-1 text-xs font-medium text-cream/75">
            Purr Power <b className="text-mint-300">{bonuses.purrPower.toFixed(1)}/min</b> · +{Math.round(bonuses.purrBonus * 100)}% café coins
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          animate={pending > 0 ? { scale: [1, 1.06, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.2 }}
          onClick={onCollect}
          className={`btn flex-col !gap-0 px-3 py-1.5 ${pending > 0 ? 'btn-gold shadow-glow' : 'btn-muted'}`}
        >
          <span className="text-[10px] font-bold uppercase">Collect</span>
          <span className="flex items-center gap-1 font-display text-lg leading-none">
            <CoinIcon size={18} />
            {pending}
          </span>
        </motion.button>
      </div>

      {/* Garden scene */}
      <div className="relative mt-2 h-52 shrink-0 overflow-hidden rounded-[28px] shadow-soft" style={{ boxShadow: '0 0 0 4px #5c331d, 0 12px 24px -10px rgba(0,0,0,.7)' }}>
        <GardenBackdrop />
        <motion.div className="absolute left-[30%] top-[30%] text-lg" animate={{ x: [0, 40, 10, 60, 0], y: [0, -10, 6, -6, 0] }} transition={{ duration: 9, repeat: Infinity }}>
          🦋
        </motion.div>
        {adopted.length === 0 && (
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2">
            <div className="card px-4 py-3 text-center font-display text-[15px] text-roast-700">Adopt a rescue cat below to earn Purr Power — even while you're away!</div>
          </div>
        )}
        {adopted.map((c, i) => (
          <WanderingCat key={c.id} cat={c} index={i} hungry={c.full < 25} petted={petted === c.id} onPet={(e) => onPet(e, c.def)} />
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pb-4">
        {adopted.length > 0 && <div className="font-display text-sm uppercase tracking-widest text-gold-200/90">Your cats</div>}
        {adopted.map((c) => {
          const cost = feedCost(c.id);
          return (
            <div key={c.id} className="card flex items-center gap-3 p-2.5">
              <div className="card-inset grid h-[58px] w-[58px] shrink-0 place-items-center overflow-hidden">
                <div className="mt-2">
                  <Character look={c.id} size={52} expr={c.full < 25 ? 'sad' : 'idle'} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-[16px]">{c.def.name}</span>
                  <span className="text-[11px] font-semibold text-mint-700">{c.def.rate}/min</span>
                </div>
                <div className="pill-track mt-1 h-3 p-[2px]">
                  <div
                    className={`pill-fill h-full bg-gradient-to-b ${c.full > 50 ? 'from-mint-300 to-mint-500' : c.full >= 25 ? 'from-gold-300 to-gold-500' : 'from-berry-400 to-berry-600'}`}
                    style={{ width: `${Math.max(4, c.full)}%`, transition: 'width 1s linear' }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-roast-500">{c.full < 25 ? 'Hungry — purring at 30%' : `Full ${Math.round(c.full)}%`}</div>
              </div>
              <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={(e) => onFeed(e, c)} disabled={c.full > 95} className="btn btn-mint flex-col !gap-0 px-2.5 py-1.5">
                <span className="font-display text-[13px]">Feed</span>
                <span className="flex items-center gap-0.5 text-[11px] font-bold">
                  <CoinIcon size={13} />
                  {cost}
                </span>
              </motion.button>
            </div>
          );
        })}

        <div className="pt-1 font-display text-sm uppercase tracking-widest text-gold-200/90">Rescue shelter</div>
        {RESCUE_CATS.filter((r) => !save.cats.some((c) => c.id === r.id)).map((def) => {
          const can = save.coins >= def.cost;
          return (
            <div key={def.id} className="card flex items-center gap-3 p-2.5">
              <div className={`card-inset grid h-[58px] w-[58px] shrink-0 place-items-center overflow-hidden ${can ? '' : 'grayscale-[0.6]'}`}>
                <div className="mt-2">
                  <Character look={def.id} size={52} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[16px] leading-tight">
                  {def.name} <span className="text-[12px] text-mint-600">+{def.rate}/min</span>
                </div>
                <div className="text-[11px] font-medium leading-tight text-roast-500">{def.bio}</div>
              </div>
              <motion.button
                type="button"
                whileTap={can ? { scale: 0.9 } : { x: [0, -5, 5, 0] }}
                onClick={(e) => onAdopt(e, def)}
                className={`btn flex-col !gap-0 px-2.5 py-1.5 ${can ? 'btn-berry' : 'btn-muted'}`}
              >
                <span className="font-display text-[13px]">Adopt</span>
                <span className="flex items-center gap-0.5 text-[11px] font-bold">
                  <CoinIcon size={13} />
                  {def.cost.toLocaleString()}
                </span>
              </motion.button>
            </div>
          );
        })}
        {save.cats.length === RESCUE_CATS.length && <div className="card p-3 text-center font-display text-roast-700">Every rescue cat has a home! 🏆</div>}
      </div>
    </div>
  );
}
