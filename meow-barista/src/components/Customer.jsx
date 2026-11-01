// Customer at the counter: avatar, name tag, patience countdown and order bubble.
import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { INGREDIENTS, INGREDIENT_ORDER } from '../game/data';
import { STAGE_META } from './QTECrafting';

const exitVariants = {
  enter: { x: 220, opacity: 0, scale: 0.8 },
  center: { x: 0, opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20 } },
  exit: (outcome) =>
    outcome === 'angry'
      ? { x: 240, opacity: 0, rotate: 20, transition: { duration: 0.45 } }
      : { x: -240, y: [0, -30, 0, -20, 0], opacity: 0, transition: { duration: 0.6 } },
};

export function PatienceBar({ ratio }) {
  const color = ratio > 0.55 ? 'bg-emerald-400' : ratio > 0.25 ? 'bg-amber-400' : 'bg-rose-500';
  return (
    <motion.div
      className="h-2.5 w-20 overflow-hidden rounded-full border-2 border-mocha-900 bg-mocha-900/40"
      animate={ratio < 0.25 ? { x: [0, -2, 2, 0] } : { x: 0 }}
      transition={ratio < 0.25 ? { repeat: Infinity, duration: 0.3 } : undefined}
    >
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, ratio) * 100}%`, transition: 'width 120ms linear' }} />
    </motion.div>
  );
}

export function OrderBubble({ recipe, cup, vip, compact }) {
  return (
    <div
      className={`relative rounded-2xl border-[3px] px-2.5 py-1.5 shadow-chunky ${
        vip ? 'border-amber-500 bg-gradient-to-b from-amber-50 to-amber-200' : 'border-mocha-700 bg-white'
      }`}
    >
      <div className={`whitespace-nowrap font-display font-black leading-tight text-mocha-900 ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
        {vip && '⭐ '}
        {recipe.name}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {INGREDIENT_ORDER.filter((id) => recipe.parts[id]).map((id) => {
          const need = recipe.parts[id];
          const have = cup?.[id] || 0;
          const done = have >= need;
          return (
            <span
              key={id}
              className={`flex items-center rounded-lg px-1 text-sm font-black ${done ? 'bg-emerald-200 text-emerald-800' : 'bg-mocha-100 text-mocha-900'}`}
            >
              {INGREDIENTS[id].emoji}
              <span className="ml-0.5 text-[11px]">
                {done ? '✓' : `${have}/${need}`}
              </span>
            </span>
          );
        })}
        {recipe.steps.map((s) => (
          <span key={s} className="rounded-lg bg-sky-100 px-1 text-sm" title={STAGE_META[s].label}>
            {STAGE_META[s].icon}
          </span>
        ))}
        {recipe.hot ? <span className="text-xs">🔥</span> : <span className="text-xs">❄️</span>}
      </div>
      <div
        className={`absolute -bottom-2 right-6 h-3 w-3 rotate-45 border-b-[3px] border-r-[3px] ${
          vip ? 'border-amber-500 bg-amber-200' : 'border-mocha-700 bg-white'
        }`}
      />
    </div>
  );
}

const Customer = forwardRef(function Customer({ customer, cup, fever }, ref) {
  const ratio = customer.patience / customer.patienceMax;
  const face = ratio < 0.25 ? '😾' : null;
  return (
    <motion.div
      ref={ref}
      className="absolute bottom-0 right-0 flex flex-col items-end"
      custom={customer.outcome}
      variants={exitVariants}
      initial="enter"
      animate="center"
      exit="exit"
    >
      <OrderBubble recipe={customer.recipe} cup={cup} vip={!!customer.vip} />
      <div className="mt-2 flex items-end gap-2">
        <div className="mb-3 flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
              customer.vip ? 'bg-amber-400 text-amber-950' : 'bg-mocha-700 text-cream'
            }`}
          >
            {customer.vip ? `VIP · ${customer.name}` : customer.name}
          </span>
          <PatienceBar ratio={ratio} />
        </div>
        <motion.div
          className={`relative select-none text-[64px] leading-none ${customer.vip ? 'drop-shadow-[0_0_14px_rgba(255,210,63,0.95)]' : 'drop-shadow-lg'}`}
          animate={fever ? { y: [0, -10, 0], rotate: [0, -6, 6, 0] } : { y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: fever ? 0.45 : 1.6 }}
        >
          {customer.emoji}
          {face && <span className="absolute -right-2 -top-2 text-2xl">💢</span>}
          {customer.vip && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl">👑</span>}
        </motion.div>
      </div>
    </motion.div>
  );
});

export default Customer;
