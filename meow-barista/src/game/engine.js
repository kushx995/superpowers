// Pure game rules for a shift: customers, sequences, stations, stock, rush hour
// and scoring. No React or side effects here, so the rules stay easy to reason about.
import { RECIPES, RECIPE_TIERS, RUSH, SEAT_UNLOCKS, SPECIES, TRAITS, VIPS, WEATHER } from './data';
import { VIP_LOOKS, lookForSpecies } from '../components/Avatars';

export const TIP_RATE = { PERFECT: 0.8, GOOD: 0.3, MISS: 0 };
const RANK = { PERFECT: 2, GOOD: 1, MISS: 0 };
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** True when every layer in the cup matches the recipe sequence so far. */
export function isPrefix(layers, seq) {
  if (layers.length > seq.length) return false;
  return layers.every((id, i) => seq[i] === id);
}

export const isComplete = (layers, seq) => layers.length === seq.length && isPrefix(layers, seq);

export function unlockedRecipes(served) {
  return RECIPE_TIERS.filter((t) => served >= t.minServed).flatMap((t) => t.ids.map((id) => RECIPES[id]));
}

/** Number of active brewing stations / counter seats for this point in the shift. */
export function seatsFor(served) {
  return SEAT_UNLOCKS.filter((n) => served >= n).length;
}

export function emptyStation() {
  return { layers: [], ruined: false, ruinReason: '', phase: 'assemble', stageResults: [], dumping: false, token: 0 };
}

export function freshSession(lives, stockCap) {
  return {
    status: 'ready',
    paused: false,
    lives,
    maxLives: lives,
    score: 0,
    coins: 0,
    served: 0,
    perfects: 0,
    ruinedCount: 0,
    combo: 0,
    maxCombo: 0,
    fever: 0,
    feverLeft: 0,
    weather: 'morning',
    weatherLeft: WEATHER.morning.duration,
    seats: 1,
    customers: [null, null, null],
    arriveIn: [700, 1500, 2300],
    stations: [emptyStation(), emptyStation(), emptyStation()],
    active: 0,
    craftingStation: null,
    queue: [],
    customerCount: 0,
    stock: { espresso: stockCap, milk: stockCap, steam: stockCap, ice: stockCap, catnip: stockCap },
    restockLeft: 0,
    elapsed: 0,
    rushLeft: 0,
    nextRushIn: RUSH.firstAt,
    rushCount: 0,
    vipsServed: [],
    newRecord: false,
    lastRecipeId: null,
  };
}

function difficulty(served) {
  return Math.max(0.5, 1 - served * 0.018);
}

function patienceFor(base, recipe, g, bonuses) {
  const w = WEATHER[g.weather];
  const juggling = 1 + 0.3 * (g.seats - 1); // more stations => a little more slack per order
  const rush = g.rushLeft > 0 ? RUSH.patience : 1;
  return (base + recipe.seq.length * 2200 + recipe.steps.length * 3000) * w.patience * bonuses.patienceMult * difficulty(g.served) * juggling * rush;
}

export function pickRecipe(g, exclude) {
  const w = WEATHER[g.weather];
  const pool = unlockedRecipes(g.served);
  // Rush hour favours the longer, more complex drinks.
  const weighted = g.rushLeft > 0 ? pool.filter((r) => r.seq.length >= 3) : pool;
  const base = weighted.length ? weighted : pool;
  const wantHot = Math.random() < w.hotBias;
  const temp = base.filter((r) => r.hot === wantHot);
  const options = (temp.length ? temp : base).filter((r) => r.id !== exclude);
  const list = options.length ? options : base;
  const fresh = list.filter((r) => r.id !== g.lastRecipeId);
  return pick(fresh.length && Math.random() < 0.8 ? fresh : list);
}

export function makeCustomer(g, bonuses, album) {
  const w = WEATHER[g.weather];
  const count = g.customerCount;
  const vipChance = count >= 5 ? 0.06 + w.vipBoost : 0;
  const forcedVip = count > 0 && count % 12 === 11;

  if (forcedVip || Math.random() < vipChance) {
    const unseen = VIPS.filter((v) => !album.includes(v.id));
    const vip = unseen.length && Math.random() < 0.75 ? pick(unseen) : pick(VIPS);
    const patienceMax = patienceFor(20000, vip.recipe, g, bonuses);
    return { uid: Math.random(), look: VIP_LOOKS[vip.id] || 'panda', name: vip.name, voice: 'meow', vip, trait: null, recipe: vip.recipe, patienceMax, patience: patienceMax, changed: false };
  }

  const species = pick(Object.values(SPECIES));
  const recipe = pickRecipe(g);
  g.lastRecipeId = recipe.id;

  // Troublemakers ramp up as the shift goes on.
  let trait = null;
  if (g.served >= 3) {
    const ramp = Math.min(1, g.served / 25);
    const roll = Math.random();
    if (roll < 0.14 + 0.12 * ramp) trait = 'impatient';
    else if (roll < 0.26 + 0.24 * ramp && recipe.seq.length >= 2) trait = 'indecisive';
  }
  const patienceMax = patienceFor(species.patience, recipe, g, bonuses);
  return {
    uid: Math.random(),
    look: lookForSpecies(species.id),
    name: pick(species.names),
    voice: species.voice,
    vip: null,
    trait,
    recipe,
    patienceMax,
    patience: patienceMax,
    changed: false,
  };
}

/** Per-tick patience drain multiplier for a customer at seat i (includes neighbour auras). */
export function drainFor(g, i) {
  const c = g.customers[i];
  if (!c) return 0;
  let m = 1;
  if (c.trait === 'impatient') m *= TRAITS.impatient.drain;
  const st = g.stations[i];
  if (g.craftingStation === i) m *= 0.6; // working on their drink calms them a little
  else if (st.phase === 'serve' && !st.ruined) m *= 0.7; // drink is ready, they can see it
  for (const j of [i - 1, i + 1]) {
    const n = g.customers[j];
    if (j >= 0 && j < g.seats && n && n.trait === 'impatient' && n.patience / n.patienceMax < 0.7) m += TRAITS.impatient.aura;
  }
  if (g.feverLeft > 0) m *= 0.3;
  return m;
}

export function qualityFor(station, customer, fever) {
  if (fever) return 'PERFECT';
  const ratio = customer.patience / customer.patienceMax;
  if (station.stageResults.length) return station.stageResults.reduce((a, r) => (RANK[r] < RANK[a] ? r : a), 'PERFECT');
  return ratio > 0.45 ? 'PERFECT' : 'GOOD';
}

export function payout({ customer, quality, g, bonuses, feverMult }) {
  const w = WEATHER[g.weather];
  const ratio = Math.max(0, customer.patience / customer.patienceMax);
  const price = customer.recipe.price;
  const rush = g.rushLeft > 0 ? RUSH.tips : 1;
  const tip = price * TIP_RATE[quality] * w.tips * bonuses.tipMult * rush * (0.5 + ratio);
  const vipMult = customer.vip ? 2 : 1;
  return Math.max(1, Math.round((price + tip) * feverMult * bonuses.coinMult * vipMult));
}
