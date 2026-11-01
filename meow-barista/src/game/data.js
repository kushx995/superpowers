// Static game content: ingredients, recipes, customers, VIPs, shop, cats, weather.

export const INGREDIENTS = {
  espresso: { id: 'espresso', name: 'Espresso', role: 'base', color: '#5b3216' },
  milk: { id: 'milk', name: 'Milk', role: 'base', color: '#fdf3e1' },
  steam: { id: 'steam', name: 'Steam', role: 'temp', color: '#ffb3a0' },
  ice: { id: 'ice', name: 'Ice', role: 'temp', color: '#bfefff' },
  catnip: { id: 'catnip', name: 'Catnip', role: 'topping', color: '#6fcf5b' },
};
export const INGREDIENT_ORDER = ['espresso', 'milk', 'steam', 'ice', 'catnip'];

// Every drink is a STRICT sequence: base liquid -> temperature (steam = hot, ice = cold) -> extras/toppings.
// One wrong step ruins the cup. `steps` are crafting QTEs done after the sequence is complete.
const r = (id, name, seq, steps, price) => ({ id, name, seq, steps, price, hot: seq.includes('steam') });
export const RECIPES = {
  espresso: r('espresso', 'Purrspresso', ['espresso', 'steam'], [], 7),
  saucer: r('saucer', 'Warm Milk Saucer', ['milk', 'steam'], [], 6),
  icedShot: r('icedShot', 'Iced Shot', ['espresso', 'ice'], [], 7),
  latte: r('latte', 'Fluffy Latte', ['espresso', 'steam', 'milk'], ['froth'], 12),
  icedLatte: r('icedLatte', 'Iced Whisker Latte', ['espresso', 'ice', 'milk'], [], 11),
  nipLatte: r('nipLatte', 'Catnip Latte', ['milk', 'steam', 'catnip'], [], 11),
  doppio: r('doppio', 'Double Paw Doppio', ['espresso', 'espresso', 'steam'], ['grind'], 12),
  cappuccino: r('cappuccino', 'Catpuccino', ['espresso', 'steam', 'milk', 'milk'], ['grind', 'froth'], 17),
  frappe: r('frappe', 'Nip Frappé', ['espresso', 'ice', 'milk', 'catnip'], [], 16),
  nipFrost: r('nipFrost', 'Nip Frost', ['milk', 'ice', 'catnip', 'catnip'], [], 15),
  nipMocha: r('nipMocha', 'Midnight Nip Brew', ['espresso', 'espresso', 'steam', 'milk', 'catnip'], ['grind', 'froth'], 22),
};

// Unlocked progressively by drinks served in the current shift.
export const RECIPE_TIERS = [
  { minServed: 0, ids: ['espresso', 'saucer', 'icedShot'] },
  { minServed: 3, ids: ['latte', 'icedLatte', 'nipLatte'] },
  { minServed: 7, ids: ['doppio', 'frappe', 'nipFrost'] },
  { minServed: 12, ids: ['cappuccino'] },
  { minServed: 18, ids: ['nipMocha'] },
];

// Base patience is deliberately tight; the game adds time per sequence step.
export const SPECIES = {
  cat: { id: 'cat', emoji: '🐱', names: ['Mittens', 'Socks', 'Clawdia', 'Purrcy', 'Nyanko'], patience: 12500, voice: 'meow' },
  dog: { id: 'dog', emoji: '🐶', names: ['Biscuit', 'Waffles', 'Sir Barksalot', 'Pudding'], patience: 15000, voice: 'woof' },
  fox: { id: 'fox', emoji: '🦊', names: ['Ember', 'Rusty', 'Vixy', 'Sly Sam'], patience: 10000, voice: 'yip' },
  bunny: { id: 'bunny', emoji: '🐰', names: ['Clover', 'Hopscotch', 'Mochi'], patience: 11500, voice: 'squeak' },
  bear: { id: 'bear', emoji: '🐻', names: ['Bruno', 'Honey', 'Big Ted'], patience: 17000, voice: 'woof' },
};

// Troublemakers. drain = patience drain multiplier; aura = extra drain inflicted on neighbours.
export const TRAITS = {
  impatient: { id: 'impatient', label: 'Impatient', icon: '⚡', drain: 1.6, aura: 0.45, desc: 'Drains fast and riles up neighbours.' },
  indecisive: { id: 'indecisive', label: 'Indecisive', icon: '❓', changeAt: 0.55, desc: 'Changes their order halfway through.' },
};

