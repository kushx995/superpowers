// Customer at a counter seat: vector avatar with reactive expressions, trait badge
// (Impatient / Indecisive), patience meter and a STRICT-SEQUENCE order bubble.
import { forwardRef } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import { TRAITS } from '../game/data';
import { Character } from './Avatars';
import { IngredientIcon, STAGE_ICONS } from './Icons';

const variants = {
  enter: { y: 40, opacity: 0, scale: 0.8 },
  center: { y: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 20 } },
  exit: (outcome) =>
    outcome === 'angry'
      ? { x: 160, opacity: 0, rotate: 14, transition: { duration: 0.5, delay: 0.25 } }
      : { x: -160, y: [0, -26, 0, -16, 0], opacity: [1, 1, 1, 0.8, 0], transition: { duration: 0.7, delay: 0.25 } },
};

export function PatienceBar({ ratio, width = 86 }) {
  const grad = ratio > 0.55 ? 'from-mint-300 to-mint-500' : ratio > 0.25 ? 'from-gold-300 to-gold-500' : 'from-berry-400 to-berry-600';
  return (
    <motion.div
      className="pill-track h-3 p-[2px]"
      style={{ width }}
      animate={ratio < 0.25 ? { x: [0, -2, 2, 0] } : { x: 0 }}
      transition={ratio < 0.25 ? { repeat: Infinity, duration: 0.3 } : undefined}
    >
      <div className={`pill-fill h-full bg-gradient-to-b ${grad}`} style={{ width: `${Math.max(0.04, ratio) * 100}%`, transition: 'width 120ms linear' }} />
    </motion.div>
  );
}

