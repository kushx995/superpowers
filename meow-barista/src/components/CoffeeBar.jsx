// The café shift. Overcooked-style juggling: up to three brewing stations (one per
// counter seat), STRICT recipe sequences that ruin the cup on a wrong step, limited
// ingredient stock with a risky Restock, troublemaker customers, rush hours, plus
// QTE crafting, combo/Fever, weather and lives. Pure rules live in game/engine.js.
import { createRef, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FEVER_DURATION, FEVER_MULT, INGREDIENTS, INGREDIENT_ORDER, ITEMS, RUSH, TRAITS, WEATHER } from '../game/data';
import {
  drainFor,
  emptyStation,
  freshSession,
  isComplete,
  isPrefix,
  makeCustomer,
  payout,
  pickRecipe,
  qualityFor,
  seatsFor,
} from '../game/engine';
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
import { Character } from './Avatars';
import { CoinIcon, HeartIcon, TrashIcon, BellIcon } from './Icons';

const TICK = 100;

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
            initial={{ scale: 1.5, rotate: -20, opacity: 0 }}
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
  const g = useRef(freshSession(bonuses.lives, bonuses.stockCap));
  const [, setFrame] = useState(0);
  const rerender = useCallback(() => setFrame((f) => (f + 1) % 1e9), []);
  const [hoverCup, setHoverCup] = useState(-1);
  const [cupShake, setCupShake] = useState([0, 0, 0]);
  const [bossMood, setBossMood] = useState('idle');
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState(null);
  const cupRefs = useRef([createRef(), createRef(), createRef()]).current;
  const custRefs = useRef([createRef(), createRef(), createRef()]).current;
  const counterRef = useRef(null);
  const latest = useRef({});
  latest.current = { save, bonuses, shake };

  const s = g.current;
  const inFever = s.feverLeft > 0;
  const playing = s.status === 'playing';
  const showHints = (!save.tutorialDone && s.served < 3) || inFever;

  // ───────── small helpers ─────────
  const flashBoss = (mood) => {
    setBossMood(mood);
    setTimeout(() => setBossMood('idle'), 900);
  };
  const showToast = (t) => {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 2600);
  };
  const cupCenter = (i) => centerOf(cupRefs[i].current);
  const custCenter = (i) => centerOf(custRefs[i].current || counterRef.current);

  /** A station is "accepting" when it can take the next ingredient. */
  const accepting = (st, i) => {
    const c = st.customers[i];
    const sta = st.stations[i];
    return i < st.seats && !!c && sta.phase === 'assemble' && !sta.ruined && !sta.dumping;
  };
  const selectNextActive = (st) => {
    if (accepting(st, st.active)) return;
    for (let i = 0; i < st.seats; i++) {
      if (accepting(st, i)) {
        st.active = i;
        return;
      }
    }
  };

  /** Recompute a station's phase after its customer or order changed. Mismatched cups get ruined. */
  const revalidate = (st, i, blame) => {
    const sta = st.stations[i];
    const c = st.customers[i];
    if (!c || sta.ruined || sta.layers.length === 0) {
      if (!sta.ruined) sta.phase = 'assemble';
      return;
    }
    if (!isPrefix(sta.layers, c.recipe.seq)) {
      ruinStation(st, i, c.changed ? 'Order changed!' : 'Wrong drink for them!', blame);
      return;
    }
    sta.stageResults = [];
    sta.phase = isComplete(sta.layers, c.recipe.seq) ? (c.recipe.steps.length ? 'craft' : 'serve') : 'assemble';
  };

  // ───────── penalties ─────────
  function ruinStation(st, i, reason, blame = true) {
    const sta = st.stations[i];
    sta.ruined = true;
    sta.ruinReason = reason;
    sta.phase = 'assemble';
    sta.token++;
    if (st.craftingStation === i) st.craftingStation = null;
    st.ruinedCount++;
    const c = st.customers[i];
    if (blame) {
      st.combo = 0;
      st.fever = Math.max(0, st.fever - 25);
      st.score = Math.max(0, st.score - 50);
      if (c) {
        c.patience -= c.patienceMax * 0.1;
        c.react = 'sad';
        c.reactUntil = Date.now() + 900;
      }
      latest.current.shake(8);
      flashBoss('sad');
    }
    audio.error();
    haptic(HAPTIC.error);
    setCupShake((k) => k.map((v, j) => (j === i ? v + 1 : v)));
    const p = cupCenter(i);
    floatText(p.x, p.y - 40, reason, 'berry');
    splash(p.x, p.y - 30, '#8a9160', { count: 14, spread: 70, glow: false });
  }

  const startFever = useCallback(() => {
    const st = g.current;
    st.fever = 0;
    st.feverLeft = FEVER_DURATION;
    audio.setFever(true);
    audio.feverStart();
    haptic(HAPTIC.fever);
    latest.current.shake(14);
    const c = centerOf(counterRef.current);
    burst(c.x, c.y, { emojis: ['🔥', '⭐', '✨', '💛'], count: 24, spread: 180 });
    floatText(c.x, c.y - 40, 'FEVER MODE!', 'gold', true);
    ripple(c.x, c.y, '#ffd23f', 6);
    ripple(c.x, c.y, '#ff4fd8', 4);
    // instant brewing: every in-progress craft completes immediately
    st.stations.forEach((sta, i) => {
      if (sta.phase === 'craft' && st.customers[i]) {
        sta.stageResults = st.customers[i].recipe.steps.map(() => 'PERFECT');
        sta.phase = 'serve';
        sta.token++;
      }
    });
    st.craftingStation = null;
  }, [burst, floatText, ripple]);

  const endShift = useCallback(() => {
    const st = g.current;
    st.status = 'over';
    st.feverLeft = 0;
    st.craftingStation = null;
    audio.setFever(false);
    audio.gameOver();
    st.newRecord = recordShift({ score: st.score, combo: st.maxCombo, served: st.served });
    if (!latest.current.save.tutorialDone) finishTutorial();
    rerender();
  }, [recordShift, finishTutorial, rerender]);

  const arrivalDelay = (st, i) => {
    if (st.feverLeft > 0) return 250;
    if (st.rushLeft > 0) return 300 + i * 150;
    return (st.weather === 'rainy' ? 1000 : 1700) + Math.random() * 900;
  };

  const customerLeaves = (st, i) => {
    const c = st.customers[i];
    if (!c) return;
    c.outcome = 'angry';
    st.customers[i] = null;
    if (st.craftingStation === i) {
      st.craftingStation = null;
      st.stations[i].token++;
      st.stations[i].phase = 'assemble';
    }
    st.combo = 0;
    st.fever = Math.max(0, st.fever * 0.6);
    st.lives -= 1;
    st.arriveIn[i] = arrivalDelay(st, i) + 600;
    audio.lifeLost();
    audio.voice('woof', 0.7);
    haptic(HAPTIC.lifeLost);
    latest.current.shake(10);
    flashBoss('sad');
    const p = custCenter(i);
    floatText(p.x, p.y, 'Walked out! -1 ♥', 'berry');
    burst(p.x, p.y, { emojis: ['💢', '💔'], count: 6 });
    selectNextActive(st);
    if (st.lives <= 0) endShift();
  };

  const spawnCustomer = (st, i) => {
    const { bonuses: b, save: sv } = latest.current;
    while (st.queue.length < 3) {
      st.customerCount++;
      st.queue.push(makeCustomer(st, b, sv.album));
    }
    const c = st.queue.shift();
    c.outcome = 'happy';
    st.customers[i] = c;
    revalidate(st, i, false);
    selectNextActive(st);
    audio.voice(c.voice, c.vip ? 0.85 : 0.9 + Math.random() * 0.3);
    if (c.vip) {
      audio.unlock_fanfare();
      showToast(`★ VIP ${c.name} has arrived!`);
      haptic(HAPTIC.perfect);
    } else if (c.trait === 'impatient') {
      showToast(`⚡ ${c.name} is IMPATIENT — and it's contagious!`);
    }
  };

  const changeOrder = (st, i) => {
    const c = st.customers[i];
    const next = pickRecipe(st, c.recipe.id);
    c.recipe = next;
    c.changed = true;
    c.patience = Math.min(c.patienceMax, c.patience + c.patienceMax * 0.22);
    c.react = 'wow';
    c.reactUntil = Date.now() + 900;
    audio.voice(c.voice, 1.3);
    haptic(HAPTIC.error);
    const p = custCenter(i);
    floatText(p.x, p.y - 30, 'Actually… new order!', 'sky');
    revalidate(st, i, false);
    selectNextActive(st);
  };

  // ───────── main loop ─────────
  useEffect(() => {
    const id = setInterval(() => {
      const st = g.current;
      if (st.status !== 'playing' || st.paused) return;
      const dt = TICK;
      st.elapsed += dt;

      // weather
      st.weatherLeft -= dt;
      if (st.weatherLeft <= 0) {
        st.weather = nextWeather(st.weather);
        st.weatherLeft = WEATHER[st.weather].duration;
        audio.setMood(st.weather);
        setBanner({ id: Math.random(), weather: st.weather });
        audio.whoosh();
      }

      // fever
      if (st.feverLeft > 0) {
        st.feverLeft -= dt;
        if (st.feverLeft <= 0) {
          st.feverLeft = 0;
          audio.setFever(false);
          showToast('Fever over — build another combo!');
        }
      }

      // rush hour
      if (st.served >= 4) {
        if (st.rushLeft > 0) {
          st.rushLeft -= dt;
          if (st.rushLeft <= 0) {
            st.rushLeft = 0;
            showToast('Rush hour over. Breathe… and restock!');
          }
        } else {
          st.nextRushIn -= dt;
          if (st.nextRushIn <= 0) {
            st.rushLeft = RUSH.duration;
            st.nextRushIn = RUSH.every;
            st.rushCount++;
            st.arriveIn = st.arriveIn.map((v, i) => Math.min(v, 200 + i * 200));
            audio.feverStart();
            haptic(HAPTIC.fever);
            latest.current.shake(9);
            showToast(`🔔 RUSH HOUR! ×${RUSH.tips} tips — orders flooding in!`);
          }
        }
      }

      // restock
      if (st.restockLeft > 0) {
        st.restockLeft -= dt;
        if (st.restockLeft <= 0) {
          st.restockLeft = 0;
          const cap = latest.current.bonuses.stockCap;
          INGREDIENT_ORDER.forEach((k) => (st.stock[k] = cap));
          audio.register();
          haptic(HAPTIC.good);
        }
      }

      // stations unlock
      const seats = seatsFor(st.served);
      if (seats > st.seats) {
        st.seats = seats;
        st.arriveIn[seats - 1] = 900;
        audio.unlock_fanfare();
        showToast(`New station unlocked! Juggle ${seats} orders at once`);
      }

      // customers
      for (let i = 0; i < st.seats; i++) {
        const c = st.customers[i];
        if (!c) {
          st.arriveIn[i] -= dt;
          if (st.arriveIn[i] <= 0) spawnCustomer(st, i);
          continue;
        }
        c.patience -= dt * drainFor(st, i);
        if (c.trait === 'indecisive' && !c.changed && c.patience / c.patienceMax <= TRAITS.indecisive.changeAt) changeOrder(st, i);
        if (c.patience <= 0) customerLeaves(st, i);
        if (st.status !== 'playing') break;
      }
      rerender();
    }, TICK);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ───────── player actions ─────────
  const startShift = () => {
    audio.unlock();
    audio.startMusic();
    audio.setFever(false);
    audio.setMood('morning');
    audio.chime(true);
    haptic(HAPTIC.buy);
    g.current = { ...freshSession(bonuses.lives, bonuses.stockCap), status: 'playing' };
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

  const nope = (i, text) => {
    const p = cupCenter(i);
    floatText(p.x, p.y - 50, text, 'sky');
    audio.tap();
  };

  const handleAdd = (id, target) => {
    const st = g.current;
    if (st.status !== 'playing' || st.paused || st.restockLeft > 0) return;
    const i = target ?? st.active;
    if (i >= st.seats) return;
    const sta = st.stations[i];
    const c = st.customers[i];
    if (!c) return nope(i, 'No order here yet');
    if (sta.dumping) return;
    if (sta.ruined) return nope(i, 'Trash it first!');
    if (sta.phase === 'serve') return nope(i, 'Serve it!');
    if (sta.phase === 'craft') return nope(i, 'Tap the cup to craft');
    if (st.stock[id] <= 0) return nope(i, 'Tray empty — restock!');
    audio.unlock();
    st.stock[id] -= 1;
    st.active = i;
    const seq = c.recipe.seq;
    const expected = seq[sta.layers.length];
    const p = cupCenter(i);

    if (id !== expected) {
      sta.layers = [...sta.layers, id];
      audio.pour(id);
      ruinStation(st, i, `Wrong step! Needed ${INGREDIENTS[expected].name}`, true);
      selectNextActive(st);
      rerender();
      return;
    }

    if (st.feverLeft > 0) {
      // FEVER instant brewing: the correct next step fills the whole drink, QTEs auto-PERFECT
      sta.layers = [...seq];
      sta.stageResults = c.recipe.steps.map(() => 'PERFECT');
      sta.phase = 'serve';
      audio.pour(id);
      audio.chime(true);
      burst(p.x, p.y, { emojis: ['⚡', '✨'], count: 8 });
      splash(p.x, p.y - 40, '#ffd23f', { count: 16, spread: 90 });
      ripple(p.x, p.y, '#ffd23f', 3);
    } else {
      sta.layers = [...sta.layers, id];
      audio.pour(id);
      splash(p.x, p.y - 40, LIQUID[id].particle, { count: 12, spread: 55 });
      ripple(p.x, p.y - 10, LIQUID[id].particle, 2.4);
      if (isComplete(sta.layers, seq)) {
        audio.chime(false);
        if (c.recipe.steps.length) {
          sta.phase = 'craft';
          sta.token++;
          if (st.craftingStation === null) st.craftingStation = i;
        } else {
          sta.phase = 'serve';
        }
      }
    }
    haptic(HAPTIC.drop);
    selectNextActive(st);
    rerender();
  };

  const dump = (i) => {
    const st = g.current;
    const sta = st.stations[i];
    if (sta.dumping || sta.layers.length === 0) return;
    if (st.craftingStation === i) st.craftingStation = null;
    sta.dumping = true;
    audio.whoosh();
    haptic(HAPTIC.tap);
    rerender();
    setTimeout(() => {
      const cur = g.current;
      if (cur !== st) return; // a new shift started meanwhile
      const token = cur.stations[i].token + 1;
      cur.stations[i] = { ...emptyStation(), token };
      selectNextActive(cur);
      rerender();
    }, 420);
  };

  const handleCraftDone = (i, token) => (results) => {
    const st = g.current;
    const sta = st.stations[i];
    if (token !== sta.token || sta.phase !== 'craft') return; // stale (customer left / order changed / fever)
    sta.stageResults = results;
    sta.phase = 'serve';
    st.craftingStation = null;
    rerender();
  };

  const handleStage = (i) => (result) => {
    const st = g.current;
    const p = cupCenter(i);
    if (result === 'PERFECT') {
      burst(p.x, p.y, { emojis: ['⭐', '✨'], count: 10 });
      if (st.feverLeft <= 0) st.fever = Math.min(100, st.fever + 4);
      const c = st.customers[i];
      if (c) c.patience = Math.min(c.patienceMax, c.patience + 1200);
    }
  };

  const serve = (i) => {
    const st = g.current;
    const sta = st.stations[i];
    const cust = st.customers[i];
    if (st.status !== 'playing' || st.paused || sta.phase !== 'serve' || sta.ruined || !cust) return;
    const { bonuses: b, save: sv } = latest.current;
    const quality = qualityFor(sta, cust, st.feverLeft > 0);
    const coins = payout({ customer: cust, quality, g: st, bonuses: b, feverMult: st.feverLeft > 0 ? FEVER_MULT : 1 });

    if (quality === 'PERFECT') {
      st.combo += 1;
      st.perfects += 1;
    } else st.combo = 0;
    st.maxCombo = Math.max(st.maxCombo, st.combo);
    st.score += coins * 10 + st.combo * 30 + cust.recipe.seq.length * 20;
    st.coins += coins;
    st.served += 1;
    addCoins(coins);

    const p = custCenter(i);
    cust.quality = quality;
    cust.outcome = 'happy';
    floatText(p.x, p.y - 20, `+${coins} Coins!`, 'gold', st.feverLeft > 0);
    setTimeout(() => floatText(p.x, p.y + 30, quality === 'PERFECT' ? 'PERFECT!' : quality === 'GOOD' ? 'Good!' : 'Meh…', quality === 'PERFECT' ? 'mint' : 'gold'), 140);
    ripple(p.x, p.y, quality === 'PERFECT' ? '#9fe3c6' : '#ffe27a', 3.5);
    burst(p.x, p.y, { emojis: quality === 'PERFECT' ? ['💖', '🪙', '✨', '💕'] : ['🪙', '👍'], count: quality === 'PERFECT' ? 16 : 8, spread: 120 });
    audio.register();
    audio.voice(cust.voice, 1.15);
    if (quality === 'PERFECT') audio.coin();
    haptic(quality === 'PERFECT' ? HAPTIC.perfect : HAPTIC.good);
    if (st.feverLeft > 0) latest.current.shake(5);
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
      const gain = quality === 'PERFECT' ? 12 + Math.min(st.combo, 5) * 2 : quality === 'GOOD' ? 4 : 0;
      st.fever = Math.min(100, st.fever + gain);
      if (st.fever >= 100) startFever();
    }

    st.customers[i] = null;
    st.stations[i] = { ...emptyStation(), token: sta.token + 1 };
    st.arriveIn[i] = arrivalDelay(st, i);
    selectNextActive(st);
    rerender();
  };

  const tapCup = (i) => {
    const st = g.current;
    if (st.status !== 'playing' || st.paused) return;
    const sta = st.stations[i];
    if (sta.ruined) return dump(i);
    if (sta.phase === 'serve') return serve(i);
    if (sta.phase === 'craft') {
      if (st.craftingStation === null && st.customers[i]) {
        st.craftingStation = i;
        audio.tap();
        rerender();
      }
      return;
    }
    st.active = i;
    audio.tap();
    haptic(HAPTIC.tap);
    rerender();
  };

  const onServeDrop = (i) => (point) => {
    const r = custRefs[i].current?.getBoundingClientRect();
    const cupTop = cupRefs[i].current?.getBoundingClientRect().top ?? 0;
    if ((r && point.y <= r.bottom + 30) || point.y < cupTop - 50) serve(i);
  };

  const restock = () => {
    const st = g.current;
    if (st.status !== 'playing' || st.paused || st.restockLeft > 0) return;
    audio.unlock();
    const cap = latest.current.bonuses.stockCap;
    if (INGREDIENT_ORDER.every((k) => st.stock[k] >= cap)) {
      floatText(window.innerWidth / 2, window.innerHeight - 160, 'Trays are full!', 'sky');
      return;
    }
    st.restockLeft = latest.current.bonuses.restockMs;
    audio.whoosh();
    haptic(HAPTIC.drop);
    rerender();
  };

  const closeCraft = () => {
    const st = g.current;
    st.craftingStation = null;
    audio.tap();
    rerender();
  };

  // ───────── render ─────────
  const seats = s.seats;
  const wpItem = ITEMS.find((it) => it.id === save.equipped.wallpaper);
  const wallpaper = !wpItem || wpItem.id === 'wp_cream' ? 'wp-cozy' : wpItem.preview;
  const neon = ITEMS.find((it) => it.id === save.equipped.neon);
  const hat = save.equipped.hat;
  const glasses = save.equipped.glasses;
  const activeSta = s.stations[s.active];
  const activeCust = s.customers[s.active];
  const hint = showHints && activeCust && activeSta.phase === 'assemble' && !activeSta.ruined ? activeCust.recipe.seq[activeSta.layers.length] : null;
  const crafting = s.craftingStation;
  const craftCust = crafting !== null ? s.customers[crafting] : null;
  const cupSize = seats === 1 ? { w: 80, h: 90 } : seats === 2 ? { w: 72, h: 82 } : { w: 62, h: 72 };
  const seatStyle = (i) =>
    seats === 1 ? { right: 0, width: '62%' } : { left: `${(i * 100) / seats}%`, width: `${100 / seats}%` };

  const statusFor = (i) => {
    const sta = s.stations[i];
    const c = s.customers[i];
    const tight = seats === 3;
    if (sta.ruined) return { kind: 'ruined', text: tight ? 'Trash!' : 'Ruined! Trash it', tone: 'bg-berry-500 text-white' };
    if (!c) return sta.layers.length ? { kind: 'leftover', text: tight ? 'Trash' : 'Leftover…', tone: 'bg-black/25 text-cream/70' } : { kind: 'waiting', text: tight ? '…' : 'Waiting…', tone: 'bg-black/25 text-cream/70' };
    if (sta.phase === 'serve') return { kind: 'ready', text: tight ? 'Serve!' : 'Ready! Serve', tone: 'bg-mint-500 text-white' };
    if (sta.phase === 'craft') return { kind: 'craft', text: crafting === i ? (tight ? '…' : 'Crafting…') : tight ? 'Craft' : 'Tap to craft', tone: 'bg-sky-500 text-white' };
    return { kind: 'step', text: tight ? `${sta.layers.length + 1}/${c.recipe.seq.length}` : `Step ${sta.layers.length + 1}/${c.recipe.seq.length}`, tone: s.active === i ? 'bg-gold-400 text-roast-900' : 'bg-black/25 text-cream' };
  };

  const hintText = !playing
    ? ''
    : s.restockLeft > 0
      ? ''
      : inFever
        ? 'Instant brew! Drop the next correct step'
        : seats > 1
          ? 'Tap a cup to select it · drag ingredients to any cup'
          : 'Follow the order step by step · wrong step = ruined';

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
          {s.rushLeft > 0 ? (
            <motion.span
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              className="rounded-full bg-gradient-to-b from-berry-400 to-berry-600 px-2 py-0.5 font-display text-[11px] text-white shadow-[0_0_10px_#e8657a]"
            >
              RUSH {Math.ceil(s.rushLeft / 1000)}s
            </motion.span>
          ) : (
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold text-cream shadow-[inset_0_1px_2px_rgba(0,0,0,.4)]">
              {WEATHER[s.weather].icon} {WEATHER[s.weather].label}
            </span>
          )}
          <button type="button" onClick={togglePause} disabled={!playing} className="btn btn-cream h-8 w-8 !rounded-full text-xs" aria-label="Pause">
            ❚❚
          </button>
        </div>
      </div>
      <FeverGauge value={s.fever} feverLeft={s.feverLeft} combo={s.combo} />

      {/* Scene */}
      <div
        className={`relative mx-3 mt-2 flex-1 rounded-[30px] p-[5px] shadow-soft ${
          inFever ? 'fever-scene bg-gold-400' : s.rushLeft > 0 ? 'rush-scene bg-berry-500' : 'bg-gradient-to-b from-roast-500 to-roast-700'
        }`}
        style={{ minHeight: 0 }}
      >
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
                  <div key={q.uid} className={`relative h-[34px] overflow-hidden ${q.vip ? 'drop-shadow-[0_0_6px_gold]' : ''}`}>
                    <Character look={q.look} size={32} still />
                    {q.trait && <span className="absolute -right-0.5 top-0 text-[10px]">{TRAITS[q.trait].icon}</span>}
                  </div>
                ))}
              </div>
            )
          }
          characters={
            <>
              {seats === 1 && (
                <>
                  <div className="absolute bottom-[22px] left-0">
                    <BossCat hat={hat} glasses={glasses} fever={inFever} mood={bossMood} />
                  </div>
                  <div className="absolute bottom-[54px] left-[30%] origin-bottom scale-[0.7]">
                    <EspressoMachine fever={inFever} busy={crafting !== null || s.stations[0].phase === 'serve'} />
                  </div>
                </>
              )}
              {Array.from({ length: seats }, (_, i) => {
                const c = s.customers[i];
                const sta = s.stations[i];
                return (
                  <div key={i} data-seat={i} className="absolute bottom-[26px] top-2" style={seatStyle(i)}>
                    <AnimatePresence custom={c?.outcome || 'happy'}>
                      {c && (
                        <Customer
                          key={c.uid}
                          ref={custRefs[i]}
                          customer={c}
                          layers={sta.layers}
                          ruined={sta.ruined}
                          fever={inFever}
                          excited={sta.phase === 'serve' && !sta.ruined}
                          compact={seats > 1}
                          align={seats === 1 ? 'end' : 'center'}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </>
          }
          overlay={<AnimatePresence>{banner && <WeatherBanner key={banner.id} weather={banner.weather} />}</AnimatePresence>}
        />
      </div>

      {/* Workstation: one brewing station per seat */}
      <div className="panel-wood relative mx-3 mb-2 mt-2 pt-2">
        <div className="grid gap-1 px-2" style={{ gridTemplateColumns: `repeat(${seats}, minmax(0, 1fr))` }}>
          {Array.from({ length: seats }, (_, i) => {
            const sta = s.stations[i];
            const c = s.customers[i];
            const st = statusFor(i);
            const ready = playing && sta.phase === 'serve' && !sta.ruined && !!c;
            return (
              <div key={i} className="flex flex-col items-center">
                <div className="flex w-full items-end justify-center gap-1.5">
                  {seats === 1 && (
                    <motion.button type="button" whileTap={{ scale: 0.88 }} onClick={() => dump(i)} className="btn btn-berry mb-2 h-10 w-10" disabled={!playing || sta.layers.length === 0} aria-label="Trash cup 1">
                      <TrashIcon size={22} />
                    </motion.button>
                  )}
                  <div className="relative px-3 pb-1">
                    <Cup
                      ref={cupRefs[i]}
                      layers={sta.layers}
                      totalParts={c ? c.recipe.seq.length : Math.max(1, sta.layers.length)}
                      hover={hoverCup === i}
                      ready={ready}
                      fever={inFever}
                      ruined={sta.ruined}
                      dumping={sta.dumping}
                      selected={playing && seats > 1 && s.active === i && !sta.ruined}
                      shakeKey={cupShake[i]}
                      onTap={() => tapCup(i)}
                      onServeDrop={onServeDrop(i)}
                      w={cupSize.w}
                      h={cupSize.h}
                    />
                  </div>
                  {seats === 1 && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.88 }}
                      onClick={() => serve(i)}
                      disabled={!ready}
                      animate={ready ? { scale: [1, 1.12, 1], rotate: [0, -8, 8, 0] } : { scale: 1, rotate: 0 }}
                      transition={{ repeat: ready ? Infinity : 0, duration: 0.8 }}
                      className={`btn btn-mint mb-2 h-10 w-10 ${ready ? 'shadow-glow' : ''}`}
                      aria-label="Serve"
                    >
                      <BellIcon size={24} />
                    </motion.button>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-1">
                  {seats > 1 && (
                    <button type="button" onClick={() => dump(i)} disabled={!playing || sta.layers.length === 0} className="btn btn-berry h-6 w-6 !rounded-lg" aria-label={`Trash cup ${i + 1}`}>
                      <TrashIcon size={14} />
                    </button>
                  )}
                  <span data-station={i} data-status={st.kind} className={`label-chip !px-2 ${st.tone}`}>
                    {st.text}
                  </span>
                  {seats > 1 && (
                    <button type="button" onClick={() => serve(i)} disabled={!ready} className={`btn btn-mint h-6 w-6 !rounded-lg ${ready ? 'shadow-glow' : ''}`} aria-label={`Serve cup ${i + 1}`}>
                      <BellIcon size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="h-[18px] pt-0.5 text-center font-display text-[11.5px] tracking-wide text-gold-200 drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">{hintText}</div>
        <DragAndDropTray
          cupRefs={cupRefs.slice(0, seats)}
          onAdd={handleAdd}
          onHover={setHoverCup}
          disabled={!playing || s.paused}
          fever={inFever}
          hint={hint}
          stock={s.stock}
          cap={bonuses.stockCap}
          restockLeft={s.restockLeft}
          restockMs={bonuses.restockMs}
          onRestock={restock}
        />
        <AnimatePresence>
          {playing && crafting !== null && craftCust && s.stations[crafting].phase === 'craft' && (
            <QTECrafting
              key={`${crafting}-${s.stations[crafting].token}`}
              steps={craftCust.recipe.steps}
              upgrades={save.upgrades}
              paused={s.paused}
              label={seats > 1 ? `Cup ${crafting + 1} · ${craftCust.recipe.name}` : craftCust.recipe.name}
              onStage={handleStage(crafting)}
              onDone={handleCraftDone(crafting, s.stations[crafting].token)}
              onCancel={seats > 1 ? closeCraft : undefined}
            />
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
            className="card pointer-events-none absolute left-1/2 top-14 z-50 w-[90%] px-3 py-2 text-center font-display text-[14px] text-roast-800"
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
        <li>☕ Build drinks in <b>exact order</b>: base → <b>Steam/Ice</b> → toppings. One wrong step <b>ruins</b> the cup — trash it.</li>
        <li>📦 Trays run out! <b>Restock</b> locks the tray for ~2.5s, so do it in a lull.</li>
        <li>🍵 More stations open as you go. Juggle up to <b>3 orders</b> at once.</li>
        <li>⚡ <b>Impatient</b> customers rile their neighbours. ❓ <b>Indecisive</b> ones change their order!</li>
        <li>🔥 Chain PERFECTs for <b>Fever</b>: ×3 coins + instant brewing.</li>
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
      <div className="my-3 grid grid-cols-3 gap-2">
        <StatTile icon={<span>☕</span>} value={session.served} label="Served" />
        <StatTile icon={<span>⭐</span>} value={session.perfects} label="Perfect" />
        <StatTile icon={<span>🔥</span>} value={session.maxCombo} label="Max combo" />
        <StatTile icon={<span>🗑️</span>} value={session.ruinedCount} label="Ruined" />
        <StatTile icon={<span>🔔</span>} value={session.rushCount} label="Rush hours" />
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