export const VIPS = [
  {
    id: 'bamboo',
    name: 'Duchess Bamboo',
    emoji: '🐼',
    title: 'Panda Aristocrat',
    recipe: { id: 'vip_bamboo', name: 'Bamboo Royale', seq: ['espresso', 'espresso', 'steam', 'milk', 'catnip'], steps: ['grind', 'froth'], price: 34, hot: true },
    lore: 'Heiress to the Misty Peak tea fortune, the Duchess secretly prefers coffee. She tips in gold leaf and rates every café on a 1000-point scale. Nobody has ever scored above 998.',
  },
  {
    id: 'dumpling',
    name: 'Chef Dumpling',
    emoji: '🐼',
    title: 'Panda Pastry Legend',
    recipe: { id: 'vip_dumpling', name: 'Dumpling Cloud Latte', seq: ['espresso', 'ice', 'milk', 'milk'], steps: ['froth'], price: 30, hot: false },
    lore: 'Ran a 3-star bakery for 40 years, then retired to taste-test every latte in the city. Carries a tiny notebook. If he nods once, your café is famous by morning.',
  },
  {
    id: 'ninja',
    name: 'Shadow Paw',
    emoji: '🐼',
    title: 'Panda Night Ninja',
    recipe: { id: 'vip_ninja', name: 'Silent Midnight', seq: ['espresso', 'espresso', 'espresso', 'steam', 'catnip'], steps: ['grind'], price: 36, hot: true },
    lore: 'Only visits after dark. Pays in exact change that appears on the counter while you blink. Rumour says Shadow Paw once protected the city’s last bean harvest from the Weasel Syndicate.',
  },
  {
    id: 'astro',
    name: 'Cosmo Whiskerton',
    emoji: '😼',
    title: 'Astronaut Cat',
    recipe: { id: 'vip_astro', name: 'Zero-G Frappé', seq: ['espresso', 'ice', 'ice', 'milk', 'catnip'], steps: ['grind'], price: 32, hot: false },
    lore: 'The first cat to nap on the Moon. Came back with a craving for “coffee that floats.” Insists ice cubes be dropped from exactly one paw-length up.',
  },
  {
    id: 'owl',
    name: 'Professor Hoot',
    emoji: '🦉',
    title: 'Nocturnal Scholar',
    recipe: { id: 'vip_owl', name: 'Thesis Fuel', seq: ['espresso', 'espresso', 'steam', 'milk', 'milk'], steps: ['grind', 'froth'], price: 34, hot: true },
    lore: 'Has been writing the same dissertation on “The Physics of Purring” for 87 years. Drinks exactly one cup per chapter. Currently on chapter 2,914.',
  },
  {
    id: 'unicorn',
    name: 'Sparkle Hooves',
    emoji: '🦄',
    title: 'Mythical Influencer',
    recipe: { id: 'vip_unicorn', name: 'Rainbow Nip Swirl', seq: ['milk', 'ice', 'milk', 'catnip', 'catnip'], steps: ['froth'], price: 38, hot: false },
    lore: '12 million followers. Every drink photographed from 40 angles before the first sip. A single post can double your foot traffic. Allergic to beige.',
  },
];

export const UPGRADES = {
  grinder: { id: 'grinder', name: 'Turbo Grinder', emoji: '⚙️', desc: 'Fewer taps to grind beans.', costs: [60, 180, 450], max: 3 },
  frother: { id: 'frother', name: 'Auto-Frother', emoji: '🌀', desc: 'Wider PERFECT zone, slower needle.', costs: [80, 220, 520], max: 3 },
  pastries: { id: 'pastries', name: 'Free Pastries', emoji: '🥐', desc: '+12% customer patience per level.', costs: [70, 200, 480], max: 3 },
  tipjar: { id: 'tipjar', name: 'Golden Tip Jar', emoji: '🫙', desc: '+20% tips per level.', costs: [100, 260, 600], max: 3 },
  hearts: { id: 'hearts', name: 'Comfy Cushions', emoji: '🛋️', desc: '+1 starting life per level.', costs: [250, 700], max: 2 },
  pantry: { id: 'pantry', name: 'Bigger Pantry Trays', emoji: '🧺', desc: '+2 portions in every ingredient tray.', costs: [90, 260, 560], max: 3 },
  quickpaws: { id: 'quickpaws', name: 'Quick Paws', emoji: '🐾', desc: 'Restocking takes 0.5s less per level.', costs: [120, 320], max: 2 },
};

