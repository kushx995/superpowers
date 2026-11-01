// The café shift: customer queue, ingredient assembly, QTE crafting, serving,
// combo/Fever system, weather cycle, lives and scoring.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FEVER_DURATION,
  FEVER_MULT,
  INGREDIENTS,
  ITEMS,
  RECIPES,
  RECIPE_TIERS,
  SPECIES,
  VIPS,
  WEATHER,
} from '../game/data';
import { useGame } from '../game/store';
import { audio } from '../audio/engine';
import { haptic, HAPTIC } from '../hooks/haptics';
import { centerOf, useParticles } from './Particles';
import { WeatherBanner, nextWeather } from './WeatherSystem';
import DragAndDropTray from './DragAndDropTray';
import QTECrafting from './QTECrafting';
import Customer from './Customer';
import Cup, { LIQUID } from './Cup';
import CafeScene, { EspressoMachine } from './CafeScene';
import { Character, VIP_LOOKS, lookForSpecies } from './Avatars';
import { CoinIcon, HeartIcon, TrashIcon, BellIcon } from './Icons';

const TICK = 100;
const TIP_RATE = { PERFECT: 0.8, GOOD: 0.35, MISS: 0 };
const RANK = { PERFECT: 2, GOOD: 1, MISS: 0 };
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sumParts = (parts) => Object.values(parts).reduce((a, b) => a + b, 0);

function freshSession(lives) {
  return {
    status: 'ready',
    paused: false,
    lives,
    maxLives: lives,
    score: 0,
    coins: 0,
    served: 0,
    perfects: 0,
    combo: 0,
    maxCombo: 0,
    fever: 0,
    feverLeft: 0,
    weather: 'morning',
    weatherLeft: WEATHER.morning.duration,
    customer: null,
    queue: [],
    cup: {},
    layers: [],
    phase: 'assemble',
    stageResults: [],
    customerCount: 0,
    arrivingIn: 600,
    outcome: 'happy',
    orderToken: 0,
    vipsServed: [],
    newRecord: false,
  };
}

function unlockedRecipes(served) {
  return RECIPE_TIERS.filter((t) => served >= t.minServed).flatMap((t) => t.ids.map((id) => RECIPES[id]));
}

function makeCustomer(g, bonuses, album) {
  const w = WEATHER[g.weather];
  const count = g.customerCount;
  const vipChance = count >= 4 ? 0.07 + w.vipBoost : 0;
  const forcedVip = count > 0 && count % 11 === 10;
  const difficulty = Math.max(0.55, 1 - g.served * 0.014);

  if (forcedVip || Math.random() < vipChance) {
    const unseen = VIPS.filter((v) => !album.includes(v.id));
    const vip = unseen.length && Math.random() < 0.75 ? pick(unseen) : pick(VIPS);
    const recipe = vip.recipe;
    const patienceMax =
      (26000 + recipe.steps.length * 3500 + sumParts(recipe.parts) * 800) * w.patience * bonuses.patienceMult * Math.max(0.7, difficulty);
    return { uid: Math.random(), emoji: vip.emoji, look: VIP_LOOKS[vip.id] || 'panda', name: vip.name, voice: 'meow', vip, recipe, patienceMax, patience: patienceMax };
  }

  const species = pick(Object.values(SPECIES));
  const pool = unlockedRecipes(g.served);
  const wantHot = Math.random() < w.hotBias;
  const filtered = pool.filter((r) => r.hot === wantHot);
  const options = filtered.length ? filtered : pool;
  // avoid serving the same drink three times in a row
  const fresh = options.filter((r) => r.id !== g.lastRecipeId);
  const recipe = pick(fresh.length && Math.random() < 0.8 ? fresh : options);
  g.lastRecipeId = recipe.id;
  const patienceMax =
    (species.patience + recipe.steps.length * 3500 + sumParts(recipe.parts) * 700) * w.patience * bonuses.patienceMult * difficulty;
  return {
    uid: Math.random(),
    emoji: species.emoji,
    look: lookForSpecies(species.id),
    name: pick(species.names),
    voice: species.voice,
    vip: null,
    recipe,
    patienceMax,
    patience: patienceMax,
  };
}

