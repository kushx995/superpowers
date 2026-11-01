// Hand-drawn SVG icon set (ingredients, coin, hearts, stage icons) in the same
// outlined, softly shaded style as the characters.
const INK = '#3a1d0e';

export function CoinIcon({ size = 20, className = '' }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className}>
      <circle cx="20" cy="21" r="17" fill="#c98a00" />
      <circle cx="20" cy="19" r="17" fill="#ffd23f" stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="19" r="12" fill="#ffe27a" stroke="#d29200" strokeWidth="2" />
      {/* paw */}
      <g fill="#d29200">
        <ellipse cx="20" cy="22.5" rx="5" ry="4" />
        <circle cx="14.5" cy="16.5" r="2.2" />
        <circle cx="18" cy="13.5" r="2.2" />
        <circle cx="22" cy="13.5" r="2.2" />
        <circle cx="25.5" cy="16.5" r="2.2" />
      </g>
      <path d="M9 13 Q12 7 18 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  );
}

export function HeartIcon({ size = 22, filled = true }) {
  return (
    <svg viewBox="0 0 40 36" width={size} height={size * 0.9}>
      <path
        d="M20 33 C 4 22, 2 12, 8 6 C 13 1, 19 4, 20 9 C 21 4, 27 1, 32 6 C 38 12, 36 22, 20 33 Z"
        fill={filled ? '#ff5f84' : '#5c3a30'}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {filled && <path d="M9 10 Q11 6 15 6" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />}
    </svg>
  );
}

function Espresso() {
  return (
    <g>
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="#000" opacity="0.15" />
      <ellipse cx="32" cy="50" rx="24" ry="6" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
      <path d="M44 26 Q58 26 56 36 Q54 44 44 42" fill="none" stroke={INK} strokeWidth="5" />
      <path d="M44 26 Q58 26 56 36 Q54 44 44 42" fill="none" stroke="#fff8ec" strokeWidth="2" />
      <path d="M14 20 L50 20 L46 46 Q32 52 18 46 Z" fill="#fff8ec" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="32" cy="21" rx="17" ry="4.5" fill="#4a250f" stroke={INK} strokeWidth="2" />
      <ellipse cx="29" cy="20.5" rx="8" ry="2" fill="#a0612d" opacity="0.8" />
      <path d="M20 26 L22 42" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <path d="M26 14 Q22 9 26 4 M36 14 Q32 9 36 4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8" />
    </g>
  );
}

function Milk() {
  return (
    <g>
      <ellipse cx="32" cy="57" rx="16" ry="4" fill="#000" opacity="0.15" />
      <path d="M22 6 L42 6 L42 14 L48 24 L48 54 Q32 58 16 54 L16 24 L22 14 Z" fill="#fffdf8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="21" y="2" width="22" height="7" rx="2" fill="#74c6f2" stroke={INK} strokeWidth="2.5" />
      <path d="M16 34 L48 34 L48 46 L16 46 Z" fill="#a6defb" />
      <circle cx="32" cy="40" r="4" fill="#fff" />
      <circle cx="28.5" cy="37" r="1.4" fill="#fff" />
      <circle cx="35.5" cy="37" r="1.4" fill="#fff" />
      <path d="M21 26 L21 50" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
    </g>
  );
}

function Catnip() {
  return (
    <g>
      <ellipse cx="32" cy="57" rx="18" ry="4" fill="#000" opacity="0.15" />
      <path d="M32 56 Q30 36 34 10" stroke="#2c7a3e" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {[
        [33, 14, -30],
        [31, 26, 35],
        [33, 36, -35],
        [31, 46, 30],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <path d={`M${x} ${y} Q${x + (r > 0 ? -18 : 18)} ${y - 8} ${x + (r > 0 ? -22 : 22)} ${y} Q${x + (r > 0 ? -14 : 14)} ${y + 8} ${x} ${y} Z`} fill="#72d25f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
          <path d={`M${x} ${y} L${x + (r > 0 ? -16 : 16)} ${y}`} stroke="#3e9b2f" strokeWidth="1.6" />
        </g>
      ))}
      <circle cx="44" cy="12" r="2" fill="#fff6a8" />
      <circle cx="20" cy="22" r="1.6" fill="#fff6a8" />
    </g>
  );
}

