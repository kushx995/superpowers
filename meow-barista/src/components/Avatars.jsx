// Hand-built SVG character art: every customer, VIP, rescue cat and the Cat Boss
// share one rig (ears / head / face / body) so they feel like one illustrated cast.
// Expressions: idle | happy | love | sad | angry | wow. Idle eyes blink on a loop,
// and the whole character breathes / sways via Framer Motion.
import { memo, useId, useMemo } from 'react';
import { motion } from 'framer-motion';

const INK = '#3a1d0e';

// ───────────────────────── Looks ─────────────────────────
export const LOOKS = {
  // café customers
  cat: { kind: 'cat', fur: '#f4a65d', shade: '#e0873c', inner: '#ffb6b0', muzzle: '#fff1e0', body: '#7cc4a4', stripes: true },
  cat_grey: { kind: 'cat', fur: '#aeb3c4', shade: '#8f95aa', inner: '#ffc1c8', muzzle: '#f4f4f8', body: '#f1a7b5', stripes: true },
  cat_calico: { kind: 'cat', fur: '#fff6ea', shade: '#e9d9c4', inner: '#ffc1c8', muzzle: '#ffffff', body: '#9fc9ee', patch: '#f2a057', patch2: '#4a3428' },
  dog: { kind: 'dog', fur: '#f1d1a8', shade: '#e1b986', ear: '#9a623c', inner: '#c98b62', muzzle: '#fff6ea', body: '#f6c560', spot: '#b9805a' },
  fox: { kind: 'fox', fur: '#f2803f', shade: '#d9672a', inner: '#ffd2b8', muzzle: '#fff7ee', tip: '#4a2a1a', body: '#6e9de0' },
  bunny: { kind: 'bunny', fur: '#f8f1ea', shade: '#e8dccf', inner: '#ffbfcb', muzzle: '#ffffff', body: '#c6a7ea' },
  bear: { kind: 'bear', fur: '#a8754c', shade: '#8a5c38', inner: '#d9a679', muzzle: '#e8c49c', body: '#e57a6a' },
  // VIPs
  panda: { kind: 'panda', fur: '#ffffff', shade: '#e9e6e2', inner: '#2b2b33', muzzle: '#ffffff', patchEye: '#2b2b33', body: '#2b2b33', sash: '#ffd23f' },
  panda_chef: { kind: 'panda', fur: '#ffffff', shade: '#e9e6e2', inner: '#2b2b33', muzzle: '#ffffff', patchEye: '#2b2b33', body: '#ffffff', chefHat: true },
  panda_ninja: { kind: 'panda', fur: '#f3f1ee', shade: '#dedad5', inner: '#2b2b33', muzzle: '#ffffff', patchEye: '#2b2b33', body: '#2f2a44', mask: '#3f3a5c' },
  astro: { kind: 'cat', fur: '#c9a1f0', shade: '#a77fd6', inner: '#ffc1e3', muzzle: '#fbf3ff', body: '#e8ecf3', helmet: true, stripes: false },
  owl: { kind: 'owl', fur: '#a57a52', shade: '#86603e', inner: '#f0d9b5', muzzle: '#f6e6c8', body: '#7a5236', glasses: true },
  unicorn: { kind: 'unicorn', fur: '#fff9fd', shade: '#f0e2f2', inner: '#ffc6e2', muzzle: '#ffffff', body: '#ffe1f1', mane: ['#ff9ec7', '#ffd36e', '#9ee6ff', '#c3a4ff'] },
  // garden cats
  mochi: { kind: 'cat', fur: '#f6b26b', shade: '#e39448', inner: '#ffb6b0', muzzle: '#fff1e0', body: null, stripes: true },
  biscuit: { kind: 'cat', fur: '#3c3640', shade: '#2a252e', inner: '#ff9fb0', muzzle: '#4b4450', body: null, eye: '#ffd23f' },
  luna: { kind: 'cat', fur: '#b9bfd0', shade: '#9aa1b6', inner: '#ffc1c8', muzzle: '#f4f4f8', body: null },
  tofu: { kind: 'cat', fur: '#fff3e2', shade: '#ecdcc4', inner: '#ffc1c8', muzzle: '#ffffff', body: null, patch: '#e7c49b' },
  pixel: { kind: 'cat', fur: '#ffffff', shade: '#ebe7f2', inner: '#ffb3d1', muzzle: '#ffffff', body: null, patch: '#9b8cff', patch2: '#ff9ec7' },
  admiral: { kind: 'lion', fur: '#f0b45a', shade: '#d89637', inner: '#ffc89a', muzzle: '#fff0d6', mane: '#b8642a', body: null, captain: true },
  // boss
  boss: { kind: 'cat', fur: '#f6a24f', shade: '#e3853a', inner: '#ffb6b0', muzzle: '#fff3e2', body: '#fff8ec', apron: '#43b98a', stripes: true },
};

