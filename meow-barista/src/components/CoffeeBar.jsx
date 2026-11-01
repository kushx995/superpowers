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
import { WeatherBanner, WeatherWindow, nextWeather } from './WeatherSystem';
import DragAndDropTray from './DragAndDropTray';
import QTECrafting from './QTECrafting';
import Customer from './Customer';
import Cup from './Cup';

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
    return { uid: Math.random(), emoji: vip.emoji, name: vip.name, voice: 'meow', vip, recipe, patienceMax, patience: patienceMax };
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
        <motion.span key={i} className="text-lg" animate={i < lives ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0.25 }}>
          {i < lives ? '❤️' : '🖤'}
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
      <div className={`relative h-5 flex-1 overflow-hidden rounded-full border-2 ${inFever ? 'border-amber-300' : 'border-mocha-700'} bg-mocha-900/60`}>
        <motion.div
          className={`h-full ${inFever ? 'bg-gradient-to-r from-amber-300 via-fuchsia-400 to-amber-300' : 'bg-gradient-to-r from-orange-400 to-amber-300'}`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: inFever ? 0.1 : 0.4, ease: inFever ? 'linear' : 'easeOut' }}
        />
        <span className="absolute inset-0 grid place-items-center text-[10px] font-black uppercase tracking-widest text-white drop-shadow">
          {inFever ? `🔥 FEVER ×${FEVER_MULT} · ${Math.ceil(feverLeft / 1000)}s 🔥` : value >= 70 ? 'Fever almost ready!' : 'Fever'}
        </span>
      </div>
      <AnimatePresence mode="popLayout">
        {combo > 1 && (
          <motion.div
            key={combo}
            initial={{ scale: 2, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl bg-fuchsia-500 px-2 py-0.5 font-display text-sm font-black text-white shadow-chunky"
          >
            {combo}× COMBO
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BossCat({ hat, glasses, fever, mood }) {
  return (
    <motion.div
      className="relative select-none text-[58px] leading-none"
      animate={fever ? { rotate: [-8, 8, -8], y: [0, -6, 0] } : { rotate: 0, y: [0, -2, 0] }}
      transition={{ repeat: Infinity, duration: fever ? 0.4 : 2 }}
    >
      {mood === 'happy' ? '😸' : mood === 'sad' ? '😿' : '😺'}
      {hat && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[34px]">{hat}</span>}
      {glasses && <span className="absolute left-1/2 top-[14px] -translate-x-1/2 text-[30px]">{glasses}</span>}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-mocha-900 px-1 text-[8px] font-black uppercase text-amber-200">Boss</span>
    </motion.div>
  );
}

export default function CoffeeBar({ active, shake }) {
  const { save, bonuses, addCoins, unlockVip, recordShift, finishTutorial } = useGame();
  const { burst, floatText } = useParticles();
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
    floatText(c.x, c.y - 40, 'FEVER MODE!', 'text-amber-300 text-4xl');
    // instant brewing: finish any in-progress craft immediately
    if (st.phase === 'craft') {
      st.stageResults = st.customer.recipe.steps.map(() => 'PERFECT');
      st.phase = 'serve';
      st.orderToken++;
    }
  }, [burst, floatText, shake]);

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
    floatText(c.x, c.y, '-1 ❤️ Too slow!', 'text-rose-400');
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
    floatText(c.x, c.y - 30, `No ${INGREDIENTS[id].name}! ✗`, 'text-rose-400');
    burst(c.x, c.y, { emojis: ['💦', '💧'], count: 8 });
  };

  const handleAdd = (id) => {
      const st = g.current;
      if (st.status !== 'playing' || st.paused || !st.customer || st.phase !== 'assemble') {
        if (st.phase === 'serve') {
          const c = centerOf(cupRef.current);
          floatText(c.x, c.y - 50, 'Serve it! ⬆️', 'text-sky-300');
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
        burst(c.x, c.y, { emojis: ['⚡', '✨', INGREDIENTS[id].emoji], count: 12 });
      } else {
        st.cup = { ...st.cup, [id]: have + 1 };
        st.layers = [...st.layers, id];
        audio.pour(id);
        burst(c.x, c.y - 20, { emojis: [INGREDIENTS[id].emoji, '✨'], count: 5, spread: 50 });
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
    floatText(c.x, c.y - 20, `+${coins} 🪙`, 'text-amber-300');
    setTimeout(() => floatText(c.x, c.y + 20, quality === 'PERFECT' ? 'PERFECT!' : quality === 'GOOD' ? 'Good' : 'Meh…', quality === 'PERFECT' ? 'text-emerald-300' : 'text-amber-200'), 120);
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
  const wallpaper = ITEMS.find((i) => i.id === save.equipped.wallpaper)?.preview || 'bg-[#fbe9d3]';
  const neon = ITEMS.find((i) => i.id === save.equipped.neon);
  const hat = ITEMS.find((i) => i.id === save.equipped.hat)?.emoji;
  const glasses = ITEMS.find((i) => i.id === save.equipped.glasses)?.emoji;
  const totalParts = cust ? sumParts(cust.recipe.parts) : 1;
  const playing = s.status === 'playing';

  return (
    <div className={`relative flex h-full flex-col ${inFever ? 'fever-mode' : ''}`}>
      {/* HUD */}
      <div className="flex items-center justify-between px-3 pb-1 pt-1">
        <Hearts lives={s.lives} max={s.maxLives} />
        <div className="text-center">
          <div className="text-[9px] font-black uppercase tracking-widest text-cream/70">Score</div>
          <motion.div key={s.score} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="font-display text-xl font-black leading-none text-cream">
            {s.score.toLocaleString()}
          </motion.div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-black text-cream">
            {WEATHER[s.weather].icon} {WEATHER[s.weather].label}
          </span>
          <button type="button" onClick={togglePause} disabled={!playing} className="grid h-8 w-8 place-items-center rounded-full bg-black/30 text-sm text-cream disabled:opacity-30" aria-label="Pause">
            ⏸
          </button>
        </div>
      </div>
      <FeverGauge value={s.fever} feverLeft={s.feverLeft} combo={s.combo} />

      {/* Scene */}
      <div className={`relative mx-3 mt-2 flex-1 overflow-hidden rounded-3xl border-4 border-mocha-700 ${wallpaper} ${inFever ? 'fever-scene' : ''}`} style={{ minHeight: 230 }}>
        <div className="absolute left-3 top-3 h-[92px] w-[44%]">
          <WeatherWindow weather={s.weather} fever={inFever} />
        </div>
        {neon && (
          <div className="neon-sign absolute right-3 top-4 max-w-[48%] rotate-[-4deg] text-right font-display text-lg font-black leading-tight" style={{ color: neon.color, '--neon': neon.color }}>
            {neon.text}
          </div>
        )}
        {/* upcoming queue */}
        <div className="absolute left-3 top-[110px] flex items-center gap-1 rounded-full bg-black/15 px-2 py-0.5 text-lg">
          {s.queue.slice(0, 2).map((q) => (
            <span key={q.uid} className={q.vip ? 'drop-shadow-[0_0_6px_gold]' : 'opacity-70'}>
              {q.emoji}
            </span>
          ))}
          {playing && s.queue.length > 0 && <span className="text-[10px] font-black uppercase text-mocha-900/60">next</span>}
        </div>

        {/* customer */}
        <div className="absolute bottom-[54px] right-3 z-10">
          <AnimatePresence custom={s.outcome}>
            {cust && <Customer key={cust.uid} ref={customerRef} customer={cust} cup={s.cup} fever={inFever} />}
          </AnimatePresence>
        </div>

        {/* counter + boss */}
        <div ref={counterRef} className="absolute inset-x-0 bottom-0 h-[62px]">
          <div className="absolute bottom-[40px] left-4 z-10">
            <BossCat hat={hat} glasses={glasses} fever={inFever} mood={bossMood} />
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[40px] border-t-[6px] border-mocha-300 bg-gradient-to-b from-mocha-500 to-mocha-700" />
          <div className="absolute bottom-[40px] left-[38%] text-2xl">🧁</div>
        </div>

        <AnimatePresence>{banner && <WeatherBanner key={banner.id} weather={banner.weather} />}</AnimatePresence>
      </div>

      {/* Workstation */}
      <div className="relative mx-3 mt-2 rounded-3xl bg-mocha-900/50 pb-1 pt-2">
        <div className="flex items-end justify-between px-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={trash}
            className="mb-2 grid h-12 w-12 place-items-center rounded-2xl border-b-4 border-rose-900 bg-rose-500 text-xl shadow-chunky disabled:opacity-40"
            disabled={!playing || s.phase !== 'assemble' || s.layers.length === 0}
            aria-label="Empty cup"
          >
            🗑️
          </motion.button>
          <Cup
            ref={cupRef}
            layers={s.layers}
            totalParts={totalParts}
            hover={hoverCup}
            ready={playing && s.phase === 'serve'}
            fever={inFever}
            shakeKey={cupShake}
            onServeDrop={onServeDrop}
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={serve}
            disabled={!playing || s.phase !== 'serve'}
            animate={s.phase === 'serve' && playing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={{ repeat: s.phase === 'serve' ? Infinity : 0, duration: 0.7 }}
            className="mb-2 grid h-12 w-12 place-items-center rounded-2xl border-b-4 border-emerald-900 bg-emerald-500 text-xl shadow-chunky disabled:opacity-40"
            aria-label="Serve"
          >
            🛎️
          </motion.button>
        </div>
        <div className="h-5 text-center text-[11px] font-black uppercase tracking-wide text-cream/80">
          {!playing
            ? ''
            : s.phase === 'serve'
              ? '⬆️ Swipe the cup to the customer (or tap 🛎️)'
              : s.phase === 'craft'
                ? ''
                : inFever
                  ? '⚡ INSTANT BREW — drop any correct ingredient!'
                  : cust
                    ? 'Drag ingredients into the cup'
                    : 'Next customer coming…'}
        </div>
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
            <QTECrafting
              key={s.orderToken}
              steps={cust.recipe.steps}
              upgrades={save.upgrades}
              paused={s.paused}
              onStage={handleStage}
              onDone={handleCraftDone(s.orderToken)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="pointer-events-none absolute left-1/2 top-14 z-50 w-[88%] -translate-x-1/2 rounded-2xl border-2 border-amber-300 bg-mocha-900/95 px-3 py-2 text-center text-sm font-black text-amber-200 shadow-glow"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      <AnimatePresence>
        {s.status === 'ready' && <StartOverlay key="start" onStart={startShift} save={save} bonuses={bonuses} />}
        {s.status === 'over' && <GameOverOverlay key="over" session={s} onRestart={startShift} />}
        {playing && s.paused && <PauseOverlay key="pause" onResume={togglePause} onQuit={endShift} />}
      </AnimatePresence>
    </div>
  );
}

function Overlay({ children }) {
  return (
    <motion.div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-mocha-900/70 p-5 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full rounded-[28px] border-4 border-mocha-300 bg-cream p-5 text-center text-mocha-900 shadow-2xl"
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

function BigButton({ children, onClick, tone = 'amber' }) {
  const tones = {
    amber: 'border-amber-700 from-amber-300 to-amber-500 text-mocha-900',
    rose: 'border-rose-900 from-rose-400 to-rose-600 text-white',
  };
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92, y: 3 }}
      onClick={onClick}
      className={`w-full rounded-2xl border-b-[6px] bg-gradient-to-b px-6 py-3 font-display text-2xl font-black shadow-chunky ${tones[tone]}`}
    >
      {children}
    </motion.button>
  );
}

function StartOverlay({ onStart, save, bonuses }) {
  return (
    <Overlay>
      <motion.div className="text-7xl" animate={{ rotate: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 1.4 }}>
        😺☕
      </motion.div>
      <h1 className="mt-2 font-display text-3xl font-black leading-none">Meow Barista</h1>
      <div className="font-display text-lg font-bold text-mocha-500">Purrfect Tycoon</div>
      <div className="my-3 grid grid-cols-3 gap-2 text-xs font-bold">
        <div className="rounded-xl bg-mocha-100 p-2">
          🏆<div className="text-base font-black">{save.highScore.toLocaleString()}</div>Best
        </div>
        <div className="rounded-xl bg-mocha-100 p-2">
          🔥<div className="text-base font-black">{save.bestCombo}</div>Combo
        </div>
        <div className="rounded-xl bg-mocha-100 p-2">
          🐾<div className="text-base font-black">×{bonuses.coinMult.toFixed(2)}</div>Coins
        </div>
      </div>
      <ul className="mb-4 space-y-1 text-left text-[13px] font-semibold leading-snug">
        <li>🫳 <b>Drag</b> (or tap) ingredients into the cup to match the order.</li>
        <li>⚙️ <b>Grind</b> fast &amp; ♨️ <b>froth</b> in the green zone for PERFECT tips.</li>
        <li>⬆️ <b>Swipe</b> the cup to the customer before patience runs out.</li>
        <li>🔥 Chain PERFECTs to fill <b>Fever</b>: ×3 coins + instant brewing!</li>
      </ul>
      <BigButton onClick={onStart}>Open the Café!</BigButton>
    </Overlay>
  );
}

function GameOverOverlay({ session, onRestart }) {
  return (
    <Overlay>
      <div className="text-6xl">{session.newRecord ? '🏆' : '😿'}</div>
      <h2 className="font-display text-3xl font-black">{session.newRecord ? 'New High Score!' : 'Shift Over'}</h2>
      <motion.div className="font-display text-4xl font-black text-amber-600" initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ delay: 0.2 }}>
        {session.score.toLocaleString()}
      </motion.div>
      <div className="my-3 grid grid-cols-2 gap-2 text-sm font-bold">
        <div className="rounded-xl bg-mocha-100 p-2">☕ {session.served} served</div>
        <div className="rounded-xl bg-mocha-100 p-2">⭐ {session.perfects} perfect</div>
        <div className="rounded-xl bg-mocha-100 p-2">🔥 {session.maxCombo} max combo</div>
        <div className="rounded-xl bg-amber-200 p-2">🪙 +{session.coins} coins</div>
      </div>
      {session.vipsServed.length > 0 && <div className="mb-3 text-sm font-bold">👑 VIPs served: {session.vipsServed.length}</div>}
      <p className="mb-3 text-xs font-semibold text-mocha-500">Spend coins in the Shop &amp; Garden to boost your next shift!</p>
      <BigButton onClick={onRestart}>Play Again</BigButton>
    </Overlay>
  );
}

function PauseOverlay({ onResume, onQuit }) {
  return (
    <Overlay>
      <div className="text-6xl">😴</div>
      <h2 className="mb-4 font-display text-3xl font-black">Paws-ed</h2>
      <div className="space-y-3">
        <BigButton onClick={onResume}>Resume</BigButton>
        <BigButton onClick={onQuit} tone="rose">
          End Shift
        </BigButton>
      </div>
    </Overlay>
  );
}

