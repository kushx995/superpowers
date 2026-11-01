// Persistent tycoon state (coins, upgrades, items, cats, VIP album, settings)
// stored in localStorage, plus derived bonuses and passive "Purr Power" income.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { HUNGER_HOURS, ITEMS, OFFLINE_CAP_HOURS, RESCUE_CATS, UPGRADES } from './data';
import { setHapticsEnabled } from '../hooks/haptics';
import { audio } from '../audio/engine';

const KEY = 'meow-barista-save-v1';

const DEFAULT_SAVE = {
  coins: 40,
  highScore: 0,
  bestCombo: 0,
  totalServed: 0,
  upgrades: { grinder: 0, frother: 0, pastries: 0, tipjar: 0, hearts: 0 },
  owned: ['wp_cream'],
  equipped: { wallpaper: 'wp_cream', neon: null, hat: null, glasses: null },
  cats: [], // [{ id, fedAt, adoptedAt }]
  album: [], // VIP ids served
  gardenPending: 0,
  lastSeen: Date.now(),
  settings: { music: true, sfx: true, haptics: true },
  tutorialDone: false,
};

// In-memory fallback for sandboxed iframes / private mode where storage throws.
let memoryStore = null;
function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    if (memoryStore) return memoryStore;
  }
  return null;
}
function writeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    memoryStore = save;
  }
}

function hydrate(raw) {
  const base = structuredClone(DEFAULT_SAVE);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    upgrades: { ...base.upgrades, ...(raw.upgrades || {}) },
    equipped: { ...base.equipped, ...(raw.equipped || {}) },
    settings: { ...base.settings, ...(raw.settings || {}) },
    owned: Array.isArray(raw.owned) ? Array.from(new Set(['wp_cream', ...raw.owned])) : base.owned,
    cats: Array.isArray(raw.cats) ? raw.cats.filter((c) => RESCUE_CATS.some((r) => r.id === c.id)) : [],
    album: Array.isArray(raw.album) ? raw.album : [],
  };
}

export function catFullness(cat, now = Date.now()) {
  const hours = (now - cat.fedAt) / 3_600_000;
  return Math.max(0, Math.min(100, 100 - (hours / HUNGER_HOURS) * 100));
}

/** Coins/minute from adopted cats. Hungry cats (<25%) purr at 30%. */
export function purrPower(cats, now = Date.now()) {
  return cats.reduce((sum, c) => {
    const def = RESCUE_CATS.find((r) => r.id === c.id);
    if (!def) return sum;
    return sum + def.rate * (catFullness(c, now) >= 25 ? 1 : 0.3);
  }, 0);
}

