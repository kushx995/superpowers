// Ingredient tray. Drag an ingredient onto the cup (or quick-tap it) to pour.
import { memo, useRef } from 'react';
import { motion } from 'framer-motion';
import { INGREDIENTS, INGREDIENT_ORDER } from '../game/data';
import { haptic, HAPTIC } from '../hooks/haptics';
import { audio } from '../audio/engine';

const HIT_PADDING = 36; // forgiving drop target for thumbs

function isOver(el, point) {
  if (!el || !point) return false;
  const r = el.getBoundingClientRect();
  return (
    point.x >= r.left - HIT_PADDING &&
    point.x <= r.right + HIT_PADDING &&
    point.y >= r.top - HIT_PADDING &&
    point.y <= r.bottom + HIT_PADDING
  );
}

/** framer-motion reports page coordinates; convert to viewport for getBoundingClientRect. */
const toViewport = (p) => ({ x: p.x - window.scrollX, y: p.y - window.scrollY });

const IngredientChip = memo(function IngredientChip({ ing, cupRef, onAdd, onHover, disabled, fever, needed }) {
  const hovering = useRef(false);
  const dragging = useRef(false); // guards against onTap also firing after a drag

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
      whileDrag={{ scale: 1.35, zIndex: 60, rotate: -8 }}
      whileTap={{ scale: 0.9 }}
      onDragStart={() => {
        dragging.current = true;
        audio.tap();
        haptic(HAPTIC.tap);
      }}
      onDrag={(_, info) => setHover(isOver(cupRef.current, toViewport(info.point)))}
      onDragEnd={(_, info) => {
        const p = toViewport(info.point);
        setHover(false);
        if (isOver(cupRef.current, p)) onAdd(ing.id, p);
        setTimeout(() => (dragging.current = false), 50);
      }}
      onTap={(e, info) => {
        if (!disabled && !dragging.current) onAdd(ing.id, toViewport(info.point));
      }}
      className={`relative flex touch-none select-none flex-col items-center justify-center rounded-2xl border-b-4 px-1 py-2 shadow-chunky transition-colors ${
        fever ? 'border-amber-600 bg-gradient-to-b from-amber-200 to-amber-400' : 'border-mocha-300 bg-cream'
      } ${disabled ? 'opacity-40' : ''} ${needed ? 'ring-4 ring-emerald-400/80' : ''}`}
      style={{ touchAction: 'none' }}
    >
      <span className="pointer-events-none text-4xl leading-none drop-shadow">{ing.emoji}</span>
      <span className="pointer-events-none mt-1 text-[11px] font-black uppercase tracking-wide text-mocha-700">{ing.name}</span>
      {needed > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-2 rounded-full bg-emerald-500 px-1.5 text-xs font-black text-white shadow">
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
  return (
    <div className="grid grid-cols-4 gap-2 px-3 pb-2 pt-1">
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
        />
      ))}
    </div>
  );
}