/** Ordered recipe: numbered steps; completed steps tick, the next step glows, a ruined cup shows ✗. */
export function OrderBubble({ recipe, layers = [], ruined, vip, compact, changed }) {
  const icon = compact ? 18 : 22;
  return (
    <motion.div
      key={recipe.id}
      initial={changed ? { scale: 0.6, rotate: -8 } : false}
      animate={changed ? { scale: [0.6, 1.15, 1], rotate: [-8, 6, 0] } : { scale: 1 }}
      transition={{ duration: 0.45 }}
      className={`relative rounded-[16px] px-1.5 pb-1 pt-0.5 ${vip ? 'bg-gradient-to-b from-gold-200 to-gold-300' : 'card'} ${ruined ? 'ring-2 ring-berry-500' : ''}`}
      style={vip ? { boxShadow: 'inset 0 2px 0 rgba(255,255,255,.8), 0 0 0 3px #f5b700, 0 0 16px rgba(255,210,63,.8), 0 8px 16px -8px rgba(42,22,12,.6)' } : undefined}
    >
      <div className={`flex items-center justify-between gap-1 whitespace-nowrap font-display leading-tight text-roast-800 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
        <span className="truncate" style={{ maxWidth: compact ? 92 : 170 }}>
          {vip && <span className="text-gold-600">★ </span>}
          {recipe.name}
        </span>
        <span className={`rounded-full px-1 text-[8px] font-bold uppercase ${recipe.hot ? 'bg-berry-300/70 text-berry-700' : 'bg-sky-300/70 text-sky-600'}`}>{recipe.hot ? 'hot' : 'iced'}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-[2px]" style={{ maxWidth: compact ? 112 : 220 }}>
        {recipe.seq.map((id, i) => {
          const done = !ruined && i < layers.length && layers[i] === id;
          const next = !ruined && i === layers.length;
          return (
            <motion.span
              key={`${id}-${i}`}
              data-seq={id}
              data-state={done ? 'done' : next ? 'next' : 'todo'}
              animate={next ? { y: [0, -2, 0] } : { y: 0 }}
              transition={next ? { duration: 0.8, repeat: Infinity } : undefined}
              className={`relative grid place-items-center rounded-lg ${done ? 'bg-mint-200 opacity-70' : next ? 'bg-gold-200 ring-2 ring-gold-400' : 'card-inset'}`}
              style={{ width: icon + 4, height: icon + 4 }}
            >
              <IngredientIcon id={id} size={icon} />
              <span className={`absolute -left-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold ${done ? 'bg-mint-500 text-white' : 'bg-roast-700 text-cream'}`}>
                {done ? '✓' : i + 1}
              </span>
            </motion.span>
          );
        })}
        {recipe.steps.map((s) => {
          const Icon = STAGE_ICONS[s];
          return (
            <span key={s} className="grid place-items-center rounded-lg bg-sky-200/80" style={{ width: icon + 2, height: icon + 2 }}>
              <Icon size={icon - 4} />
            </span>
          );
        })}
      </div>
      <div className={`absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm ${vip ? 'bg-gold-300' : 'bg-cream-200'}`} />
    </motion.div>
  );
}

function pickExpr(customer, ratio, present, excited) {
  if (!present) return customer.outcome === 'angry' ? 'angry' : customer.quality === 'PERFECT' ? 'love' : 'happy';
  if (customer.reactUntil && customer.reactUntil > Date.now()) return customer.react;
  if (ratio < 0.25 || (customer.trait === 'impatient' && ratio < 0.5)) return 'angry';
  if (excited) return 'wow';
  if (ratio < 0.45) return 'sad';
  return 'idle';
}

const Customer = forwardRef(function Customer({ customer, layers, ruined, fever, excited, compact, align = 'center' }, ref) {
  const present = useIsPresent();
  const ratio = customer.patience / customer.patienceMax;
  const expr = pickExpr(customer, ratio, present, excited);
  const trait = customer.trait ? TRAITS[customer.trait] : null;
  const fuming = customer.trait === 'impatient' && ratio < 0.7;
  const pondering = customer.trait === 'indecisive' && !customer.changed && ratio < TRAITS.indecisive.changeAt + 0.15;
  return (
    <motion.div
      ref={ref}
      className={`absolute inset-x-0 bottom-0 flex flex-col ${align === 'end' ? 'items-end pr-1' : 'items-center'}`}
      custom={customer.outcome}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
        <OrderBubble recipe={customer.recipe} layers={layers} ruined={ruined} vip={!!customer.vip} compact={compact} changed={customer.changed} />
      </motion.div>
      <div className="mt-1.5 flex items-center gap-1">
        {trait && (
          <span className={`label-chip !px-1.5 ${customer.trait === 'impatient' ? 'bg-berry-500 text-white' : 'bg-sky-500 text-white'}`} title={trait.desc}>
            {trait.icon}
            {!compact && ` ${trait.label}`}
          </span>
        )}
        <span className={`label-chip ${customer.vip ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-roast-900 shadow-glow' : 'bg-roast-800/90 text-cream'}`} style={{ maxWidth: compact ? 74 : 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {customer.vip ? `VIP · ${customer.name}` : customer.name}
        </span>
      </div>
      <div className="mt-1">
        <PatienceBar ratio={ratio} width={compact ? 92 : 110} />
      </div>
      <div className="relative -mt-0.5">
        {customer.vip && (
          <motion.div
            className="absolute inset-0 -z-10 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,210,63,0.75), rgba(255,210,63,0) 65%)' }}
            animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
        {fuming && (
          <motion.div
            className="absolute -inset-x-6 inset-y-0 -z-10 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(232,101,122,0.6), rgba(232,101,122,0) 65%)' }}
            animate={{ scale: [0.9, 1.25, 0.9], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.7, repeat: Infinity }}
          />
        )}
        <AnimatePresence>
          {pondering && (
            <motion.div
              className="absolute -right-2 top-1 z-10 grid h-7 w-7 place-items-center rounded-full bg-white font-display text-sm text-sky-600 shadow-md"
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.15, 1], rotate: [0, 10, -10, 0] }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.9, repeat: Infinity }}
            >
              ?
            </motion.div>
          )}
        </AnimatePresence>
        <Character look={customer.look} expr={expr} size={compact ? 74 : 88} lively={fever || fuming} />
      </div>
    </motion.div>
  );
});

export default Customer;
