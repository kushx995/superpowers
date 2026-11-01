// Ingredient tray with LIMITED STOCK. Drag a tile onto any station's cup (or tap
// to pour into the selected cup). Empty trays must be refilled with Restock,
// which locks the whole tray for a couple of seconds — time it for a lull.
import { memo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { INGREDIENTS, INGREDIENT_ORDER } from '../game/data';
import { haptic, HAPTIC } from '../hooks/haptics';
import { audio } from '../audio/engine';
import { CrateIcon, IngredientIcon } from './Icons';
import { LIQUID } from './Cup';
import { useParticles } from './Particles';

const HIT_PADDING = 22; // forgiving drop targets for thumbs (smaller now that cups sit side by side)
const TRAIL_MS = 28;

function hitIndex(refs, point) {
  let best = -1;
  let bestD = Infinity;
  refs.forEach((ref, i) => {
    const el = ref?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (point.x >= r.left - HIT_PADDING && point.x <= r.right + HIT_PADDING && point.y >= r.top - HIT_PADDING && point.y <= r.bottom + HIT_PADDING) {
      const d = Math.hypot(point.x - (r.left + r.width / 2), point.y - (r.top + r.height / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  });
  return best;
}

/** framer-motion reports page coordinates; convert to viewport for getBoundingClientRect. */
const toViewport = (p) => ({ x: p.x - window.scrollX, y: p.y - window.scrollY });

const TILE_TINT = {
  espresso: 'from-[#fff3e2] to-[#f1d3ae]',
  milk: 'from-[#ffffff] to-[#e6f2fb]',
  steam: 'from-[#fff1ea] to-[#ffd1bd]',
  ice: 'from-[#f2fbff] to-[#cfeaf8]',
  catnip: 'from-[#f1fde9] to-[#cdeec0]',
};

const IngredientChip = memo(function IngredientChip({ ing, cupRefs, onAdd, onHover, disabled, fever, hinted, stock, cap, trail }) {
  const hovering = useRef(-1);
  const dragging = useRef(false); // guards against onTap also firing after a drag
  const lastTrail = useRef(0);
  const empty = stock <= 0;
  const off = disabled || empty;

  const setHover = (v) => {
    if (hovering.current !== v) {
      hovering.current = v;
      onHover(v);
      if (v >= 0) haptic(HAPTIC.tap);
    }
  };

  return (
    <motion.button
      type="button"
      aria-label={`Add ${ing.name}`}
      data-stock={stock}
      disabled={off}
      drag={!off}
      dragSnapToOrigin
      dragElastic={0.9}
      dragMomentum={false}
      whileDrag={{ scale: 1.3, zIndex: 60, rotate: -10, filter: 'drop-shadow(0 14px 12px rgba(0,0,0,0.45))' }}
      whileTap={{ scale: 0.9 }}
      onDragStart={() => {
        dragging.current = true;
        audio.tap();
        haptic(HAPTIC.tap);
      }}
      onDrag={(_, info) => {
        const p = toViewport(info.point);
        setHover(hitIndex(cupRefs, p));
        const now = performance.now();
        if (now - lastTrail.current > TRAIL_MS) {
          lastTrail.current = now;
          trail(p.x, p.y, fever ? '#ffd23f' : LIQUID[ing.id].particle);
        }
      }}
      onDragEnd={(_, info) => {
        const p = toViewport(info.point);
        const idx = hitIndex(cupRefs, p);
        setHover(-1);
        if (idx >= 0) onAdd(ing.id, idx);
        setTimeout(() => (dragging.current = false), 50);
      }}
      onTap={() => {
        if (!off && !dragging.current) onAdd(ing.id, null);
      }}
      className={`relative flex touch-none select-none flex-col items-center justify-center rounded-[18px] bg-gradient-to-b px-0.5 pb-1 pt-1 ${
        fever ? 'from-gold-200 to-gold-400' : TILE_TINT[ing.id]
      } ${off ? 'opacity-50 saturate-[0.35]' : ''}`}
      style={{
        touchAction: 'none',
        boxShadow: hinted
          ? 'inset 0 2px 0 rgba(255,255,255,.9), 0 4px 0 #2c9a6f, 0 0 0 3px #72d2aa, 0 0 16px rgba(114,210,170,.8)'
          : fever
            ? 'inset 0 2px 0 rgba(255,255,255,.9), 0 4px 0 #b97c00, 0 0 14px rgba(255,210,63,.8)'
            : 'inset 0 2px 0 rgba(255,255,255,.9), inset 0 -3px 0 rgba(0,0,0,.08), 0 4px 0 #b98a62, 0 10px 16px -8px rgba(42,22,12,.6)',
      }}
    >
      <motion.span
        className="pointer-events-none"
        animate={hinted ? { y: [0, -4, 0], rotate: [0, -5, 0] } : { y: 0, rotate: 0 }}
        transition={hinted ? { duration: 1.1, repeat: Infinity } : { duration: 0.2 }}
      >
        <IngredientIcon id={ing.id} size={30} />
      </motion.span>
      <span className="pointer-events-none font-display text-[10.5px] leading-tight tracking-wide text-roast-700">{ing.name}</span>
      {/* stock pips */}
      <span className="pointer-events-none mt-0.5 flex gap-[2px]">
        {Array.from({ length: Math.min(cap, 10) }, (_, i) => (
          <span key={i} className={`h-1.5 w-1 rounded-full ${i < stock ? (stock <= 1 ? 'bg-berry-500' : 'bg-roast-600') : 'bg-roast-300/50'}`} />
        ))}
      </span>
      {empty && (
        <span className="pointer-events-none absolute inset-x-1 top-[38%] -rotate-12 rounded-md bg-berry-500 py-[1px] text-center font-display text-[10px] text-white shadow">EMPTY</span>
      )}
    </motion.button>
  );
});

/**
 * @param {object} props
 * @param {React.RefObject<HTMLElement>[]} props.cupRefs drop targets, one per station
 * @param {(id: string, station: number|null) => void} props.onAdd null station = selected station
 * @param {(station: number) => void} props.onHover -1 when not over a cup
 * @param {Record<string, number>} props.stock
 * @param {number} props.restockLeft ms remaining (0 = not restocking)
 */
export default function DragAndDropTray({ cupRefs, onAdd, onHover, disabled, fever, hint, stock, cap, restockLeft, restockMs, onRestock }) {
  const { trail } = useParticles();
  const restocking = restockLeft > 0;
  const lowCount = INGREDIENT_ORDER.filter((id) => stock[id] <= 1).length;
  return (
    <div className="relative px-2.5 pb-2.5 pt-0.5">
      <div className="grid grid-cols-6 gap-1.5">
        {INGREDIENT_ORDER.map((id) => (
          <IngredientChip
            key={id}
            ing={INGREDIENTS[id]}
            cupRefs={cupRefs}
            onAdd={onAdd}
            onHover={onHover}
            disabled={disabled || restocking}
            fever={fever}
            hinted={hint === id}
            stock={stock[id]}
            cap={cap}
            trail={trail}
          />
        ))}
        <motion.button
          type="button"
          aria-label="Restock"
          whileTap={{ scale: 0.9 }}
          onClick={onRestock}
          disabled={restocking}
          animate={lowCount > 0 && !restocking ? { rotate: [0, -6, 6, 0] } : { rotate: 0 }}
          transition={lowCount > 0 ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.8 } : undefined}
          className={`btn flex-col !gap-0 !rounded-[18px] px-0.5 pb-1 pt-1 ${lowCount > 0 ? 'btn-gold' : 'btn-cream'}`}
        >
          <CrateIcon size={30} />
          <span className="font-display text-[10.5px] leading-tight">Restock</span>
          {lowCount > 0 && <span className="absolute -right-1 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-berry-500 font-display text-[11px] text-white shadow">{lowCount}</span>}
        </motion.button>
      </div>
      <AnimatePresence>
        {restocking && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-b-[26px] bg-roast-950/70 backdrop-blur-[1.5px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div animate={{ x: [-30, 30, -30] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}>
              <CrateIcon size={34} />
            </motion.div>
            <div className="font-display text-sm text-gold-200">Restocking the pantry…</div>
            <div className="pill-track h-3 w-40 p-[2px]">
              <div className="pill-fill h-full bg-gradient-to-b from-gold-300 to-gold-500" style={{ width: `${(1 - restockLeft / restockMs) * 100}%`, transition: 'width 100ms linear' }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
