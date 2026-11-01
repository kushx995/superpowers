// Thin wrapper around navigator.vibrate with a user toggle and graceful no-op
// on unsupported platforms (iOS Safari ignores vibrate).
let enabled = true;

export function setHapticsEnabled(on) {
  enabled = on;
}

export const HAPTIC = {
  tap: 8,
  drop: 18,
  perfect: [20, 30, 40],
  good: 25,
  error: [60, 40, 60],
  fever: [40, 30, 40, 30, 120],
  lifeLost: [120, 60, 120],
  buy: [15, 20, 30],
};

export function haptic(pattern) {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