export const SPECIES_LOOKS = {
  cat: ['cat', 'cat_grey', 'cat_calico'],
  dog: ['dog'],
  fox: ['fox'],
  bunny: ['bunny'],
  bear: ['bear'],
};
export const VIP_LOOKS = { bamboo: 'panda', dumpling: 'panda_chef', ninja: 'panda_ninja', astro: 'astro', owl: 'owl', unicorn: 'unicorn' };

// ───────────────────────── Parts ─────────────────────────
function Ears({ L }) {
  switch (L.kind) {
    case 'cat':
    case 'boss':
      return (
        <g>
          <path d="M20 54 L27 12 Q30 8 34 11 L56 34 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M100 54 L93 12 Q90 8 86 11 L64 34 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M27 44 L31 20 L46 35 Z" fill={L.inner} />
          <path d="M93 44 L89 20 L74 35 Z" fill={L.inner} />
        </g>
      );
    case 'fox':
      return (
        <g>
          <path d="M18 56 L24 6 Q27 2 31 6 L56 32 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M102 56 L96 6 Q93 2 89 6 L64 32 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M24 6 Q27 2 31 6 L36 12 L23 16 Z" fill={L.tip} />
          <path d="M96 6 Q93 2 89 6 L84 12 L97 16 Z" fill={L.tip} />
          <path d="M26 44 L29 20 L45 33 Z" fill={L.inner} />
          <path d="M94 44 L91 20 L75 33 Z" fill={L.inner} />
        </g>
      );
    case 'bunny':
      return (
        <g>
          <g transform="rotate(-10 42 30)">
            <ellipse cx="42" cy="18" rx="11" ry="28" fill={L.fur} stroke={INK} strokeWidth="3" />
            <ellipse cx="42" cy="20" rx="5.5" ry="20" fill={L.inner} />
          </g>
          <g transform="rotate(12 78 30)">
            <ellipse cx="78" cy="18" rx="11" ry="28" fill={L.fur} stroke={INK} strokeWidth="3" />
            <ellipse cx="78" cy="20" rx="5.5" ry="20" fill={L.inner} />
          </g>
        </g>
      );
    case 'bear':
    case 'panda':
      return (
        <g>
          <circle cx="26" cy="32" r="14" fill={L.kind === 'panda' ? L.inner : L.fur} stroke={INK} strokeWidth="3" />
          <circle cx="94" cy="32" r="14" fill={L.kind === 'panda' ? L.inner : L.fur} stroke={INK} strokeWidth="3" />
          {L.kind === 'bear' && (
            <>
              <circle cx="26" cy="32" r="7" fill={L.inner} />
              <circle cx="94" cy="32" r="7" fill={L.inner} />
            </>
          )}
        </g>
      );
    case 'owl':
      return (
        <g>
          <path d="M24 40 L22 12 L46 30 Z" fill={L.shade} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M96 40 L98 12 L74 30 Z" fill={L.shade} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        </g>
      );
    case 'unicorn':
      return (
        <g>
          {L.mane.map((c, i) => (
            <ellipse key={c} cx={30 + i * 6} cy={34 - i * 3} rx="14" ry="10" fill={c} stroke={INK} strokeWidth="2.5" transform={`rotate(${-30 + i * 8} ${30 + i * 6} ${34 - i * 3})`} />
          ))}
          <path d="M30 40 L32 16 L48 30 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M90 40 L88 16 L72 30 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M53 26 L60 -6 L67 26 Z" fill="#ffd96a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M55.5 18 L64.5 14 M57 9 L63.5 6" stroke="#e9a700" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case 'lion':
      return (
        <g>
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return <circle key={i} cx={60 + Math.cos(a) * 44} cy={62 + Math.sin(a) * 40} r="16" fill={L.mane} stroke={INK} strokeWidth="3" />;
          })}
          <ellipse cx="60" cy="62" rx="46" ry="42" fill={L.mane} />
          <circle cx="30" cy="34" r="10" fill={L.fur} stroke={INK} strokeWidth="3" />
          <circle cx="90" cy="34" r="10" fill={L.fur} stroke={INK} strokeWidth="3" />
        </g>
      );
    default:
      return null;
  }
}