/** Offline income integrates over hunger decay approximately using midpoint fullness. */
function offlineIncome(save, now) {
  const elapsedMs = Math.min(now - (save.lastSeen || now), OFFLINE_CAP_HOURS * 3_600_000);
  if (elapsedMs < 60_000 || save.cats.length === 0) return 0;
  const mid = now - elapsedMs / 2;
  return (purrPower(save.cats, mid) * elapsedMs) / 60_000;
}

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [save, setSave] = useState(() => hydrate(readSave()));
  const [welcomeBack, setWelcomeBack] = useState(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  // Offline earnings on boot
  useEffect(() => {
    const now = Date.now();
    const earned = offlineIncome(saveRef.current, now);
    if (earned >= 1) {
      const minutes = Math.round(Math.min(now - saveRef.current.lastSeen, OFFLINE_CAP_HOURS * 3_600_000) / 60_000);
      setWelcomeBack({ coins: Math.floor(earned), minutes });
      setSave((s) => ({ ...s, gardenPending: s.gardenPending + earned, lastSeen: now }));
    }
  }, []);

  // Online passive income tick (1s) + lastSeen heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      setSave((s) => {
        const pp = purrPower(s.cats);
        return { ...s, gardenPending: s.gardenPending + pp / 60, lastSeen: Date.now() };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Persist (throttled by React batching; writes are cheap)
  useEffect(() => {
    writeSave(save);
  }, [save]);

  useEffect(() => {
    const flush = () => writeSave({ ...saveRef.current, lastSeen: Date.now() });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // Push settings into side-effect modules
  useEffect(() => {
    setHapticsEnabled(save.settings.haptics);
    audio.setMusicEnabled(save.settings.music);
    audio.setSfxEnabled(save.settings.sfx);
  }, [save.settings]);

  const addCoins = useCallback((n) => setSave((s) => ({ ...s, coins: s.coins + Math.max(0, Math.round(n)) })), []);

  /** Atomically spend coins; returns true on success. Uses the ref so callers get a synchronous answer. */
  const spend = useCallback((cost, mutate) => {
    const s = saveRef.current;
    if (s.coins < cost) return false;
    const next = mutate({ ...s, coins: s.coins - cost });
    saveRef.current = next;
    setSave(next);
    return true;
  }, []);

  const buyUpgrade = useCallback(
    (id) => {
      const def = UPGRADES[id];
      const lvl = saveRef.current.upgrades[id] || 0;
      if (!def || lvl >= def.max) return false;
      return spend(def.costs[lvl], (s) => ({ ...s, upgrades: { ...s.upgrades, [id]: lvl + 1 } }));
    },
    [spend]
  );

  const buyItem = useCallback(
    (id) => {
      const item = ITEMS.find((i) => i.id === id);
      if (!item || saveRef.current.owned.includes(id)) return false;
      return spend(item.cost, (s) => ({
        ...s,
        owned: [...s.owned, id],
        equipped: { ...s.equipped, [item.kind]: id },
      }));
    },
    [spend]
  );

  const equip = useCallback((kind, id) => {
    setSave((s) => {
      if (id && !s.owned.includes(id)) return s;
      const current = s.equipped[kind];
      // tapping the equipped cosmetic/neon again removes it (wallpaper always set)
      const nextId = current === id && kind !== 'wallpaper' ? null : id;
      return { ...s, equipped: { ...s.equipped, [kind]: nextId } };
    });
  }, []);

  const adoptCat = useCallback(
    (id) => {
      const def = RESCUE_CATS.find((c) => c.id === id);
      if (!def || saveRef.current.cats.some((c) => c.id === id)) return false;
      const now = Date.now();
      return spend(def.cost, (s) => ({ ...s, cats: [...s.cats, { id, fedAt: now, adoptedAt: now }] }));
    },
    [spend]
  );

  const feedCost = (id) => {
    const def = RESCUE_CATS.find((c) => c.id === id);
    return def ? 8 + def.rate * 4 : 0;
  };

  const feedCat = useCallback(
    (id) => {
      const cat = saveRef.current.cats.find((c) => c.id === id);
      if (!cat || catFullness(cat) > 95) return false;
      return spend(feedCost(id), (s) => ({
        ...s,
        cats: s.cats.map((c) => (c.id === id ? { ...c, fedAt: Date.now() } : c)),
      }));
    },
    [spend]
  );

  const collectGarden = useCallback(() => {
    const amt = Math.floor(saveRef.current.gardenPending);
    if (amt < 1) return 0;
    setSave((s) => ({ ...s, coins: s.coins + amt, gardenPending: s.gardenPending - amt }));
    return amt;
  }, []);

  const unlockVip = useCallback((id) => {
    if (saveRef.current.album.includes(id)) return false;
    setSave((s) => (s.album.includes(id) ? s : { ...s, album: [...s.album, id] }));
    return true;
  }, []);

  const recordShift = useCallback(({ score, combo, served }) => {
    const isRecord = score > 0 && score > saveRef.current.highScore;
    setSave((s) => ({
      ...s,
      highScore: Math.max(s.highScore, score),
      bestCombo: Math.max(s.bestCombo, combo),
      totalServed: s.totalServed + served,
    }));
    return isRecord;
  }, []);

  const toggleSetting = useCallback((key) => {
    setSave((s) => ({ ...s, settings: { ...s.settings, [key]: !s.settings[key] } }));
  }, []);

  const finishTutorial = useCallback(() => setSave((s) => ({ ...s, tutorialDone: true })), []);

  const resetSave = useCallback(() => {
    const fresh = { ...structuredClone(DEFAULT_SAVE), lastSeen: Date.now() };
    saveRef.current = fresh;
    setSave(fresh);
  }, []);

  // Derived bonuses
  const bonuses = useMemo(() => {
    const itemBonus = save.owned.reduce((sum, id) => sum + (ITEMS.find((i) => i.id === id)?.bonus || 0), 0);
    const pp = purrPower(save.cats);
    const purrBonus = Math.min(0.75, pp * 0.01);
    return {
      itemBonus,
      purrPower: pp,
      purrBonus,
      coinMult: 1 + itemBonus + purrBonus,
      tipMult: 1 + save.upgrades.tipjar * 0.2,
      patienceMult: 1 + save.upgrades.pastries * 0.12,
      lives: 3 + save.upgrades.hearts,
    };
  }, [save.owned, save.cats, save.upgrades, save.gardenPending]); // gardenPending ticks each second -> keeps hunger fresh

  const value = {
    save,
    bonuses,
    welcomeBack,
    dismissWelcome: () => setWelcomeBack(null),
    addCoins,
    buyUpgrade,
    buyItem,
    equip,
    adoptCat,
    feedCat,
    feedCost,
    collectGarden,
    unlockVip,
    recordShift,
    toggleSetting,
    finishTutorial,
    resetSave,
  };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