function Ice() {
  const cube = (x, y, s) => (
    <g>
      <path d={`M${x} ${y + s * 0.3} L${x + s * 0.5} ${y} L${x + s} ${y + s * 0.3} L${x + s} ${y + s} L${x + s * 0.5} ${y + s * 1.3} L${x} ${y + s} Z`} fill="#bfeaff" stroke={INK} strokeWidth="2.3" strokeLinejoin="round" />
      <path d={`M${x} ${y + s * 0.3} L${x + s * 0.5} ${y + s * 0.6} L${x + s} ${y + s * 0.3} M${x + s * 0.5} ${y + s * 0.6} L${x + s * 0.5} ${y + s * 1.3}`} stroke="#5aaed8" strokeWidth="1.8" fill="none" />
      <path d={`M${x + s * 0.5} ${y} L${x + s} ${y + s * 0.3} L${x + s * 0.5} ${y + s * 0.6} L${x} ${y + s * 0.3} Z`} fill="#eefaff" />
      <path d={`M${x + s * 0.15} ${y + s * 0.5} L${x + s * 0.15} ${y + s * 0.85}`} stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
  return (
    <g>
      <ellipse cx="32" cy="57" rx="22" ry="4" fill="#000" opacity="0.15" />
      {cube(8, 26, 22)}
      {cube(30, 22, 24)}
      {cube(20, 4, 20)}
    </g>
  );
}

function Steam() {
  return (
    <g>
      <ellipse cx="32" cy="57" rx="18" ry="4" fill="#000" opacity="0.15" />
      {/* steam wand jug */}
      <path d="M16 30 L48 30 L45 54 Q32 58 19 54 Z" fill="#d9d2c8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 34 Q56 36 54 44 Q52 49 46 48" fill="none" stroke={INK} strokeWidth="3.5" />
      <path d="M20 34 L22 50" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
      <rect x="16" y="27" width="32" height="6" rx="3" fill="#ff8a5c" stroke={INK} strokeWidth="2.2" />
      {/* flame + steam */}
      <path d="M32 22 Q24 14 30 6 Q31 12 35 10 Q40 16 32 22 Z" fill="#ff7a45" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 20 Q29 16 31 12 Q33 15 34 14 Q35 18 32 20 Z" fill="#ffd23f" />
      <path d="M18 22 Q14 16 18 10 M46 22 Q50 16 46 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.85" />
    </g>
  );
}

const ART = { espresso: Espresso, milk: Milk, catnip: Catnip, ice: Ice, steam: Steam };

export function CrateIcon({ size = 36 }) {
  return (
    <svg viewBox="0 0 64 62" width={size} height={size} className="overflow-visible">
      <ellipse cx="32" cy="57" rx="24" ry="4" fill="#000" opacity="0.15" />
      <rect x="8" y="22" width="48" height="32" rx="4" fill="#c08a5b" stroke={INK} strokeWidth="2.5" />
      <path d="M8 33 L56 33 M8 44 L56 44" stroke="#8a5532" strokeWidth="2" />
      <path d="M12 26 L52 50 M52 26 L12 50" stroke="#a36a42" strokeWidth="3" />
      <rect x="8" y="22" width="48" height="32" rx="4" fill="none" stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="16" r="7" fill="#fff8ec" stroke={INK} strokeWidth="2" />
      <rect x="28" y="6" width="10" height="17" rx="3" fill="#74c6f2" stroke={INK} strokeWidth="2" />
      <ellipse cx="46" cy="16" rx="6" ry="8" fill="#72d25f" stroke={INK} strokeWidth="2" />
    </svg>
  );
}

export function IngredientIcon({ id, size = 40 }) {
  const Art = ART[id];
  return (
    <svg viewBox="0 0 64 62" width={size} height={size} className="overflow-visible">
      {Art ? <Art /> : null}
    </svg>
  );
}

export function GrindIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
      <path d="M20 4 l4 6 7-2 1 7 7 2-3 6 3 6-7 2-1 7-7-2-4 6-4-6-7 2-1-7-7-2 3-6-3-6 7-2 1-7 7 2z" fill="#c08a5b" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="6" fill="#fff3df" stroke={INK} strokeWidth="2.5" />
    </svg>
  );
}

export function FrothIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
      <path d="M8 18 L32 18 L29 34 Q20 38 11 34 Z" fill="#fff8ec" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="14" cy="16" r="5" fill="#fff" stroke={INK} strokeWidth="2.2" />
      <circle cx="21" cy="13" r="6" fill="#fff" stroke={INK} strokeWidth="2.2" />
      <circle cx="27" cy="16" r="5" fill="#fff" stroke={INK} strokeWidth="2.2" />
      <path d="M14 6 Q12 3 14 0 M24 5 Q22 2 24 -1" stroke="#9fd8f7" strokeWidth="2" fill="none" />
    </svg>
  );
}

export function BellIcon({ size = 26 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
      <rect x="4" y="30" width="32" height="5" rx="2.5" fill="#c08a5b" stroke={INK} strokeWidth="2.5" />
      <path d="M8 30 Q8 12 20 12 Q32 12 32 30 Z" fill="#ffd23f" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="20" cy="9" r="3" fill="#ffd23f" stroke={INK} strokeWidth="2.2" />
      <path d="M13 26 Q13 18 19 16" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 24 }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size}>
      <rect x="9" y="12" width="22" height="24" rx="4" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
      <rect x="6" y="7" width="28" height="6" rx="3" fill="#fff8ec" stroke={INK} strokeWidth="2.5" />
      <rect x="16" y="3" width="8" height="5" rx="2" fill="#fff8ec" stroke={INK} strokeWidth="2.2" />
      <path d="M15 17 L15 31 M20 17 L20 31 M25 17 L25 31" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export const STAGE_ICONS = { grind: GrindIcon, froth: FrothIcon, serve: BellIcon };