function DogEars({ L }) {
  return (
    <g>
      <path d="M26 38 Q4 44 10 82 Q16 92 26 80 Q30 60 34 44 Z" fill={L.ear} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M94 38 Q116 44 110 82 Q104 92 94 80 Q90 60 86 44 Z" fill={L.ear} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

function Markings({ L }) {
  return (
    <g>
      {L.stripes && (
        <g stroke={L.shade} strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M60 28 L60 38" />
          <path d="M49 30 L51 39" />
          <path d="M71 30 L69 39" />
          <path d="M20 62 L30 63 M21 71 L30 70" />
          <path d="M100 62 L90 63 M99 71 L90 70" />
        </g>
      )}
      {L.patch && <path d="M72 30 Q96 30 100 54 Q90 50 78 48 Q70 40 72 30 Z" fill={L.patch} />}
      {L.patch2 && <path d="M26 46 Q30 32 44 32 Q42 44 34 52 Z" fill={L.patch2} />}
      {L.spot && <ellipse cx="78" cy="56" rx="12" ry="10" fill={L.spot} opacity="0.8" />}
      {L.kind === 'fox' && <path d="M22 70 Q40 62 60 88 Q80 62 98 70 Q92 98 60 100 Q28 98 22 70 Z" fill={L.muzzle} />}
      {L.kind === 'panda' && (
        <g fill={L.patchEye}>
          <ellipse cx="42" cy="62" rx="12" ry="14" transform="rotate(25 42 62)" />
          <ellipse cx="78" cy="62" rx="12" ry="14" transform="rotate(-25 78 62)" />
        </g>
      )}
      {L.mask && <path d="M18 52 Q60 40 102 52 L100 72 Q60 62 20 72 Z" fill={L.mask} opacity="0.92" />}
      {L.kind === 'owl' && (
        <g>
          <ellipse cx="44" cy="62" rx="17" ry="17" fill={L.inner} stroke={L.shade} strokeWidth="2" />
          <ellipse cx="76" cy="62" rx="17" ry="17" fill={L.inner} stroke={L.shade} strokeWidth="2" />
        </g>
      )}
    </g>
  );
}

function Eyes({ L, expr, blinkId }) {
  const eyeColor = L.eye || INK;
  const lx = 43;
  const rx = 77;
  const y = 62;
  if (expr === 'happy') {
    return (
      <g stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none">
        <path d={`M${lx - 8} ${y + 2} Q${lx} ${y - 8} ${lx + 8} ${y + 2}`} />
        <path d={`M${rx - 8} ${y + 2} Q${rx} ${y - 8} ${rx + 8} ${y + 2}`} />
      </g>
    );
  }
  if (expr === 'love') {
    const heart = (cx) => `M${cx} ${y + 7} C ${cx - 13} ${y - 1}, ${cx - 7} ${y - 12}, ${cx} ${y - 4} C ${cx + 7} ${y - 12}, ${cx + 13} ${y - 1}, ${cx} ${y + 7} Z`;
    return (
      <g>
        <path d={heart(lx)} fill="#ff5f84" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={heart(rx)} fill="#ff5f84" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={lx - 3} cy={y - 3} r="1.8" fill="#fff" />
        <circle cx={rx - 3} cy={y - 3} r="1.8" fill="#fff" />
      </g>
    );
  }
  const big = expr === 'wow';
  const ry = big ? 10 : expr === 'angry' ? 6.5 : 8.5;
  const rxE = big ? 9 : 7.2;
  const eye = (cx) => (
    <g key={cx}>
      <ellipse cx={cx} cy={y} rx={rxE} ry={ry} fill={eyeColor === INK ? INK : '#1d1420'} />
      {eyeColor !== INK && <ellipse cx={cx} cy={y} rx={rxE - 1.5} ry={ry - 1.5} fill={eyeColor} />}
      {eyeColor !== INK && <ellipse cx={cx} cy={y} rx="2" ry={ry - 3} fill="#1d1420" />}
      <circle cx={cx - 2.5} cy={y - 3.5} r={big ? 3.4 : 2.8} fill="#fff" />
      <circle cx={cx + 2.6} cy={y + 3} r="1.3" fill="#fff" />
      {big && <path d={`M${cx + 3} ${y - 6} l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1 z`} fill="#fff" />}
    </g>
  );
  const blink = expr === 'idle';
  return (
    <motion.g
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      animate={blink ? { scaleY: [1, 1, 0.08, 1, 1, 0.08, 1] } : { scaleY: 1 }}
      transition={blink ? { duration: 4.6, times: [0, 0.6, 0.63, 0.66, 0.9, 0.93, 0.96], repeat: Infinity, delay: (blinkId % 7) * 0.37 } : { duration: 0.15 }}
    >
      {eye(lx)}
      {eye(rx)}
      {expr === 'angry' && (
        <g stroke={INK} strokeWidth="4" strokeLinecap="round">
          <path d={`M${lx - 10} ${y - 15} L${lx + 7} ${y - 9}`} />
          <path d={`M${rx + 10} ${y - 15} L${rx - 7} ${y - 9}`} />
        </g>
      )}
      {expr === 'sad' && (
        <g stroke={INK} strokeWidth="3.5" strokeLinecap="round">
          <path d={`M${lx - 9} ${y - 10} L${lx + 6} ${y - 15}`} />
          <path d={`M${rx + 9} ${y - 10} L${rx - 6} ${y - 15}`} />
        </g>
      )}
    </motion.g>
  );
}

function Mouth({ L, expr }) {
  const hasMuzzle = ['dog', 'bear', 'lion'].includes(L.kind);
  const noseDark = ['dog', 'bear', 'panda', 'lion'].includes(L.kind);
  return (
    <g>
      {hasMuzzle && <ellipse cx="60" cy="82" rx="18" ry="13" fill={L.muzzle} />}
      {L.kind === 'owl' ? (
        <path d="M54 74 L66 74 L60 86 Z" fill="#f6b13c" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      ) : (
        <path d="M55 74 Q60 71 65 74 Q63 79 60 80 Q57 79 55 74 Z" fill={noseDark ? '#3a2a2a' : '#ff8fa6'} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      )}
      {L.kind !== 'owl' && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {expr === 'idle' && <path d="M50 83 Q55 89 60 83 Q65 89 70 83" />}
          {expr === 'sad' && <path d="M52 91 Q60 84 68 91" />}
          {expr === 'angry' && <path d="M50 89 L55 85 L60 89 L65 85 L70 89" />}
        </g>
      )}
      {(expr === 'happy' || expr === 'love') && (
        <g>
          <path d="M48 82 Q60 100 72 82 Q60 86 48 82 Z" fill="#7a2232" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M54 89 Q60 95 66 89 Q60 87 54 89 Z" fill="#ff8fa6" />
        </g>
      )}
      {expr === 'wow' && <ellipse cx="60" cy="88" rx="5" ry="6.5" fill="#7a2232" stroke={INK} strokeWidth="2.5" />}
      {expr === 'sad' && <path d="M33 70 Q30 78 33 81 Q37 78 33 70 Z" fill="#8fd3fb" stroke="#2d86ba" strokeWidth="1.5" />}
    </g>
  );
}

function Whiskers() {
  return (
    <g stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.55">
      <path d="M30 78 L12 74 M30 83 L13 85" />
      <path d="M90 78 L108 74 M90 83 L107 85" />
    </g>
  );
}

function Body({ L, gradId }) {
  if (!L.body) {
    // garden cats: little loaf body with paws
    return (
      <g>
        <path d="M24 128 Q22 94 60 92 Q98 94 96 128 Z" fill={L.fur} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="44" cy="126" rx="10" ry="6" fill={L.muzzle} stroke={INK} strokeWidth="2.5" />
        <ellipse cx="76" cy="126" rx="10" ry="6" fill={L.muzzle} stroke={INK} strokeWidth="2.5" />
      </g>
    );
  }
  return (
    <g>
      <path d="M14 140 Q16 98 60 96 Q104 98 106 140 Z" fill={L.body} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 140 Q16 98 60 96 Q104 98 106 140 Z" fill={`url(#${gradId}-body)`} />
      {L.apron && (
        <g>
          <path d="M38 102 Q60 108 82 102 L86 140 L34 140 Z" fill={L.apron} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="60" cy="122" r="7" fill="#fff8ec" />
          <circle cx="56" cy="117" r="2.2" fill="#fff8ec" />
          <circle cx="60" cy="115" r="2.2" fill="#fff8ec" />
          <circle cx="64" cy="117" r="2.2" fill="#fff8ec" />
          <circle cx="60" cy="122" r="3.4" fill={L.apron} />
        </g>
      )}
      {L.sash && <path d="M30 104 L92 136 L84 140 L24 110 Z" fill={L.sash} stroke={INK} strokeWidth="2.5" />}
      {L.captain && <path d="M44 100 L60 112 L76 100" stroke="#ffd23f" strokeWidth="4" fill="none" />}
    </g>
  );
}

// ───────────────────────── Accessories ─────────────────────────
export function HatArt({ id }) {
  switch (id) {
    case 'hat_cap':
      return (
        <g>
          <path d="M28 36 Q30 4 62 4 Q92 6 92 36 Z" fill="#e8657a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M60 36 Q96 30 114 40 Q100 46 60 40 Z" fill="#c94860" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <circle cx="60" cy="6" r="4" fill="#fff8ec" stroke={INK} strokeWidth="2" />
          <path d="M48 22 Q60 16 72 22" stroke="#fff8ec" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'hat_bow':
      return (
        <g transform="translate(70 14) rotate(18)">
          <path d="M0 0 L-22 -12 Q-26 0 -22 12 Z" fill="#ff8fb3" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M0 0 L22 -12 Q26 0 22 12 Z" fill="#ff8fb3" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <circle r="6" fill="#ff5f95" stroke={INK} strokeWidth="3" />
          <circle cx="-14" cy="-3" r="2" fill="#fff" />
        </g>
      );
    case 'hat_top':
      return (
        <g>
          <rect x="38" y="-14" width="44" height="40" rx="5" fill="#3a2a3f" stroke={INK} strokeWidth="3" />
          <rect x="38" y="12" width="44" height="8" fill="#e8657a" />
          <ellipse cx="60" cy="28" rx="34" ry="7" fill="#3a2a3f" stroke={INK} strokeWidth="3" />
          <rect x="43" y="-10" width="6" height="20" rx="3" fill="#fff" opacity="0.25" />
        </g>
      );
    case 'hat_crown':
      return (
        <g>
          <path d="M34 32 L30 4 L46 18 L60 -2 L74 18 L90 4 L86 32 Z" fill="#ffd23f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="34" y="26" width="52" height="8" rx="3" fill="#f5b700" stroke={INK} strokeWidth="2.5" />
          <circle cx="60" cy="16" r="4" fill="#e8657a" stroke={INK} strokeWidth="2" />
          <circle cx="44" cy="25" r="2.6" fill="#46a8dd" />
          <circle cx="76" cy="25" r="2.6" fill="#43b98a" />
          <path d="M38 10 L42 22" stroke="#fff" strokeWidth="2" opacity="0.6" strokeLinecap="round" />
        </g>
      );
    case 'chef':
      return (
        <g>
          <path d="M36 34 Q24 10 42 8 Q48 -6 60 0 Q72 -6 78 8 Q96 10 84 34 Z" fill="#fff" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <rect x="38" y="26" width="44" height="10" rx="3" fill="#f6efe6" stroke={INK} strokeWidth="2.5" />
        </g>
      );
    case 'captain':
      return (
        <g>
          <path d="M30 34 Q30 8 60 8 Q90 8 90 34 Z" fill="#fffdf8" stroke={INK} strokeWidth="3" />
          <rect x="30" y="26" width="60" height="9" fill="#2b3b66" stroke={INK} strokeWidth="2.5" />
          <path d="M34 36 Q60 46 86 36" fill="#1e2a4a" stroke={INK} strokeWidth="2.5" />
          <circle cx="60" cy="20" r="5" fill="#ffd23f" stroke={INK} strokeWidth="2" />
        </g>
      );
    default:
      return null;
  }
}

export function GlassesArt({ id }) {
  switch (id) {
    case 'gl_round':
      return (
        <g fill="rgba(200,235,255,0.25)" stroke="#5c331d" strokeWidth="3.5">
          <circle cx="43" cy="62" r="12" />
          <circle cx="77" cy="62" r="12" />
          <path d="M55 60 Q60 56 65 60" fill="none" />
        </g>
      );
    case 'gl_shades':
      return (
        <g>
          <path d="M28 54 L56 54 Q56 72 42 72 Q28 72 28 54 Z" fill="#1d1420" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M64 54 L92 54 Q92 72 78 72 Q64 72 64 54 Z" fill="#1d1420" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M56 57 L64 57" stroke={INK} strokeWidth="3" />
          <path d="M33 58 L40 58 M69 58 L76 58" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        </g>
      );
    case 'gl_goggles':
      return (
        <g>
          <path d="M18 58 L102 58" stroke="#7c4a2b" strokeWidth="7" />
          <circle cx="43" cy="60" r="13" fill="#9ee6ff" fillOpacity="0.55" stroke="#c9902f" strokeWidth="5" />
          <circle cx="77" cy="60" r="13" fill="#9ee6ff" fillOpacity="0.55" stroke="#c9902f" strokeWidth="5" />
          <path d="M37 54 L43 52" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <path d="M71 54 L77 52" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'owl':
      return (
        <g fill="none" stroke="#c9902f" strokeWidth="3">
          <circle cx="44" cy="62" r="13" />
          <circle cx="76" cy="62" r="13" />
          <path d="M57 60 L63 60" />
        </g>
      );
    default:
      return null;
  }
}

// ───────────────────────── Character ─────────────────────────
/**
 * @param {object} props
 * @param {string} props.look key of LOOKS
 * @param {'idle'|'happy'|'love'|'sad'|'angry'|'wow'} [props.expr]
 * @param {number} [props.size] rendered width in px
 * @param {string} [props.hat] hat item id
 * @param {string} [props.glasses] glasses item id
 * @param {boolean} [props.lively] bigger, faster idle motion (Fever)
 * @param {boolean} [props.still] disable idle animation
 */
export const Character = memo(function Character({ look = 'cat', expr = 'idle', size = 96, hat, glasses, lively = false, still = false, className = '' }) {
  const L = LOOKS[look] || LOOKS.cat;
  const uid = useId().replace(/:/g, '');
  const blinkId = useMemo(() => Math.floor(Math.random() * 100), []);
  const headHat = hat || (L.chefHat ? 'chef' : L.captain ? 'captain' : null);
  const headGlasses = glasses || (L.glasses ? 'owl' : null);
  const cheeks = expr !== 'angry';

  return (
    <motion.svg
      viewBox="-6 -16 132 158"
      width={size}
      height={size * (158 / 132)}
      className={`overflow-visible ${className}`}
      style={{ filter: 'drop-shadow(0 6px 6px rgba(42,22,12,0.35))' }}
    >
      <defs>
        <radialGradient id={`${uid}-head`} cx="38%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.14" />
        </radialGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {/* breathing body */}
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
        animate={still ? undefined : { scaleY: [1, 1.035, 1], scaleX: [1, 0.99, 1] }}
        transition={{ duration: lively ? 0.5 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Body L={L} gradId={uid} />
      </motion.g>
      {/* head sway */}
      <motion.g
        style={{ transformBox: 'view-box', transformOrigin: '60px 100px' }}
        animate={still ? undefined : lively ? { rotate: [-7, 7, -7], y: [0, -4, 0] } : { rotate: [-2.5, 2.5, -2.5], y: [0, -1.5, 0] }}
        transition={{ duration: lively ? 0.5 : 3.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {L.kind === 'dog' ? null : <Ears L={L} />}
        <ellipse cx="60" cy="62" rx={L.kind === 'owl' ? 40 : 44} ry={L.kind === 'owl' ? 42 : 38} fill={L.fur} stroke={INK} strokeWidth="3.2" />
        <Markings L={L} />
        {L.kind === 'dog' && <DogEars L={L} />}
        <ellipse cx="60" cy="62" rx="44" ry="38" fill={`url(#${uid}-head)`} />
        {cheeks && (
          <g fill="#ff8fa6" opacity="0.5">
            <ellipse cx="30" cy="77" rx="8" ry="5" />
            <ellipse cx="90" cy="77" rx="8" ry="5" />
          </g>
        )}
        <Eyes L={L} expr={expr} blinkId={blinkId} />
        <Mouth L={L} expr={expr} />
        {['cat', 'lion'].includes(L.kind) && <Whiskers />}
        {expr === 'angry' && <path d="M92 30 l6 0 m-3 -3 l0 6 M100 24 l5 4 m0 -4 l-5 4" stroke="#e8657a" strokeWidth="3" strokeLinecap="round" />}
        {headGlasses && <GlassesArt id={headGlasses} />}
        {headHat && <HatArt id={headHat} />}
        {L.helmet && (
          <g>
            <circle cx="60" cy="58" r="58" fill="#bfe7ff" fillOpacity="0.22" stroke="#e8ecf3" strokeWidth="5" />
            <path d="M24 34 Q34 14 56 8" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity="0.7" />
          </g>
        )}
      </motion.g>
    </motion.svg>
  );
});

/** Pick a stable look for a species (customers get colour variety). */
export function lookForSpecies(species, seed = Math.random()) {
  const list = SPECIES_LOOKS[species] || ['cat'];
  return list[Math.floor(seed * list.length) % list.length];
}

export default Character;
