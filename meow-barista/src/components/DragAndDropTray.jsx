// Ingredient tray: clay tiles you drag onto the cup (or quick-tap). Dragging leaves a
// glowing sparkle trail in the ingredient's colour.
import { memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { INGREDIENTS, INGREDIENT_ORDER } from '../game/data';
import { haptic, HAPTIC } from '../hooks/haptics';
import { audio } from '../audio/engine';
import { IngredientIcon } from './Icons';
import { LIQUID } from './Cup';
import { useParticles } from './Particles';

const HIT_PADDING = 36; // forgiving drop target for thumbs
const TRAIL_MS = 28;

function isOver(el, point) {
  if (!el || !point) return false;
  const r = el.getBoundingClientRect();
  return point.x >= r.left - HIT_PADDING && point.x <= r.right + HIT_PADDING && point.y >= r.top - HIT_PADDING && point.y <= r.bottom + HIT_PADDING;
}

/** framer-motion reports page coordinates; convert to viewport for getBoundingClientRect. */
const toViewport = (p) => ({ x: p.x - window.scrollX, y: p.y - window.scrollY });

const TILE_TINT = {
  espresso: 'from-[#fff3e2] to-[#f1d3ae]',
  milk: 'from-[#ffffff] to-[#e6f2fb]',
  catnip: 'from-[#f1fde9] to-[#cdeec0]',
  ice: 'from-[#f2fbff] to-[#cfeaf8]',
};

const IngredientChip = memo(function IngredientChip({ ing, cupRef, onAdd, onHover, disabled, fever, needed, trail }) {
  const hovering = useRef(false);
  const dragging = useRef(false); // guards against onTap also firing after a drag
  const lastTrail = useRef(0);

  const setHover = (v) => {
    if (hovering.current !== v) {
      hovering.current = v;
      onHover(v);
      if (v) haptic(HAPTIC.tap);
    }
  };

  return (
    <motion.button
      type="button"
      aria-label={`Add ${ing.name}`}
      disabled={disabled}
      drag={!disabled}
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
        setHover(isOver(cupRef.current, p));
        const now = performance.now();
        if (now - lastTrail.current > TRAIL_MS) {
          lastTrail.current = now;
          trail(p.x, p.y, fever ? '#ffd23f' : LIQUID[ing.id].particle);
        }
      }}
      onDragEnd={(_, info) => {
        const p = toViewport(info.point);
        setHover(false);
        if (isOver(cupRef.current, p)) onAdd(ing.id, p);
        setTimeout(() => (dragging.current = false), 50);
      }}
      onTap={(e, info) => {
        if (!disabled && !dragging.current) onAdd(ing.id, toViewport(info.point));
      }}
      className={`relative flex touch-none select-none flex-col items-center justify-center rounded-[20px] bg-gradient-to-b px-1 pb-1 pt-1.5 ${
        fever ? 'from-gold-200 to-gold-400' : TILE_TINT[ing.id]
      } ${disabled ? 'opacity-45 saturate-50' : ''}`}
      style={{
        touchAction: 'none',
        boxShadow: needed
          ? 'inset 0 2px 0 rgba(255,255,255,.9), inset 0 -3px 0 rgba(0,0,0,.08), 0 4px 0 #2c9a6f, 0 0 0 3px #72d2aa, 0 0 18px rgba(114,210,170,.8)'
          : fever
            ? 'inset 0 2px 0 rgba(255,255,255,.9), 0 4px 0 #b97c00, 0 0 16px rgba(255,210,63,.8)'
            : 'inset 0 2px 0 rgba(255,255,255,.9), inset 0 -3px 0 rgba(0,0,0,.08), 0 4px 0 #b98a62, 0 10px 16px -8px rgba(42,22,12,.6)',
      }}
    >
      <motion.span
        className="pointer-events-none"
        animate={needed ? { y: [0, -4, 0], rotate: [0, -5, 0] } : { y: 0, rotate: 0 }}
        transition={needed ? { duration: 1.1, repeat: Infinity } : { duration: 0.2 }}
      >
        <IngredientIcon id={ing.id} size={36} />
      </motion.span>
      <span className="pointer-events-none mt-0.5 font-display text-[11.5px] leading-tight tracking-wide text-roast-700">{ing.name}</span>
      {needed > 0 && (
        <span className="pointer-events-none absolute -right-1.5 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-gradient-to-b from-mint-400 to-mint-600 px-1 font-display text-xs text-white shadow-[0_2px_0_#175a41]">
          ×{needed}
        </span>
      )}
    </motion.button>
  );
});

/**
 * @param {object} props
 * @param {React.RefObject<HTMLElement>} props.cupRef drop target
 * @param {(id: string, point: {x:number,y:number}) => void} props.onAdd
 * @param {(hovering: boolean) => void} props.onHover
 * @param {Record<string, number>} props.remaining ingredients still needed (hint highlights)
 */
export default function DragAndDropTray({ cupRef, onAdd, onHover, disabled, fever, remaining = {}, showHints }) {
  const { trail } = useParticles();
  return (
    <div className="grid grid-cols-4 gap-2 px-3 pb-2.5 pt-0.5">
      {INGREDIENT_ORDER.map((id) => (
        <IngredientChip
          key={id}
          ing={INGREDIENTS[id]}
          cupRef={cupRef}
          onAdd={onAdd}
          onHover={onHover}
          disabled={disabled}
          fever={fever}
          needed={showHints ? remaining[id] || 0 : 0}
          trail={trail}
        />
      ))}
    </div>
  );
}
