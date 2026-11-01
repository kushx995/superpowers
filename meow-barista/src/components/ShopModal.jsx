// Tycoon shop: equipment upgrades, café decor, and cat-boss cosmetics.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ITEMS, UPGRADES } from '../game/data';
import { useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { centerOf, useParticles } from './Particles';

const TABS = [
  { id: 'equipment', label: 'Equipment', icon: '⚙️' },
  { id: 'decor', label: 'Decor', icon: '🖼️' },
  { id: 'style', label: 'Boss Style', icon: '🎩' },
];

function PriceButton({ cost, affordable, onBuy, label }) {
  return (
    <motion.button
      type="button"
      whileTap={affordable ? { scale: 0.9 } : { x: [0, -5, 5, 0] }}
      onClick={onBuy}
      className={`min-w-[78px] rounded-xl border-b-4 px-2 py-1.5 text-sm font-black shadow-chunky ${
        affordable ? 'border-amber-700 bg-amber-400 text-mocha-900' : 'border-mocha-500 bg-mocha-300/60 text-mocha-700'
      }`}
    >
      {label || `🪙 ${cost.toLocaleString()}`}
    </motion.button>
  );
}

export default function ShopModal({ open, onClose }) {
  const { save, buyUpgrade, buyItem, equip, bonuses } = useGame();
  const { burst, floatText } = useParticles();
  const [tab, setTab] = useState('equipment');

  const celebrate = (e, text) => {
    const c = centerOf(e.currentTarget);
    audio.register();
    audio.chime(true);
    haptic(HAPTIC.buy);
    burst(c.x, c.y, { emojis: ['🪙', '✨', '🎉'], count: 12 });
    floatText(c.x, c.y - 20, text, 'text-amber-300');
  };
  const deny = () => {
    audio.error();
    haptic(HAPTIC.error);
  };

  const onUpgrade = (e, id) => {
    audio.unlock();
    if (buyUpgrade(id)) celebrate(e, 'Upgraded!');
    else deny();
  };
  const onItem = (e, item) => {
    audio.unlock();
    if (save.owned.includes(item.id)) {
      equip(item.kind, item.id);
      audio.tap();
      haptic(HAPTIC.tap);
      return;
    }
    if (buyItem(item.id)) celebrate(e, item.bonus ? `+${Math.round(item.bonus * 100)}% coins!` : 'Owned!');
    else deny();
  };

  const itemsFor = (kinds) => ITEMS.filter((i) => kinds.includes(i.kind));

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="flex max-h-[86dvh] w-full max-w-md flex-col rounded-t-[32px] border-t-4 border-amber-400 bg-cream pb-[env(safe-area-inset-bottom)] text-mocha-900"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-mocha-300" />
            <div className="flex items-center justify-between px-5 pt-2">
              <h2 className="font-display text-2xl font-black">🛒 Tycoon Shop</h2>
              <div className="rounded-full bg-amber-300 px-3 py-1 font-black">🪙 {save.coins.toLocaleString()}</div>
            </div>
            <div className="px-5 text-xs font-bold text-mocha-500">
              Coin multiplier ×{bonuses.coinMult.toFixed(2)} · Tips ×{bonuses.tipMult.toFixed(2)}
            </div>
            <div className="mt-2 flex gap-2 px-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    audio.tap();
                  }}
                  className={`relative flex-1 rounded-xl py-2 text-xs font-black ${tab === t.id ? 'text-mocha-900' : 'text-mocha-500'}`}
                >
                  {tab === t.id && <motion.div layoutId="shop-tab" className="absolute inset-0 rounded-xl bg-amber-200" />}
                  <span className="relative">
                    {t.icon} {t.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-6" onPointerDownCapture={(e) => e.stopPropagation()}>
              {tab === 'equipment' &&
                Object.values(UPGRADES).map((u) => {
                  const lvl = save.upgrades[u.id] || 0;
                  const maxed = lvl >= u.max;
                  const cost = u.costs[lvl];
                  return (
                    <motion.div layout key={u.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow">
                      <div className="text-3xl">{u.emoji}</div>
                      <div className="flex-1">
                        <div className="font-black">{u.name}</div>
                        <div className="text-xs text-mocha-500">{u.desc}</div>
                        <div className="mt-1 flex gap-1">
                          {Array.from({ length: u.max }, (_, i) => (
                            <span key={i} className={`h-2 w-6 rounded-full ${i < lvl ? 'bg-emerald-400' : 'bg-mocha-100'}`} />
                          ))}
                        </div>
                      </div>
                      {maxed ? (
                        <span className="rounded-xl bg-emerald-200 px-2 py-1 text-xs font-black text-emerald-800">MAX</span>
                      ) : (
                        <PriceButton cost={cost} affordable={save.coins >= cost} onBuy={(e) => onUpgrade(e, u.id)} />
                      )}
                    </motion.div>
                  );
                })}
              {tab !== 'equipment' && (
                <div className="grid grid-cols-2 gap-2">
                  {itemsFor(tab === 'decor' ? ['wallpaper', 'neon'] : ['hat', 'glasses']).map((item) => {
                    const owned = save.owned.includes(item.id);
                    const equipped = save.equipped[item.kind] === item.id;
                    return (
                      <motion.div
                        layout
                        key={item.id}
                        className={`flex flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center shadow ${equipped ? 'ring-4 ring-emerald-400' : ''}`}
                      >
                        {item.kind === 'wallpaper' ? (
                          <div className={`h-12 w-full rounded-xl border-2 border-mocha-300 ${item.preview}`} />
                        ) : item.kind === 'neon' ? (
                          <div className="neon-sign grid h-12 w-full place-items-center rounded-xl bg-mocha-900 font-display text-sm font-black" style={{ color: item.color, '--neon': item.color }}>
                            {item.text}
                          </div>
                        ) : (
                          <div className="grid h-12 place-items-center text-4xl">{item.emoji}</div>
                        )}
                        <div className="text-sm font-black leading-tight">{item.name}</div>
                        <div className="text-[10px] font-bold uppercase text-mocha-500">
                          {item.kind}
                          {item.bonus ? ` · +${Math.round(item.bonus * 100)}% coins` : ''}
                        </div>
                        <PriceButton
                          cost={item.cost}
                          affordable={owned || save.coins >= item.cost}
                          onBuy={(e) => onItem(e, item)}
                          label={owned ? (equipped ? (item.kind === 'wallpaper' ? '✓ Using' : '✓ Unequip') : 'Equip') : undefined}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
              <p className="pt-2 text-center text-[11px] font-semibold text-mocha-500">Owned decor &amp; style items permanently boost coins — even when not equipped.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
