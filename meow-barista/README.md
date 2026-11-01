# Meow Barista: Purrfect Tycoon ☕😺

A mobile-first cat-café tycoon game built with React 18, Tailwind CSS 3, Framer Motion 11 and the Web Audio API. It uses no image or audio files: every character, prop and icon is hand-drawn inline SVG, and every sound is synthesized at runtime.

**Art direction:** a cozy, hand-crafted café. Roasted-coffee browns, soft cream, pastel mint, warm amber lamp light and gold for Fever Mode. Buttons and cards use a soft "clay" look, and the café scene is built in layers: wallpaper, window light rays, pendant lamps, hanging plants and a wooden counter. Every character shares one vector rig with blinking eyes, breathing and swaying, and reacts to what happens (wide-eyed when a drink is ready, heart eyes for a PERFECT serve, angry when kept waiting). Text and icons use Lilita One and Fredoka from Google Fonts, with rounded system fonts as a fallback when offline.

## Run

```bash
npm install
npm run dev            # dev server, also on your LAN (--host) so you can test on a phone
npm run build          # PWA build -> dist/ (manifest + offline service worker)
npm run build:single   # one self-contained HTML file -> dist-single/index.html
```

## How to play
Meow Barista is a multitasking game in the spirit of Overcooked: it tests timing, memory and juggling.

1. **Strict recipe sequences.** Every drink is an ordered build: **base** (Espresso / Milk) → **temperature** (🔥 **Steam** for hot, 🧊 **Ice** for cold) → **extras/toppings** (more milk, Catnip…). The order bubble numbers each step and highlights the next one. **One wrong step ruins the cup.** It turns to sludge and blocks the station until you **trash it**, which costs you the time, the ingredients, your combo, some Fever and some of the customer's patience.
2. **Limited stock.** Each tray holds a few portions (shown as pips) and every pour uses one, even a wrong one. **Restock** refills every tray but **locks the whole tray for ~2.5s** while the barista runs to the pantry. Serving still works during that time, so restock in a lull, not mid-rush.
3. **Multiple stations.** You start with 1 seat and 1 cup. A **2nd station opens after 4 drinks** and a **3rd after 12**. Each station brews for the customer above it: tap a cup to select it (taps pour into the selected cup), or drag an ingredient onto any cup. Serve by swiping a ready cup up, tapping it, or ringing its bell.
4. **Troublemakers.**
   - ⚡ **Impatient** customers drain patience 1.6× faster. Once they get annoyed, they **drain the neighbours' patience too**.
   - ❓ **Indecisive** customers **change their order** at about 55% patience. If the cup you built no longer fits the new order, it is ruined. They do get some patience back.
   - Both get more common as the shift goes on. The "Next" queue on the counter shows who is coming so you can plan ahead.
5. **Crafting QTEs.** Some drinks also need ⚙️ **Grind** (rapid taps) and/or ♨️ **Froth** (stop the needle in the green zone) after the sequence. With several stations you can tap **Later** to step away from a QTE and come back to it.
6. **Pressure.**
   - Patience is tight and shrinks as you serve more.
   - **Rush hour** (from about 30s in, then every 50s) floods every seat with complex orders and shorter patience, but pays ×1.5 tips.
   - A walkout costs a ❤️, your combo and 40% of your Fever.
7. **Combo & Fever.** Chains of PERFECT serves fill the Fever gauge. **FEVER MODE** lasts 10s and gives ×3 coins. In Fever, dropping the **correct next step** completes the whole drink and skips its QTEs.
8. **Weather** still cycles through Morning → Afternoon → Rainy Day (hot drinks, faster arrivals, less patience, ×2 tips) → Night (more VIPs).
9. **Tycoon side.** Coins buy upgrades in the **Shop**, including the new 🧺 **Bigger Pantry Trays** (more portions per tray) and 🐾 **Quick Paws** (faster restocks). They also buy decor and Boss style, and rescue cats in the **Meow Garden** for passive Purr Power. Serve **VIPs** to fill the **VIP Album**.

All progress is saved to `localStorage`.

## Architecture
```
src/
  App.jsx                    shell, tabs, screen shake, settings, welcome-back modal
  game/data.js               recipes, customers, VIPs, shop, cats, weather (pure data)
  game/store.jsx             persistent tycoon state + Purr Power / offline income
  game/engine.js             pure shift rules: sequences, stations, troublemakers, drain, payout
  audio/engine.js            procedural music sequencer + synthesized SFX
  hooks/haptics.js           navigator.vibrate wrapper
  components/
    CoffeeBar.jsx            the shift: multi-station loop, ruin/trash, restock, rush hour, Fever
    DragAndDropTray.jsx      limited-stock ingredient tray, multi-cup drop targets, Restock
    QTECrafting.jsx          Grind + Froth minigames
    Cup.jsx, Customer.jsx    glass mug with glowing liquid layers; reactive customer + order bubble
    CafeScene.jsx            layered café interior (lamps, plants, window light, counter, machine)
    Avatars.jsx              shared SVG character rig, expressions, hats & glasses
    Icons.jsx                SVG ingredient / coin / heart / tool icons
    WeatherSystem.jsx        time-of-day / weather window and cycle logic
    ShopModal.jsx            swipe-down bottom-sheet shop
    MeowGarden.jsx           cat hotel
    VIPAlbum.jsx             collectible cards with lore
    Particles.jsx            emoji bursts and floating text
```

Note: `navigator.vibrate` works on Android Chrome. iOS Safari does not support it, so haptics are silently skipped there.
