// Tycoon shop: equipment upgrades, café decor, and cat-boss cosmetics.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ITEMS, UPGRADES } from '../game/data';
import { useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { centerOf, useParticles } from './Particles';
import { CoinIcon } from './Icons';
import { Character } from './Avatars';

const TABS = [
  { id: 'equipment', label: 'Equipment', icon: '⚙️' },
  { id: 'decor', label: 'Decor', icon: '🖼️' },
  { id: 'style', label: 'Boss Style', icon: '🎩' },
];

function PriceButton({ cost, affordable, onBuy, label, tone }) {
  return (
    <motion.button
      type="button"
      whileTap={affordable ? { scale: 0.92 } : { x: [0, -5, 5, 0] }}
      onClick={onBuy}
      className={`btn min-w-[82px] px-2.5 py-1.5 font-display text-[15px] ${tone || (affordable ? 'btn-gold' : 'btn-muted')}`}
    >
      {label || (
        <>
          <CoinIcon size={18} />
          {cost.toLocaleString()}
        </>
      )}
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
    floatText(c.x, c.y - 20, text, 'gold');
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
            className="sheet flex max-h-[86dvh] w-full max-w-md flex-col rounded-t-[34px] pb-[env(safe-area-inset-bottom)] text-roast-800"
            style={{ boxShadow: 'inset 0 3px 0 #fff, 0 -4px 0 #c08a5b, 0 -8px 0 #5c331d, 0 -20px 40px rgba(0,0,0,.5)' }}
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
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-roast-300" />
            <div className="flex items-center justify-between px-5 pt-2">
              <h2 className="title-outline text-[28px]">Tycoon Shop</h2>
              <div className="coin-pill flex items-center gap-1 py-0.5 pl-1 pr-3 font-display text-lg">
                <CoinIcon size={22} />
                {save.coins.toLocaleString()}
              </div>
            </div>
            <div className="px-5 text-xs font-medium text-roast-500">
              Coin multiplier ×{bonuses.coinMult.toFixed(2)} · Tips ×{bonuses.tipMult.toFixed(2)}
            </div>
            <div className="card-inset mx-4 mt-2 flex gap-1 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    audio.tap();
                  }}
                  className={`relative flex-1 rounded-xl py-2 font-display text-[13px] ${tab === t.id ? 'text-roast-800' : 'text-roast-400'}`}
                >
                  {tab === t.id && <motion.div layoutId="shop-tab" className="btn btn-gold absolute inset-0 !rounded-xl" />}
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
                    <motion.div layout key={u.id} className="card flex items-center gap-3 p-3">
                      <div className="card-inset grid h-14 w-14 shrink-0 place-items-center text-3xl">{u.emoji}</div>
                      <div className="flex-1">
                        <div className="font-display text-[16px] leading-tight">{u.name}</div>
                        <div className="text-xs font-medium text-roast-500">{u.desc}</div>
                        <div className="mt-1 flex gap-1">
                          {Array.from({ length: u.max }, (_, i) => (
                            <span key={i} className={`h-2.5 w-7 rounded-full ${i < lvl ? 'bg-gradient-to-b from-mint-300 to-mint-500 shadow-[0_0_6px_#72d2aa]' : 'bg-roast-200 shadow-[inset_0_1px_2px_rgba(0,0,0,.2)]'}`} />
                          ))}
                        </div>
                      </div>
                      {maxed ? (
                        <span className="btn btn-mint px-3 py-1.5 font-display text-sm">MAX</span>
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
                        className={`card flex flex-col items-center gap-1 p-3 text-center ${equipped ? 'ring-4 ring-mint-400' : ''}`}
                      >
                        {item.kind === 'wallpaper' ? (
                          <div className={`h-14 w-full rounded-xl shadow-[inset_0_2px_6px_rgba(0,0,0,.25)] ${item.id === 'wp_cream' ? 'wp-cozy' : item.preview}`} />
                        ) : item.kind === 'neon' ? (
                          <div className="neon-sign grid h-14 w-full place-items-center rounded-xl bg-gradient-to-b from-roast-800 to-roast-950 font-display text-sm shadow-[inset_0_2px_6px_rgba(0,0,0,.5)]" style={{ color: item.color, '--neon': item.color }}>
                            {item.text}
                          </div>
                        ) : (
                          <div className="card-inset flex h-14 w-full items-end justify-center overflow-hidden">
                            <div className="-mb-6">
                              <Character look="boss" size={64} still hat={item.kind === 'hat' ? item.id : undefined} glasses={item.kind === 'glasses' ? item.id : undefined} />
                            </div>
                          </div>
                        )}
                        <div className="font-display text-[14px] leading-tight">{item.name}</div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-mint-700">
                          {item.kind}
                          {item.bonus ? ` · +${Math.round(item.bonus * 100)}% coins` : ''}
                        </div>
                        <PriceButton
                          cost={item.cost}
                          affordable={owned || save.coins >= item.cost}
                          onBuy={(e) => onItem(e, item)}
                          label={owned ? (equipped ? (item.kind === 'wallpaper' ? '✓ Using' : '✓ Unequip') : 'Equip') : undefined}
                          tone={owned ? (equipped ? 'btn-mint' : 'btn-cream') : undefined}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}
              <p className="pt-2 text-center text-[11px] font-medium text-roast-500">Owned decor &amp; style items permanently boost coins — even when not equipped.</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
