// Multi-layered café interior: wallpaper, warm lamp light, window with light rays,
// hanging plants, shelf, chalkboard menu, wainscoting, and a wooden counter with an
// espresso machine. Characters are slotted between the wall and the counter front.
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { WeatherWindow } from './WeatherSystem';

const INK = '#3a1d0e';

const PendantLamp = memo(function PendantLamp({ x, cord = 26, delay = 0, fever }) {
  return (
    <motion.div
      className="absolute top-0 z-[3]"
      style={{ left: x, transformOrigin: '50% 0%' }}
      animate={{ rotate: [-2, 2, -2] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="mx-auto w-[2px] bg-roast-900" style={{ height: cord }} />
      <svg width="46" height="34" viewBox="0 0 46 34" className="-mt-px block overflow-visible">
        <path d="M6 22 Q8 4 23 4 Q38 4 40 22 Z" fill={fever ? '#ffd23f' : '#43b98a'} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M12 16 Q14 9 21 8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.6" />
        <rect x="19" y="0" width="8" height="5" rx="2" fill="#5c331d" />
        <ellipse cx="23" cy="23" rx="7" ry="5" fill="#fff6c7" />
      </svg>
      {/* glow cone */}
      <div
        className="pointer-events-none absolute left-1/2 top-[calc(100%-10px)] h-40 w-36 -translate-x-1/2"
        style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgba(255,214,140,0.55), rgba(255,214,140,0) 70%)', mixBlendMode: 'screen' }}
      />
    </motion.div>
  );
});

const HangingPlant = memo(function HangingPlant({ x, cord = 18, flip = false, delay = 0 }) {
  return (
    <motion.div
      className="absolute top-0 z-[3]"
      style={{ left: x, transformOrigin: '50% 0%' }}
      animate={{ rotate: [-3, 3, -3] }}
      transition={{ duration: 4.2 + delay, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      <svg width="54" height={cord + 66} viewBox={`0 0 54 ${cord + 66}`} className="overflow-visible" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
        <path d={`M27 0 L14 ${cord} M27 0 L40 ${cord}`} stroke="#8a5532" strokeWidth="1.5" />
        <g transform={`translate(0 ${cord})`}>
          {/* trailing vines */}
          <path d="M12 14 Q4 34 10 54" stroke="#3e9b2f" strokeWidth="2.5" fill="none" />
          <path d="M40 14 Q50 30 44 46" stroke="#3e9b2f" strokeWidth="2.5" fill="none" />
          {[
            [8, 26], [6, 38], [11, 50], [45, 26], [47, 38],
          ].map(([cx, cy], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx="6" ry="4" fill={i % 2 ? '#5cc85a' : '#72d25f'} stroke={INK} strokeWidth="1.6" transform={`rotate(${i % 2 ? 30 : -30} ${cx} ${cy})`} />
          ))}
          {/* foliage */}
          <ellipse cx="18" cy="4" rx="9" ry="6" fill="#5cc85a" stroke={INK} strokeWidth="2" transform="rotate(-25 18 4)" />
          <ellipse cx="36" cy="3" rx="9" ry="6" fill="#72d25f" stroke={INK} strokeWidth="2" transform="rotate(25 36 3)" />
          <ellipse cx="27" cy="-2" rx="7" ry="8" fill="#86de6e" stroke={INK} strokeWidth="2" />
          {/* pot */}
          <path d="M10 6 L44 6 L40 22 Q27 26 14 22 Z" fill="#e8846a" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <rect x="8" y="4" width="38" height="6" rx="3" fill="#f39b80" stroke={INK} strokeWidth="2.5" />
          <path d="M15 12 L17 20" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </g>
      </svg>
    </motion.div>
  );
});

function Shelf() {
  return (
    <svg width="118" height="60" viewBox="0 0 118 60" className="overflow-visible drop-shadow-md">
      {/* jars & cups */}
      <rect x="6" y="14" width="22" height="30" rx="6" fill="#bfe7ff" fillOpacity="0.6" stroke={INK} strokeWidth="2" />
      <rect x="9" y="26" width="16" height="16" rx="4" fill="#5c331d" />
      <rect x="8" y="9" width="18" height="7" rx="2" fill="#c08a5b" stroke={INK} strokeWidth="2" />
      <rect x="34" y="20" width="20" height="24" rx="5" fill="#bfe7ff" fillOpacity="0.6" stroke={INK} strokeWidth="2" />
      <rect x="37" y="30" width="14" height="12" rx="3" fill="#72d25f" />
      <rect x="35" y="15" width="18" height="7" rx="2" fill="#e8846a" stroke={INK} strokeWidth="2" />
      <path d="M62 30 L82 30 L80 44 L64 44 Z" fill="#fff8ec" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M82 33 Q88 34 86 39 Q84 42 80 41" stroke={INK} strokeWidth="2" fill="none" />
      <path d="M66 34 L82 34" stroke="#43b98a" strokeWidth="3" />
      <rect x="90" y="16" width="8" height="28" rx="2" fill="#e8657a" stroke={INK} strokeWidth="2" />
      <rect x="99" y="20" width="8" height="24" rx="2" fill="#74c6f2" stroke={INK} strokeWidth="2" />
      <rect x="108" y="13" width="7" height="31" rx="2" fill="#ffd23f" stroke={INK} strokeWidth="2" />
      {/* plank */}
      <rect x="0" y="44" width="118" height="8" rx="3" fill="#a36a42" stroke={INK} strokeWidth="2.5" />
      <path d="M14 52 L18 60 M104 52 L100 60" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Chalkboard() {
  return (
    <svg width="104" height="78" viewBox="0 0 104 78" className="drop-shadow-lg">
      <rect x="2" y="2" width="100" height="74" rx="8" fill="#c08a5b" stroke={INK} strokeWidth="2.5" />
      <rect x="9" y="9" width="86" height="60" rx="4" fill="#2f3b33" />
      <text x="52" y="27" textAnchor="middle" fontFamily="Lilita One, Fredoka, sans-serif" fontSize="14" fill="#fff8ec">
        Menu
      </text>
      <path d="M20 36 L60 36 M20 45 L72 45 M20 54 L54 54" stroke="#e6f8ef" strokeWidth="2" strokeLinecap="round" opacity="0.7" strokeDasharray="1 0" />
      <path d="M68 34 l4 0 M76 44 l6 0 M60 53 l8 0" stroke="#ffd23f" strokeWidth="2" strokeLinecap="round" />
      <circle cx="84" cy="56" r="6" fill="none" stroke="#ffb3bd" strokeWidth="2" />
      <path d="M81 55 l2 2 4-4" stroke="#ffb3bd" strokeWidth="2" fill="none" />
    </svg>
  );
}

export const EspressoMachine = memo(function EspressoMachine({ fever, busy }) {
  return (
    <div className="relative">
      <svg width="86" height="78" viewBox="0 0 86 78" className="overflow-visible drop-shadow-lg">
        <rect x="6" y="6" width="74" height="54" rx="10" fill={fever ? '#ffd23f' : '#e8657a'} stroke={INK} strokeWidth="3" />
        <rect x="6" y="6" width="74" height="14" rx="8" fill="#fff" opacity="0.25" />
        <rect x="14" y="0" width="58" height="10" rx="4" fill="#d9d2c8" stroke={INK} strokeWidth="2.5" />
        <circle cx="26" cy="32" r="9" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
        <path d="M26 32 L30 27" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="32" r="9" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
        <path d="M60 32 L56 28" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        <rect x="34" y="44" width="18" height="8" rx="3" fill="#5c331d" stroke={INK} strokeWidth="2" />
        <rect x="40" y="52" width="6" height="6" fill="#5c331d" />
        <rect x="2" y="60" width="82" height="10" rx="4" fill="#d9d2c8" stroke={INK} strokeWidth="2.5" />
        <circle cx="43" cy="22" r="3" fill={busy ? '#72d25f' : '#ffd23f'} stroke={INK} strokeWidth="1.5" />
      </svg>
      {busy && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute block h-4 w-4 rounded-full bg-white/80 blur-[2px]"
              style={{ left: (i - 1) * 9 }}
              animate={{ y: [0, -22], opacity: [0.8, 0], scale: [0.6, 1.6] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.35 }}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function PastryDome() {
  return (
    <svg width="58" height="50" viewBox="0 0 58 50" className="overflow-visible drop-shadow-md">
      <ellipse cx="29" cy="44" rx="26" ry="5" fill="#d9d2c8" stroke={INK} strokeWidth="2.5" />
      <path d="M14 40 Q14 28 22 28 Q22 22 29 22 Q36 22 36 28 Q44 28 44 40 Z" fill="#f6b26b" stroke={INK} strokeWidth="2" />
      <path d="M20 30 Q29 26 38 30" stroke="#fff3df" strokeWidth="2" fill="none" />
      <circle cx="29" cy="22" r="3" fill="#e8657a" stroke={INK} strokeWidth="1.5" />
      <path d="M6 42 Q6 6 29 6 Q52 6 52 42" fill="#dff4ff" fillOpacity="0.35" stroke={INK} strokeWidth="2.5" />
      <path d="M13 30 Q14 16 24 11" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
      <circle cx="29" cy="4" r="3.5" fill="#d9d2c8" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

function DustMotes() {
  const motes = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ id: i, x: 8 + Math.random() * 50, y: 20 + Math.random() * 50, d: 5 + Math.random() * 5 })), []);
  return motes.map((m) => (
    <motion.span
      key={m.id}
      className="pointer-events-none absolute z-[2] h-1.5 w-1.5 rounded-full bg-amber-100"
      style={{ left: `${m.x}%`, top: `${m.y}%`, boxShadow: '0 0 6px #ffe9b0' }}
      animate={{ y: [0, -18, 0], x: [0, 8, 0], opacity: [0, 0.9, 0] }}
      transition={{ duration: m.d, repeat: Infinity, delay: m.id * 0.6, ease: 'easeInOut' }}
    />
  ));
}

/**
 * @param {object} props
 * @param {string} props.wallpaper CSS class for the back wall
 * @param {{text:string,color:string}|null} props.neon equipped neon sign
 * @param {string} props.weather weather id
 * @param {boolean} props.fever
 * @param {React.ReactNode} props.characters rendered between wall and counter
 * @param {React.ReactNode} props.overlay rendered above everything
 */
export default function CafeScene({ wallpaper, neon, weather, fever, characters, overlay, counterRef, counterSlot }) {
  const dark = weather === 'night' || weather === 'rainy';
  return (
    <div className={`relative h-full w-full overflow-hidden rounded-[28px] ${wallpaper}`}>
      {/* ceiling beam */}
      <div className="absolute inset-x-0 top-0 z-[4] h-3 bg-gradient-to-b from-roast-700 to-roast-800 shadow-md" />

      {/* window + light rays */}
      <div className="absolute left-3 top-6 z-[1] h-[96px] w-[44%]">
        <WeatherWindow weather={weather} fever={fever} />
      </div>
      {!dark && <div className="light-rays pointer-events-none absolute left-[6%] top-[96px] z-[2] h-[70%] w-[60%] origin-top-left skew-x-[18deg]" />}
      <DustMotes />

      {/* shelf & chalkboard */}
      <div className="absolute right-3 top-[18px] z-[1]">
        <Shelf />
      </div>
      {!neon && (
        <div className="absolute left-4 top-[136px] z-[1] opacity-95">
          <Chalkboard />
        </div>
      )}
      {neon && (
        <div
          className="neon-sign absolute left-[46%] top-[56px] z-[1] max-w-[26%] rotate-[-4deg] rounded-xl bg-roast-950/45 px-2 py-1 text-center font-display text-[13px] leading-tight"
          style={{ color: neon.color, '--neon': neon.color }}
        >
          {neon.text}
        </div>
      )}

      {/* lighting */}
      <PendantLamp x="32%" cord={18} fever={fever} />
      <PendantLamp x="62%" cord={30} delay={1} fever={fever} />
      <HangingPlant x="-2%" cord={10} />
      <HangingPlant x="83%" cord={60} flip delay={0.7} />

      {/* lower wall */}
      <div className="wainscot absolute inset-x-0 bottom-0 z-[1] h-[34%]" />

      {/* warm ambient light + vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background: dark
            ? 'radial-gradient(70% 55% at 50% 25%, rgba(255,190,110,0.28), rgba(30,15,40,0.35) 100%)'
            : 'radial-gradient(75% 60% at 50% 20%, rgba(255,214,150,0.3), rgba(60,30,10,0.22) 100%)',
        }}
      />

      {/* characters live between wall and counter */}
      <div className="absolute inset-0 z-[5]">{characters}</div>

      {/* counter */}
      <div ref={counterRef} className="absolute inset-x-0 bottom-0 z-[6] h-[64px]">
        <div className="wood-top absolute inset-x-[-4px] bottom-[44px] h-[12px] rounded-t-md" />
        <div className="wood-counter absolute inset-x-0 bottom-0 h-[46px] shadow-[inset_0_6px_8px_rgba(0,0,0,0.35)]">
          <div className="absolute inset-x-3 bottom-2 top-2 rounded-lg border-2 border-black/15 shadow-[inset_0_1px_0_rgba(255,220,180,0.25)]" />
          {counterSlot}
        </div>
      </div>

      {/* fever tint */}
      <div
        className="scene-tint pointer-events-none absolute inset-0 z-[7] opacity-0 transition-opacity duration-300"
        style={{ background: 'radial-gradient(80% 70% at 50% 40%, rgba(255,215,90,0.28), rgba(255,79,216,0.18))', mixBlendMode: 'screen' }}
      />
      {overlay}
    </div>
  );
}

