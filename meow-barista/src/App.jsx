import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { GameProvider, useGame } from './game/store';
import { ParticleProvider } from './components/Particles';
import CoffeeBar from './components/CoffeeBar';
import MeowGarden from './components/MeowGarden';
import VIPAlbum from './components/VIPAlbum';
import ShopModal from './components/ShopModal';
import { audio } from './audio/engine';
import { haptic, HAPTIC } from './hooks/haptics';

const TABS = [
  { id: 'cafe', label: 'Café', icon: '☕' },
  { id: 'garden', label: 'Garden', icon: '🌷' },
  { id: 'album', label: 'Album', icon: '📖' },
  { id: 'shop', label: 'Shop', icon: '🛒' },
];

function CoinCounter({ coins }) {
  return (
    <motion.div
      key={coins}
      initial={{ scale: 1.25 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
      className="flex items-center gap-1 rounded-full border-2 border-amber-500 bg-gradient-to-b from-amber-200 to-amber-400 px-3 py-0.5 font-display text-base font-black text-mocha-900 shadow-chunky"
    >
      <span>🪙</span>
      <span className="tabular-nums">{coins.toLocaleString()}</span>
    </motion.div>
  );
}

function SettingsSheet({ open, onClose }) {
  const { save, toggleSetting, resetSave } = useGame();
  const [confirm, setConfirm] = useState(false);
  const rows = [
    { key: 'music', label: 'Music', icon: '🎵' },
    { key: 'sfx', label: 'Sound FX', icon: '🔊' },
    { key: 'haptics', label: 'Haptics', icon: '📳' },
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="w-full max-w-xs rounded-[28px] border-4 border-mocha-300 bg-cream p-5 text-mocha-900"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 font-display text-2xl font-black">⚙️ Settings</h2>
            {rows.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  audio.unlock();
                  toggleSetting(r.key);
                  audio.tap();
                  if (r.key === 'haptics' && !save.settings.haptics) setTimeout(() => haptic(HAPTIC.buy), 30);
                }}
                className="mb-2 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 font-black shadow"
              >
                <span>
                  {r.icon} {r.label}
                </span>
                <span className={`relative h-7 w-12 rounded-full transition-colors ${save.settings[r.key] ? 'bg-emerald-400' : 'bg-mocha-300'}`}>
                  <motion.span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow" animate={{ left: save.settings[r.key] ? 24 : 4 }} />
                </span>
              </button>
            ))}
            <div className="mt-3 text-xs font-semibold text-mocha-500">
              Lifetime drinks served: {save.totalServed} · VIPs: {save.album.length}
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm) {
                  resetSave();
                  setConfirm(false);
                  onClose();
                } else setConfirm(true);
              }}
              className="mt-3 w-full rounded-2xl bg-rose-100 py-2 text-sm font-black text-rose-700"
            >
              {confirm ? 'Tap again to erase ALL progress' : 'Reset save data'}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full rounded-2xl bg-mocha-900 py-2 font-black text-cream">
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WelcomeBack() {
  const { welcomeBack, dismissWelcome, collectGarden } = useGame();
  return (
    <AnimatePresence>
      {welcomeBack && (
        <motion.div className="fixed inset-0 z-[78] flex items-center justify-center bg-black/60 p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="w-full max-w-xs rounded-[28px] border-4 border-amber-400 bg-cream p-5 text-center text-mocha-900"
            initial={{ scale: 0.6, rotate: -6 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          >
            <div className="text-6xl">😻💤</div>
            <h2 className="font-display text-2xl font-black">Welcome back!</h2>
            <p className="my-2 text-sm font-semibold">
              Your cats purred for {welcomeBack.minutes >= 60 ? `${Math.floor(welcomeBack.minutes / 60)}h ${welcomeBack.minutes % 60}m` : `${welcomeBack.minutes}m`} while you were away.
            </p>
            <div className="mb-3 font-display text-4xl font-black text-amber-600">🪙 {welcomeBack.coins.toLocaleString()}</div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => {
                audio.unlock();
                collectGarden();
                audio.register();
                haptic(HAPTIC.perfect);
                dismissWelcome();
              }}
              className="w-full rounded-2xl border-b-[6px] border-amber-700 bg-gradient-to-b from-amber-300 to-amber-500 py-3 font-display text-xl font-black shadow-chunky"
            >
              Collect!
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Shell() {
  const { save, bonuses } = useGame();
  const [tab, setTab] = useState('cafe');
  const [shopOpen, setShopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const controls = useAnimationControls();

  const shake = useCallback(
    (intensity = 8) => {
      const i = intensity;
      controls.start({
        x: [0, -i, i, -i * 0.7, i * 0.7, -i * 0.3, 0],
        y: [0, i * 0.4, -i * 0.4, i * 0.2, 0, 0, 0],
        transition: { duration: 0.4, ease: 'easeOut' },
      });
    },
    [controls]
  );

  // Unlock audio on the very first touch anywhere (iOS needs a gesture).
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const go = (id) => {
    audio.unlock();
    audio.tap();
    haptic(HAPTIC.tap);
    if (id === 'shop') setShopOpen(true);
    else setTab(id);
  };

  const gardenAlert = Math.floor(save.gardenPending) > 0;

  return (
    <motion.div animate={controls} className="relative mx-auto flex h-full w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-mocha-700 via-mocha-900 to-[#1a0f08] pt-[env(safe-area-inset-top)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="font-display text-sm font-black leading-none text-cream">
          Meow Barista
          <div className="text-[10px] font-bold text-amber-300">×{bonuses.coinMult.toFixed(2)} coin boost</div>
        </div>
        <div className="flex items-center gap-2">
          <CoinCounter coins={save.coins} />
          <button type="button" onClick={() => setSettingsOpen(true)} className="grid h-8 w-8 place-items-center rounded-full bg-black/30 text-cream" aria-label="Settings">
            ⚙️
          </button>
        </div>
      </div>

      {/* Screens (café stays mounted so a shift survives tab switches) */}
      <div className="relative min-h-0 flex-1">
        <div className={`absolute inset-0 ${tab === 'cafe' ? '' : 'invisible pointer-events-none'}`}>
          <CoffeeBar active={tab === 'cafe' && !shopOpen && !settingsOpen} shake={shake} />
        </div>
        <AnimatePresence mode="wait">
          {tab !== 'cafe' && (
            <motion.div key={tab} className="absolute inset-0" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}>
              {tab === 'garden' ? <MeowGarden /> : <VIPAlbum />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom navigation (thumb zone) */}
      <nav className="grid grid-cols-4 gap-1 border-t-2 border-mocha-700 bg-[#1a0f08] px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5">
        {TABS.map((t) => {
          const activeTab = t.id === 'shop' ? shopOpen : tab === t.id && !shopOpen;
          return (
            <button key={t.id} type="button" onClick={() => go(t.id)} className="relative flex flex-col items-center rounded-2xl py-1">
              {activeTab && <motion.div layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-amber-400/20" transition={{ type: 'spring', stiffness: 500, damping: 35 }} />}
              <motion.span className="relative text-2xl" animate={activeTab ? { y: -2, scale: 1.15 } : { y: 0, scale: 1 }}>
                {t.icon}
              </motion.span>
              <span className={`relative text-[10px] font-black uppercase tracking-wide ${activeTab ? 'text-amber-300' : 'text-cream/60'}`}>{t.label}</span>
              {t.id === 'garden' && gardenAlert && <span className="absolute right-4 top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-rose-500" />}
            </button>
          );
        })}
      </nav>

      <ShopModal open={shopOpen} onClose={() => setShopOpen(false)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WelcomeBack />
    </motion.div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <ParticleProvider>
        <Shell />
      </ParticleProvider>
    </GameProvider>
  );
}