function Hearts({ lives, max }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          animate={i < lives ? { scale: [1, 1.12, 1], opacity: 1 } : { scale: 0.8, opacity: 0.45 }}
          transition={i < lives ? { duration: 1.2, repeat: Infinity, delay: i * 0.15 } : { duration: 0.3 }}
        >
          <HeartIcon size={22} filled={i < lives} />
        </motion.span>
      ))}
    </div>
  );
}

function FeverGauge({ value, feverLeft, combo }) {
  const inFever = feverLeft > 0;
  const pct = inFever ? (feverLeft / FEVER_DURATION) * 100 : value;
  return (
    <div className="flex items-center gap-2 px-3">
      <div className={`pill-track relative h-6 flex-1 p-[3px] ${inFever ? 'shadow-glow' : ''}`}>
        <motion.div
          className={`pill-fill h-full ${inFever ? 'bg-[linear-gradient(90deg,#ffe27a,#ff8fd8,#ffd23f,#9ee6ff,#ffe27a)] bg-[length:200%_100%]' : 'bg-gradient-to-b from-[#ffcf7a] to-[#ff8a3d]'}`}
          animate={inFever ? { width: `${pct}%`, backgroundPosition: ['0% 0%', '200% 0%'] } : { width: `${pct}%` }}
          transition={inFever ? { width: { duration: 0.1, ease: 'linear' }, backgroundPosition: { duration: 1, repeat: Infinity, ease: 'linear' } } : { duration: 0.4, ease: 'easeOut' }}
        />
        <span className="absolute inset-0 grid place-items-center font-display text-[12px] tracking-wider text-cream drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {inFever ? `FEVER ×${FEVER_MULT} · ${Math.ceil(feverLeft / 1000)}s` : value >= 70 ? 'Fever almost ready!' : 'Fever'}
        </span>
      </div>
      <AnimatePresence mode="popLayout">
        {combo > 1 && (
          <motion.div
            key={combo}
            initial={{ scale: 2, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: -4, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="btn btn-berry px-2.5 py-0.5 font-display text-sm"
          >
            {combo}× COMBO
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BossCat({ hat, glasses, fever, mood }) {
  const expr = mood === 'happy' ? 'love' : mood === 'sad' ? 'sad' : fever ? 'happy' : 'idle';
  return (
    <div className="relative">
      <Character look="boss" expr={expr} size={100} hat={hat} glasses={glasses} lively={fever} />
    </div>
  );
}

export default function CoffeeBar({ active, shake }) {
  const { save, bonuses, addCoins, unlockVip, recordShift, finishTutorial } = useGame();
  const { burst, floatText, splash, ripple } = useParticles();
  const g = useRef(freshSession(bonuses.lives));
  const [, setFrame] = useState(0);
  const rerender = useCallback(() => setFrame((f) => (f + 1) % 1e9), []);
  const [hoverCup, setHoverCup] = useState(false);
  const [cupShake, setCupShake] = useState(0);
  const [bossMood, setBossMood] = useState('idle');
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);
  const cupRef = useRef(null);
  const customerRef = useRef(null);
  const counterRef = useRef(null);
  const latest = useRef({});
  latest.current = { save, bonuses };

  const s = g.current;
  const inFever = s.feverLeft > 0;
  const showHints = !save.tutorialDone && s.served < 3;

  // ───────── helpers ─────────
  const flashBoss = (mood) => {
    setBossMood(mood);
    setTimeout(() => setBossMood('idle'), 900);
  };

  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 2600);
  };

  const startFever = useCallback(() => {
    const st = g.current;
    st.fever = 0;
    st.feverLeft = FEVER_DURATION;
    audio.setFever(true);
    audio.feverStart();
    haptic(HAPTIC.fever);
    shake(14);
    const c = centerOf(counterRef.current);
    burst(c.x, c.y, { emojis: ['🔥', '⭐', '✨', '💛'], count: 24, spread: 180 });
    floatText(c.x, c.y - 40, 'FEVER MODE!', 'gold', true);
    ripple(c.x, c.y, '#ffd23f', 6);
    ripple(c.x, c.y, '#ff4fd8', 4);
    // instant brewing: finish any in-progress craft immediately
    if (st.phase === 'craft') {
      st.stageResults = st.customer.recipe.steps.map(() => 'PERFECT');
      st.phase = 'serve';
      st.orderToken++;
    }
  }, [burst, floatText, ripple, shake]);

  const endShift = useCallback(() => {
    const st = g.current;
    st.status = 'over';
    st.feverLeft = 0;
    audio.setFever(false);
    audio.gameOver();
    st.newRecord = recordShift({ score: st.score, combo: st.maxCombo, served: st.served });
    if (!latest.current.save.tutorialDone) finishTutorial();
    rerender();
  }, [recordShift, finishTutorial, rerender]);

  const customerLeaves = useCallback(() => {
    const st = g.current;
    if (!st.customer) return;
    st.outcome = 'angry';
    st.customer.outcome = 'angry';
    st.customer = null;
    st.cup = {};
    st.layers = [];
    st.phase = 'assemble';
    st.stageResults = [];
    st.orderToken++;
    st.combo = 0;
    st.lives -= 1;
    st.arrivingIn = 900;
    audio.lifeLost();
    audio.voice('woof', 0.7);
    haptic(HAPTIC.lifeLost);
    shake(10);
    flashBoss('sad');
    const c = centerOf(customerRef.current || counterRef.current);
    floatText(c.x, c.y, 'Too slow! -1 ♥', 'berry');
    burst(c.x, c.y, { emojis: ['💢', '💔'], count: 6 });
    if (st.lives <= 0) endShift();
  }, [burst, floatText, shake, endShift]);

  const spawnCustomer = useCallback(() => {
    const st = g.current;
    const { bonuses: b, save: sv } = latest.current;
    // keep a visible queue of upcoming customers at the door
    while (st.queue.length < 3) {
      st.customerCount++;
      st.queue.push(makeCustomer(st, b, sv.album));
    }
    st.customer = st.queue.shift();
    st.customer.outcome = 'happy';
    st.cup = {};
    st.layers = [];
    st.phase = 'assemble';
    st.stageResults = [];
    st.orderToken++;
    audio.voice(st.customer.voice, st.customer.vip ? 0.85 : 0.9 + Math.random() * 0.3);
    if (st.customer.vip) {
      audio.unlock_fanfare();
      showToast(`⭐ VIP ${st.customer.name} has arrived!`);
      haptic(HAPTIC.perfect);
    }
  }, []);

  // ───────── main loop ─────────
  useEffect(() => {
    const id = setInterval(() => {
      const st = g.current;
      if (st.status !== 'playing' || st.paused) return;
      const dt = TICK;

      st.weatherLeft -= dt;
      if (st.weatherLeft <= 0) {
        st.weather = nextWeather(st.weather);
        st.weatherLeft = WEATHER[st.weather].duration;
        audio.setMood(st.weather);
        setBanner({ id: Math.random(), weather: st.weather });
        audio.whoosh();
      }

      if (st.feverLeft > 0) {
        st.feverLeft -= dt;
        if (st.feverLeft <= 0) {
          st.feverLeft = 0;
          audio.setFever(false);
          showToast('Fever over — build another combo!');
        }
      }

      if (!st.customer) {
        st.arrivingIn -= dt;
        if (st.arrivingIn <= 0) spawnCustomer();
      } else {
        const drain = st.feverLeft > 0 ? 0.25 : st.phase === 'craft' ? 0.5 : 1;
        st.customer.patience -= dt * drain;
        if (st.customer.patience <= 0) customerLeaves();
      }
      rerender();
    }, TICK);
    return () => clearInterval(id);
  }, [rerender, spawnCustomer, customerLeaves]);

  // Pause when leaving the tab or backgrounding the page
  useEffect(() => {
    const st = g.current;
    if (!active && st.status === 'playing') {
      st.paused = true;
      rerender();
    }
  }, [active, rerender]);

  useEffect(() => {
    const onVis = () => {
      const st = g.current;
      if (document.hidden) {
        if (st.status === 'playing') st.paused = true;
        audio.suspend();
      } else {
        audio.resume();
      }
      rerender();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [rerender]);

  // ───────── actions ─────────
  const startShift = () => {
    audio.unlock();
    audio.startMusic();
    audio.setFever(false);
    audio.setMood('morning');
    audio.chime(true);
    haptic(HAPTIC.buy);
    g.current = { ...freshSession(bonuses.lives), status: 'playing' };
    setBanner({ id: Math.random(), weather: 'morning' });
    rerender();
  };

  const togglePause = () => {
    const st = g.current;
    if (st.status !== 'playing') return;
    audio.unlock();
    st.paused = !st.paused;
    audio.tap();
    rerender();
  };

  const wrongIngredient = (id) => {
    const st = g.current;
    st.cup = {};
    st.layers = [];
    st.combo = 0;
    st.customer.patience -= st.customer.patienceMax * 0.12;
    audio.error();
    haptic(HAPTIC.error);
    shake(8);
    setCupShake((k) => k + 1);
    flashBoss('sad');
    const c = centerOf(cupRef.current);
    floatText(c.x, c.y - 30, `No ${INGREDIENTS[id].name}!`, 'berry');
    splash(c.x, c.y - 30, LIQUID[id].particle, { count: 14, spread: 80, glow: false });
    st.customer.react = 'sad';
    st.customer.reactUntil = Date.now() + 900;
  };

  const handleAdd = (id) => {
      const st = g.current;
      if (st.status !== 'playing' || st.paused || !st.customer || st.phase !== 'assemble') {
        if (st.phase === 'serve') {
          const c = centerOf(cupRef.current);
          floatText(c.x, c.y - 50, 'Serve it!', 'sky');
        }
        return;
      }
      audio.unlock();
      const recipe = st.customer.recipe;
      const need = recipe.parts[id] || 0;
      const have = st.cup[id] || 0;
      if (have >= need) {
        wrongIngredient(id);
        rerender();
        return;
      }

      const c = centerOf(cupRef.current);
      if (st.feverLeft > 0) {
        // FEVER instant brewing: one correct drop fills the whole drink, QTEs auto-PERFECT
        st.cup = { ...recipe.parts };
        st.layers = Object.entries(recipe.parts).flatMap(([k, n]) => Array(n).fill(k));
        st.stageResults = recipe.steps.map(() => 'PERFECT');
        st.phase = 'serve';
        audio.pour(id);
        audio.chime(true);
        burst(c.x, c.y, { emojis: ['⚡', '✨'], count: 8 });
        splash(c.x, c.y - 40, '#ffd23f', { count: 16, spread: 90 });
        ripple(c.x, c.y, '#ffd23f', 3);
      } else {
        st.cup = { ...st.cup, [id]: have + 1 };
        st.layers = [...st.layers, id];
        audio.pour(id);
        splash(c.x, c.y - 40, LIQUID[id].particle, { count: 12, spread: 55 });
        ripple(c.x, c.y - 10, LIQUID[id].particle, 2.4);
        const complete = Object.entries(recipe.parts).every(([k, n]) => (st.cup[k] || 0) >= n);
        if (complete) {
          if (recipe.steps.length) {
            st.phase = 'craft';
            st.orderToken++;
          } else {
            st.phase = 'serve';
          }
          audio.chime(false);
        }
      }
      haptic(HAPTIC.drop);
      rerender();
  };

  const handleCraftDone = (token) => (results) => {
    const st = g.current;
    if (token !== st.orderToken || st.phase !== 'craft') return; // stale (customer left / fever skipped)
    st.stageResults = results;
    st.phase = 'serve';
    rerender();
  };

  const handleStage = (result) => {
    const st = g.current;
    const c = centerOf(cupRef.current);
    if (result === 'PERFECT') {
      burst(c.x, c.y, { emojis: ['⭐', '✨'], count: 10 });
      // Perfect stages slightly charge Fever and speed prep (patience refund)
      if (st.feverLeft <= 0) st.fever = Math.min(100, st.fever + 4);
      if (st.customer) st.customer.patience = Math.min(st.customer.patienceMax, st.customer.patience + 1500);
    }
  };

  const serve = () => {
    const st = g.current;
    if (st.status !== 'playing' || st.paused || st.phase !== 'serve' || !st.customer) return;
    const { bonuses: b, save: sv } = latest.current;
    const cust = st.customer;
    const w = WEATHER[st.weather];
    const ratio = Math.max(0, cust.patience / cust.patienceMax);
    let quality;
    if (st.feverLeft > 0) quality = 'PERFECT';
    else if (st.stageResults.length) quality = st.stageResults.reduce((a, r) => (RANK[r] < RANK[a] ? r : a), 'PERFECT');
    else quality = ratio > 0.45 ? 'PERFECT' : 'GOOD';

    const price = cust.recipe.price;
    const tip = price * TIP_RATE[quality] * w.tips * b.tipMult * (0.5 + ratio);
    const feverMult = st.feverLeft > 0 ? FEVER_MULT : 1;
    const vipMult = cust.vip ? 2 : 1;
    const coins = Math.max(1, Math.round((price + tip) * feverMult * b.coinMult * vipMult));

    if (quality === 'PERFECT') {
      st.combo += 1;
      st.perfects += 1;
    } else st.combo = 0;
    st.maxCombo = Math.max(st.maxCombo, st.combo);
    st.score += coins * 10 + st.combo * 25;
    st.coins += coins;
    st.served += 1;
    addCoins(coins);

    const c = centerOf(customerRef.current);
    cust.quality = quality;
    cust.outcome = 'happy';
    floatText(c.x, c.y - 20, `+${coins} Coins!`, 'gold', st.feverLeft > 0);
    setTimeout(() => floatText(c.x, c.y + 30, quality === 'PERFECT' ? 'PERFECT!' : quality === 'GOOD' ? 'Good!' : 'Meh…', quality === 'PERFECT' ? 'mint' : 'gold'), 140);
    ripple(c.x, c.y, quality === 'PERFECT' ? '#9fe3c6' : '#ffe27a', 3.5);
    burst(c.x, c.y, { emojis: quality === 'PERFECT' ? ['💖', '🪙', '✨', '💕'] : ['🪙', '👍'], count: quality === 'PERFECT' ? 16 : 8, spread: 120 });
    audio.register();
    audio.voice(cust.voice, 1.15);
    if (quality === 'PERFECT') audio.coin();
    haptic(quality === 'PERFECT' ? HAPTIC.perfect : HAPTIC.good);
    if (st.feverLeft > 0) shake(5);
    flashBoss('happy');

    if (cust.vip) {
      if (!st.vipsServed.includes(cust.vip.id)) st.vipsServed.push(cust.vip.id);
      if (unlockVip(cust.vip.id)) {
        audio.unlock_fanfare();
        showToast(`📖 New VIP Album entry: ${cust.vip.name}!`);
      }
    }
    if (sv && !sv.tutorialDone && st.served >= 3) finishTutorial();

    if (st.feverLeft <= 0) {
      const gain = quality === 'PERFECT' ? 12 + Math.min(st.combo, 5) * 2 : quality === 'GOOD' ? 5 : 0;
      st.fever = Math.min(100, st.fever + gain);
      if (st.fever >= 100) startFever();
    }

    st.outcome = 'happy';
    st.customer = null;
    st.cup = {};
    st.layers = [];
    st.phase = 'assemble';
    st.stageResults = [];
    st.orderToken++;
    st.arrivingIn = st.feverLeft > 0 ? 150 : st.weather === 'rainy' ? 350 : 800;
    rerender();
  };

  const onServeDrop = (point) => {
    const r = customerRef.current?.getBoundingClientRect();
    const cupTop = cupRef.current?.getBoundingClientRect().top ?? 0;
    // swipe the cup up toward the customer (or anywhere well above the station)
    if ((r && point.y <= r.bottom + 30) || point.y < cupTop - 60) serve();
  };

  const trash = () => {
    const st = g.current;
    if (st.phase !== 'assemble' || st.layers.length === 0) return;
    st.cup = {};
    st.layers = [];
    audio.whoosh();
    haptic(HAPTIC.tap);
    rerender();
  };

  // ───────── render ─────────
  const cust = s.customer;
  const remaining = cust ? Object.fromEntries(Object.entries(cust.recipe.parts).map(([k, n]) => [k, Math.max(0, n - (s.cup[k] || 0))])) : {};
  const wpItem = ITEMS.find((i) => i.id === save.equipped.wallpaper);
  const wallpaper = !wpItem || wpItem.id === 'wp_cream' ? 'wp-cozy' : wpItem.preview;
  const neon = ITEMS.find((i) => i.id === save.equipped.neon);
  const hat = save.equipped.hat;
  const glasses = save.equipped.glasses;
  const totalParts = cust ? sumParts(cust.recipe.parts) : 1;
  const playing = s.status === 'playing';
  const ready = playing && s.phase === 'serve';

  const hint = !playing
    ? ''
    : s.phase === 'serve'
      ? 'Swipe the cup to the customer — or ring the bell!'
      : s.phase === 'craft'
        ? ''
        : inFever
          ? 'Instant brew! Drop any correct ingredient'
          : cust
            ? 'Drag ingredients into the cup'
            : 'Next customer coming…';

  return (
    <div className={`relative flex h-full flex-col ${inFever ? 'fever-mode' : ''}`}>
      {/* HUD */}
      <div className="flex items-center justify-between px-3 pb-1.5 pt-0.5">
        <Hearts lives={s.lives} max={s.maxLives} />
        <div className="text-center">
          <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-cream/60">Score</div>
          <motion.div key={s.score} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className="title-outline text-[22px] leading-none">
            {s.score.toLocaleString()}
          </motion.div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold text-cream shadow-[inset_0_1px_2px_rgba(0,0,0,.4)]">
            {WEATHER[s.weather].icon} {WEATHER[s.weather].label}
          </span>
          <button type="button" onClick={togglePause} disabled={!playing} className="btn btn-cream h-8 w-8 !rounded-full text-xs" aria-label="Pause">
            ❚❚
          </button>
        </div>
      </div>
      <FeverGauge value={s.fever} feverLeft={s.feverLeft} combo={s.combo} />

      {/* Scene */}
      <div className={`relative mx-3 mt-2 flex-1 rounded-[30px] p-[5px] shadow-soft ${inFever ? 'fever-scene bg-gold-400' : 'bg-gradient-to-b from-roast-500 to-roast-700'}`} style={{ minHeight: 0 }}>
        <CafeScene
          wallpaper={wallpaper}
          neon={neon}
          weather={s.weather}
          fever={inFever}
          counterRef={counterRef}
          counterSlot={
            playing &&
            s.queue.length > 0 && (
              <div className="absolute bottom-[3px] left-1/2 flex -translate-x-1/2 items-end gap-0.5 rounded-t-xl bg-roast-950/35 px-2 pt-0.5">
                <span className="mb-1 mr-1 font-display text-[10px] uppercase tracking-wider text-gold-200/90">Next</span>
                {s.queue.slice(0, 2).map((q) => (
                  <div key={q.uid} className={`h-[34px] overflow-hidden ${q.vip ? 'drop-shadow-[0_0_6px_gold]' : ''}`}>
                    <Character look={q.look} size={32} still />
                  </div>
                ))}
              </div>
            )
          }
          characters={
            <>
              <div className="absolute bottom-[22px] left-0">
                <BossCat hat={hat} glasses={glasses} fever={inFever} mood={bossMood} />
              </div>
              <div className="absolute bottom-[54px] left-[33%] origin-bottom scale-[0.78]">
                <EspressoMachine fever={inFever} busy={s.phase === 'craft' || ready} />
              </div>
              <div className="absolute bottom-[26px] right-2">
                <AnimatePresence custom={s.outcome}>
                  {cust && <Customer key={cust.uid} ref={customerRef} customer={cust} cup={s.cup} fever={inFever} excited={ready} />}
                </AnimatePresence>
              </div>
            </>
          }
          overlay={<AnimatePresence>{banner && <WeatherBanner key={banner.id} weather={banner.weather} />}</AnimatePresence>}
        />
      </div>

      {/* Workstation */}
      <div className="panel-wood relative mx-3 mb-2 mt-2 pt-2">
        <div className="flex items-end justify-between px-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={trash}
            className="btn btn-berry mb-2 h-[46px] w-[46px]"
            disabled={!playing || s.phase !== 'assemble' || s.layers.length === 0}
            aria-label="Empty cup"
          >
            <TrashIcon size={26} />
          </motion.button>
          <div className="relative">
            {/* barista mat */}
            <div className="absolute -bottom-1 left-1/2 h-4 w-[130px] -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-mint-600 to-mint-800 shadow-[inset_0_2px_0_rgba(255,255,255,.25)]" />
            <Cup
              ref={cupRef}
              layers={s.layers}
              totalParts={totalParts}
              hover={hoverCup}
              ready={ready}
              fever={inFever}
              shakeKey={cupShake}
              onServeDrop={onServeDrop}
            />
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={serve}
            disabled={!ready}
            animate={ready ? { scale: [1, 1.12, 1], rotate: [0, -8, 8, 0] } : { scale: 1, rotate: 0 }}
            transition={{ repeat: ready ? Infinity : 0, duration: 0.8 }}
            className={`btn btn-mint mb-2 h-[46px] w-[46px] ${ready ? 'shadow-glow' : ''}`}
            aria-label="Serve"
          >
            <BellIcon size={30} />
          </motion.button>
        </div>
        <div className="h-5 pt-0.5 text-center font-display text-[12px] tracking-wide text-gold-200 drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">{hint}</div>
        <DragAndDropTray
          cupRef={cupRef}
          onAdd={handleAdd}
          onHover={setHoverCup}
          disabled={!playing || s.paused || s.phase !== 'assemble' || !cust}
          fever={inFever}
          remaining={remaining}
          showHints={showHints || inFever}
        />
        <AnimatePresence>
          {playing && s.phase === 'craft' && cust && (
            <QTECrafting key={s.orderToken} steps={cust.recipe.steps} upgrades={save.upgrades} paused={s.paused} onStage={handleStage} onDone={handleCraftDone(s.orderToken)} />
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ y: -40, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="card pointer-events-none absolute left-1/2 top-14 z-50 w-[88%] px-3 py-2 text-center font-display text-[15px] text-roast-800"
            style={{ x: '-50%', boxShadow: '0 0 0 3px #ffd23f, 0 0 22px rgba(255,210,63,.7), 0 10px 20px -10px rgba(0,0,0,.6)' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <AnimatePresence>
        {s.status === 'ready' && <StartOverlay key="start" onStart={startShift} save={save} bonuses={bonuses} hat={hat} glasses={glasses} />}
        {s.status === 'over' && <GameOverOverlay key="over" session={s} onRestart={startShift} />}
        {playing && s.paused && <PauseOverlay key="pause" onResume={togglePause} onQuit={endShift} />}
      </AnimatePresence>
    </div>
  );
}

export function Overlay({ children }) {
  return (
    <motion.div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-roast-950/70 p-5 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="sheet relative w-full rounded-[32px] p-5 text-center text-roast-800"
        style={{ boxShadow: 'inset 0 3px 0 #fff, inset 0 -5px 0 rgba(192,138,91,.25), 0 0 0 4px #c08a5b, 0 0 0 8px #5c331d, 0 24px 40px -12px rgba(0,0,0,.8)' }}
        initial={{ scale: 0.7, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function BigButton({ children, onClick, tone = 'gold' }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.95 }} onClick={onClick} className={`btn btn-${tone} w-full py-3.5 font-display text-2xl`}>
      {children}
    </motion.button>
  );
}

function StatTile({ icon, value, label, accent }) {
  return (
    <div className={`card-inset flex flex-col items-center px-1 py-2 ${accent ? '!bg-gradient-to-b !from-gold-200 !to-gold-300' : ''}`}>
      <div className="h-6">{icon}</div>
      <div className="font-display text-lg leading-tight text-roast-800">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-roast-500">{label}</div>
    </div>
  );
}

function StartOverlay({ onStart, save, bonuses, hat, glasses }) {
  return (
    <Overlay>
      <div className="relative -mt-16 mb-1 flex justify-center">
        <div className="absolute top-8 h-28 w-28 rounded-full bg-gold-300/60 blur-2xl" />
        <Character look="boss" expr="happy" size={120} hat={hat} glasses={glasses} />
      </div>
      <h1 className="title-outline text-[34px] leading-none">Meow Barista</h1>
      <div className="mt-1 font-display text-lg text-mint-600">~ Purrfect Tycoon ~</div>
      <div className="my-3 grid grid-cols-3 gap-2">
        <StatTile icon={<span className="text-lg">🏆</span>} value={save.highScore.toLocaleString()} label="Best" />
        <StatTile icon={<span className="text-lg">🔥</span>} value={save.bestCombo} label="Combo" />
        <StatTile icon={<CoinIcon size={22} />} value={`×${bonuses.coinMult.toFixed(2)}`} label="Coins" accent />
      </div>
      <ul className="card-inset mb-4 space-y-1.5 p-3 text-left text-[13px] font-medium leading-snug text-roast-700">
        <li>☕ <b>Drag</b> (or tap) ingredients into the cup to match the order.</li>
        <li>⚙️ <b>Grind</b> fast &amp; <b>froth</b> in the green zone for PERFECT tips.</li>
        <li>🛎️ <b>Swipe</b> the cup to the customer before patience runs out.</li>
        <li>🔥 Chain PERFECTs to fill <b>Fever</b>: ×3 coins + instant brewing!</li>
      </ul>
      <BigButton onClick={onStart}>Open the Café!</BigButton>
    </Overlay>
  );
}

function GameOverOverlay({ session, onRestart }) {
  return (
    <Overlay>
      <div className="relative -mt-16 mb-1 flex justify-center">
        <Character look="boss" expr={session.newRecord ? 'love' : 'sad'} size={110} />
      </div>
      <h2 className="title-outline text-3xl">{session.newRecord ? 'New High Score!' : 'Shift Over'}</h2>
      <motion.div className="float-text ft-gold ft-big mt-1" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.2 }}>
        {session.score.toLocaleString()}
      </motion.div>
      <div className="my-3 grid grid-cols-2 gap-2">
        <StatTile icon={<span>☕</span>} value={session.served} label="Served" />
        <StatTile icon={<span>⭐</span>} value={session.perfects} label="Perfect" />
        <StatTile icon={<span>🔥</span>} value={session.maxCombo} label="Max combo" />
        <StatTile icon={<CoinIcon size={20} />} value={`+${session.coins}`} label="Coins" accent />
      </div>
      {session.vipsServed.length > 0 && <div className="mb-3 font-display text-sm text-gold-600">★ VIPs served: {session.vipsServed.length}</div>}
      <p className="mb-3 text-xs font-medium text-roast-500">Spend coins in the Shop &amp; Garden to boost your next shift!</p>
      <BigButton onClick={onRestart}>Play Again</BigButton>
    </Overlay>
  );
}

function PauseOverlay({ onResume, onQuit }) {
  return (
    <Overlay>
      <div className="relative -mt-16 mb-1 flex justify-center">
        <Character look="boss" expr="happy" size={104} />
      </div>
      <h2 className="title-outline mb-4 text-3xl">Paws-ed</h2>
      <div className="space-y-3">
        <BigButton onClick={onResume} tone="mint">
          Resume
        </BigButton>
        <BigButton onClick={onQuit} tone="berry">
          End Shift
        </BigButton>
      </div>
    </Overlay>
  );
}
