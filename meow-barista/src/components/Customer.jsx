// Customer at the counter: vector avatar with reactive expressions, name tag,
// patience meter and a clay speech bubble showing the order.
import { forwardRef } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { INGREDIENT_ORDER } from '../game/data';
import { Character } from './Avatars';
import { IngredientIcon, STAGE_ICONS } from './Icons';

const variants = {
  enter: { x: 220, opacity: 0, scale: 0.8 },
  center: { x: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 240, damping: 20 } },
  exit: (outcome) =>
    outcome === 'angry'
      ? { x: 260, opacity: 0, rotate: 14, transition: { duration: 0.55, delay: 0.25 } }
      : { x: -260, y: [0, -26, 0, -16, 0], opacity: [1, 1, 1, 0.8, 0], transition: { duration: 0.75, delay: 0.25 } },
};

export function PatienceBar({ ratio }) {
  const grad =
    ratio > 0.55 ? 'from-mint-300 to-mint-500' : ratio > 0.25 ? 'from-gold-300 to-gold-500' : 'from-berry-400 to-berry-600';
  return (
    <motion.div
      className="pill-track h-3.5 w-[86px] p-[2px]"
      animate={ratio < 0.25 ? { x: [0, -2, 2, 0] } : { x: 0 }}
      transition={ratio < 0.25 ? { repeat: Infinity, duration: 0.3 } : undefined}
    >
      <div className={`pill-fill h-full bg-gradient-to-b ${grad}`} style={{ width: `${Math.max(0.04, ratio) * 100}%`, transition: 'width 120ms linear' }} />
    </motion.div>
  );
}

export function OrderBubble({ recipe, cup, vip }) {
  return (
    <div
      className={`relative rounded-[18px] px-2.5 pb-1.5 pt-1 ${vip ? 'bg-gradient-to-b from-gold-200 to-gold-300' : 'card'}`}
      style={vip ? { boxShadow: 'inset 0 2px 0 rgba(255,255,255,.8), 0 0 0 3px #f5b700, 0 0 18px rgba(255,210,63,.8), 0 8px 16px -8px rgba(42,22,12,.6)' } : undefined}
    >
      <div className="whitespace-nowrap font-display text-[14px] leading-tight text-roast-800">
        {vip && <span className="text-gold-600">★ </span>}
        {recipe.name}
      </div>
      <div className="mt-1 flex items-center gap-1">
        {INGREDIENT_ORDER.filter((id) => recipe.parts[id]).map((id) => {
          const need = recipe.parts[id];
          const have = cup?.[id] || 0;
          const done = have >= need;
          return (
            <motion.span
              key={id}
              data-ing={id}
              data-left={need - have}
              animate={done ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              className={`relative flex items-center rounded-xl px-0.5 ${done ? 'bg-mint-200' : 'card-inset'}`}
            >
              <IngredientIcon id={id} size={24} />
              <span className={`absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold ${done ? 'bg-mint-500 text-white' : 'bg-roast-700 text-cream'}`}>
                {done ? '✓' : need - have}
              </span>
            </motion.span>
          );
        })}
        {recipe.steps.map((s) => {
          const Icon = STAGE_ICONS[s];
          return (
            <span key={s} className="rounded-xl bg-sky-200/80 p-0.5">
              <Icon size={20} />
            </span>
          );
        })}
        <span className={`ml-0.5 rounded-full px-1.5 text-[9px] font-bold uppercase ${recipe.hot ? 'bg-berry-300/70 text-berry-700' : 'bg-sky-300/70 text-sky-600'}`}>
          {recipe.hot ? 'hot' : 'iced'}
        </span>
      </div>
      <div className={`absolute -bottom-[7px] right-9 h-3.5 w-3.5 rotate-45 rounded-sm ${vip ? 'bg-gold-300' : 'bg-cream-200'}`} />
    </div>
  );
}

function pickExpr(customer, ratio, present, excited) {
  if (!present) return customer.outcome === 'angry' ? 'angry' : customer.quality === 'PERFECT' ? 'love' : 'happy';
  if (customer.reactUntil && customer.reactUntil > Date.now()) return customer.react;
  if (ratio < 0.25) return 'angry';
  if (excited) return 'wow';
  if (ratio < 0.45) return 'sad';
  return 'idle';
}

const Customer = forwardRef(function Customer({ customer, cup, fever, excited }, ref) {
  const present = useIsPresent();
  const ratio = customer.patience / customer.patienceMax;
  const expr = pickExpr(customer, ratio, present, excited);
  return (
    <motion.div ref={ref} className="absolute bottom-0 right-0 flex flex-col items-end" custom={customer.outcome} variants={variants} initial="enter" animate="center" exit="exit">
      <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
        <OrderBubble recipe={customer.recipe} cup={cup} vip={!!customer.vip} />
      </motion.div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className={`label-chip ${customer.vip ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-roast-900 shadow-glow' : 'bg-roast-800/90 text-cream'}`}>
          {customer.vip ? `VIP · ${customer.name}` : customer.name}
        </span>
        <PatienceBar ratio={ratio} />
      </div>
      <div className="-mt-1 mr-1 flex items-end">
        <div className="relative">
          {customer.vip && (
            <motion.div
              className="absolute inset-0 -z-10 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,210,63,0.75), rgba(255,210,63,0) 65%)' }}
              animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 1.6, repeat: Infinity }}
            />
          )}
          <Character look={customer.look} expr={expr} size={92} lively={fever} />
        </div>
      </div>
    </motion.div>
  );
});

export default Customer;
