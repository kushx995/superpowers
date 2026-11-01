# Meow Barista: Purrfect Tycoon ☕😺

A mobile-first cat-café tycoon game built with React 18, Tailwind CSS 3, Framer Motion 11 and the Web Audio API. It uses no image or audio assets: the art is emoji and CSS, and every sound is synthesized at runtime.

## Run

```bash
npm install
npm run dev            # dev server, also on your LAN (--host) so you can test on a phone
npm run build          # PWA build -> dist/ (manifest + offline service worker)
npm run build:single   # one self-contained HTML file -> dist-single/index.html
```

## How to play
1. **Drag** ingredients (Espresso, Milk, Catnip, Ice) into the cup, or quick-tap them, until the cup matches the order bubble. A wrong ingredient spills the cup, breaks your combo and costs patience.
2. Complex drinks have **QTE stages**. ⚙️ **Grind**: tap fast before the timer runs out. ♨️ **Froth**: stop the needle in the green PERFECT zone.
3. **Swipe the cup up** to the customer (or tap 🛎️) before their patience bar empties. Each customer who walks out costs one ❤️.
4. Chains of PERFECT orders build the **Combo** and fill the **Fever gauge**. **FEVER MODE** lasts 10 s: ×3 coins, instant brewing (one correct drop fills the drink and the QTEs are skipped), a golden neon scene, faster synth music and screen shake.
5. The weather cycles through **Morning → Afternoon → Rainy Day (random event) → Night**. On a Rainy Day customers order hot drinks and come in faster, patience drops quicker, and **tips are doubled**. Night brings more VIPs.
6. **VIP customers** (pandas and other rare guests) have complex signature drinks and pay double. Serving one unlocks their lore card in the **VIP Album**.
7. Spend Caffeine Coins in the **Shop**: equipment upgrades, café decor (wallpapers, neon signs) and Boss-cat hats and glasses. Every owned decor or style item adds a permanent coin bonus.
8. **Meow Garden**: adopt rescue cats, feed and pet them, and collect passive **Purr Power** income. Purr Power keeps earning while you're offline (capped at 8 h) and also boosts café coins.

All progress is saved to `localStorage`.

## Architecture
```
src/
  App.jsx                    shell, tabs, screen shake, settings, welcome-back modal
  game/data.js               recipes, customers, VIPs, shop, cats, weather (pure data)
  game/store.jsx             persistent tycoon state + Purr Power / offline income
  audio/engine.js            procedural music sequencer + synthesized SFX
  hooks/haptics.js           navigator.vibrate wrapper
  components/
    CoffeeBar.jsx            the shift: game loop, customers, scoring, combo, Fever
    DragAndDropTray.jsx      draggable / tappable ingredients
    QTECrafting.jsx          Grind + Froth minigames
    Cup.jsx, Customer.jsx    drop target and customer with patience bar and order bubble
    WeatherSystem.jsx        time-of-day / weather window and cycle logic
    ShopModal.jsx            swipe-down bottom-sheet shop
    MeowGarden.jsx           cat hotel
    VIPAlbum.jsx             collectible cards with lore
    Particles.jsx            emoji bursts and floating text
```

Note: `navigator.vibrate` works on Android Chrome. iOS Safari does not support it, so haptics are silently skipped there.