// kind: wallpaper | neon | hat | glasses. bonus = permanent coin multiplier while owned.
export const ITEMS = [
  { id: 'wp_cream', kind: 'wallpaper', name: 'Cream Latte', cost: 0, bonus: 0, preview: 'wp-cozy' },
  { id: 'wp_stripes', kind: 'wallpaper', name: 'Mint Stripes', cost: 90, bonus: 0.03, preview: 'wp-stripes' },
  { id: 'wp_paws', kind: 'wallpaper', name: 'Paw Prints', cost: 160, bonus: 0.04, preview: 'wp-paws' },
  { id: 'wp_galaxy', kind: 'wallpaper', name: 'Galaxy Night', cost: 380, bonus: 0.06, preview: 'wp-galaxy' },
  { id: 'neon_meow', kind: 'neon', name: '“MEOW” Neon', cost: 120, bonus: 0.04, text: 'MEOW', color: '#ff4fd8' },
  { id: 'neon_fish', kind: 'neon', name: 'Fish Neon', cost: 220, bonus: 0.05, text: '><(((°>', color: '#3ff4ff' },
  { id: 'neon_heart', kind: 'neon', name: '“COFFEE ♥ CATS”', cost: 420, bonus: 0.07, text: 'COFFEE ♥ CATS', color: '#ffd23f' },
  { id: 'hat_cap', kind: 'hat', name: 'Barista Cap', cost: 60, bonus: 0.02, emoji: '🧢' },
  { id: 'hat_bow', kind: 'hat', name: 'Big Bow', cost: 90, bonus: 0.02, emoji: '🎀' },
  { id: 'hat_top', kind: 'hat', name: 'Top Hat', cost: 180, bonus: 0.03, emoji: '🎩' },
  { id: 'hat_crown', kind: 'hat', name: 'Royal Crown', cost: 650, bonus: 0.06, emoji: '👑' },
  { id: 'gl_round', kind: 'glasses', name: 'Nerd Specs', cost: 70, bonus: 0.02, emoji: '👓' },
  { id: 'gl_shades', kind: 'glasses', name: 'Cool Shades', cost: 150, bonus: 0.03, emoji: '🕶️' },
  { id: 'gl_goggles', kind: 'glasses', name: 'Steam Goggles', cost: 260, bonus: 0.04, emoji: '🥽' },
];

// rate = coins per minute while fed.
export const RESCUE_CATS = [
  { id: 'mochi', name: 'Mochi', emoji: '🐈', rate: 1, cost: 50, bio: 'Found napping in a flour sack. Smells faintly of bread.' },
  { id: 'biscuit', name: 'Biscuit', emoji: '🐈‍⬛', rate: 2, cost: 150, bio: 'Small, black, and convinced she is a panther.' },
  { id: 'luna', name: 'Luna', emoji: '😺', rate: 3, cost: 400, bio: 'Purrs so loudly the windows hum.' },
  { id: 'tofu', name: 'Tofu', emoji: '😸', rate: 5, cost: 900, bio: 'Eats exactly one bean a day “for focus.”' },
  { id: 'pixel', name: 'Pixel', emoji: '😻', rate: 8, cost: 2000, bio: 'Chases laser pointers at 60 frames per second.' },
  { id: 'admiral', name: 'Admiral Whiskers', emoji: '🦁', rate: 12, cost: 5000, bio: 'Retired ship’s cat. Still salutes the espresso machine.' },
];

export const HUNGER_HOURS = 8; // hours from fed to empty
export const OFFLINE_CAP_HOURS = 8;

export const WEATHER = {
  morning: {
    id: 'morning', label: 'Morning', icon: '🌅', duration: 40000,
    sky: 'from-[#ffd59e] via-[#ffb8a1] to-[#ffe9c7]', patience: 1, tips: 1, hotBias: 0.6, vipBoost: 0,
    blurb: 'Fresh beans, sleepy customers.',
  },
  afternoon: {
    id: 'afternoon', label: 'Afternoon', icon: '☀️', duration: 40000,
    sky: 'from-[#7fd3ff] via-[#a7e3ff] to-[#e2f7ff]', patience: 1, tips: 1.1, hotBias: 0.35, vipBoost: 0,
    blurb: 'Sunny! Iced drinks are popular.',
  },
  rainy: {
    id: 'rainy', label: 'Rainy Day', icon: '🌧️', duration: 32000,
    sky: 'from-[#5d6b80] via-[#7d8aa0] to-[#a3aec0]', patience: 0.72, tips: 2, hotBias: 0.92, vipBoost: 0.05,
    blurb: 'Hot comfort drinks! Less patience, DOUBLE tips.',
  },
  night: {
    id: 'night', label: 'Night', icon: '🌙', duration: 40000,
    sky: 'from-[#0f1035] via-[#2a1b5c] to-[#4a2a6e]', patience: 1.05, tips: 1.25, hotBias: 0.55, vipBoost: 0.12,
    blurb: 'Night owls & mysterious VIPs.',
  },
};
export const WEATHER_CYCLE = ['morning', 'afternoon', 'rainy', 'night'];

export const FEVER_DURATION = 10000;
export const FEVER_MULT = 3;
export const BASE_LIVES = 3;

// Strategic pressure
export const BASE_STOCK = 5; // portions per tray
export const RESTOCK_MS = 2600; // whole tray is locked while the barista fetches supplies
export const SEAT_UNLOCKS = [0, 4, 12]; // drinks served before 2nd / 3rd station opens
export const RUSH = { firstAt: 30000, every: 50000, duration: 15000, patience: 0.85, tips: 1.5 };
