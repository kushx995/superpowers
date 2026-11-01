// Procedural Web Audio engine: a multi-track lo-fi/synth music sequencer that
// speeds up in Fever Mode, plus synthesized SFX. No audio files.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const PROGRESSIONS = {
  bright: [
    [60, 64, 67, 71], // Cmaj7
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 64], // Fmaj7
    [55, 59, 62, 65], // G7
  ],
  moody: [
    [57, 60, 64, 67], // Am7
    [53, 57, 60, 64], // Fmaj7
    [50, 53, 57, 60], // Dm7
    [52, 56, 59, 62], // E7
  ],
};

const MELODY_STEPS = { normal: [0, 3, 6, 10, 12, 14], fever: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] };

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicEnabled = true;
    this.sfxEnabled = true;
    this.playing = false;
    this.fever = false;
    this.mood = 'morning';
    this.tempo = 92;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.rainNode = null;
    this.melodySeed = 0;
  }

  /** Must be called from a user gesture (iOS requirement). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicEnabled ? 0.32 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxEnabled ? 0.85 : 0;
      this.sfxGain.connect(this.master);
      // 2s white noise buffer shared by drums & foley
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() {
    return !!this.ctx;
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.1);
  }

  setSfxEnabled(on) {
    this.sfxEnabled = on;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  // ───────────────────────── Music ─────────────────────────
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
    this.updateRain();
  }

  stopMusic() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this.updateRain();
  }

  setFever(on) {
    this.fever = on;
  }

  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.updateRain();
  }

  targetTempo() {
    if (this.fever) return 150;
    return this.mood === 'rainy' ? 80 : this.mood === 'night' ? 86 : 94;
  }

  schedule() {
    if (!this.ctx) return;
    // glide tempo toward target so Fever "accelerates" instead of jumping
    this.tempo += (this.targetTempo() - this.tempo) * 0.08;
    const sixteenth = 60 / this.tempo / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
      if (this.step === 0) this.melodySeed++;
    }
  }

  playStep(s, t, sixteenth) {
    const prog = this.mood === 'rainy' || this.mood === 'night' ? PROGRESSIONS.moody : PROGRESSIONS.bright;
    const bar = Math.floor(s / 16);
    const b = s % 16;
    const chord = prog[bar];
    const fever = this.fever;
    const shift = fever ? 2 : 0;
    const out = this.musicGain;

    // Drums
    if (fever ? b % 4 === 0 : b === 0 || b === 8 || b === 11) this.kick(t, out, fever ? 0.9 : 0.7);
    if (b === 4 || b === 12) this.snare(t, out, fever ? 0.45 : 0.22);
    if (fever || b % 2 === 0) this.hat(t + (b % 4 === 2 && !fever ? sixteenth * 0.12 : 0), out, fever ? 0.12 : 0.07);

    // Bass
    const root = chord[0] - 24 + shift;
    if (fever) {
      if (b % 2 === 0) this.tone(mtof(root + (b % 4 === 2 ? 12 : 0)), t, sixteenth * 1.6, 'sawtooth', 0.16, out, 600);
    } else if (b === 0 || b === 6 || b === 8 || b === 14) {
      this.tone(mtof(root), t, sixteenth * (b === 0 ? 5 : 2), 'triangle', 0.32, out, 400);
    }

    // Pad (whole-bar chord)
    if (b === 0) {
      const padType = fever ? 'sawtooth' : 'triangle';
      chord.forEach((n) => this.tone(mtof(n + shift), t, sixteenth * 15, padType, fever ? 0.035 : 0.05, out, fever ? 2200 : 900, 0.25));
    }

    // Melody: arpeggio with a seeded variation per loop
    const steps = fever ? MELODY_STEPS.fever : MELODY_STEPS.normal;
    if (steps.includes(b)) {
      const idx = (b * 3 + this.melodySeed + bar) % chord.length;
      const octave = fever ? 12 + ((b >> 2) % 2) * 12 : 12;
      const type = fever ? 'square' : 'sine';
      this.tone(mtof(chord[idx] + octave + shift), t, sixteenth * (fever ? 0.9 : 1.8), type, fever ? 0.05 : 0.09, out, fever ? 3200 : 2400);
    }
  }

  tone(freq, t, dur, type, gain, dest, cutoff = 4000, attack = 0.005) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.02));
    osc.connect(f).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  noiseBurst(t, dur, gain, dest, type = 'highpass', freq = 6000, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
    return { src, f, g };
  }

  kick(t, dest, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  snare(t, dest, gain) {
    this.noiseBurst(t, 0.16, gain, dest, 'bandpass', 1800, 0.8);
    this.tone(190, t, 0.08, 'triangle', gain * 0.6, dest, 2000);
  }

  hat(t, dest, gain) {
    this.noiseBurst(t, 0.04, gain, dest, 'highpass', 7500);
  }

  updateRain() {
    if (!this.ctx) return;
    const want = this.playing && this.mood === 'rainy';
    if (want && !this.rainNode) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.09, this.ctx.currentTime + 1.5);
      src.connect(f).connect(g).connect(this.musicGain);
      src.start();
      this.rainNode = { src, g };
    } else if (!want && this.rainNode) {
      const { src, g } = this.rainNode;
      const now = this.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 1);
      src.stop(now + 1.05);
      this.rainNode = null;
    }
  }

  // ───────────────────────── SFX ─────────────────────────
  sfx(fn) {
    if (!this.ctx || !this.sfxEnabled) return;
    try {
      fn(this.ctx.currentTime, this.sfxGain);
    } catch {
      /* never let audio break gameplay */
    }
  }

  tap() {
    this.sfx((t, o) => this.tone(880, t, 0.05, 'sine', 0.15, o));
  }

  pour(kind = 'espresso') {
    this.sfx((t, o) => {
      if (kind === 'ice') {
        [0, 0.07, 0.15].forEach((d, i) => this.tone(2200 + i * 380, t + d, 0.06, 'triangle', 0.18, o, 6000));
        this.noiseBurst(t, 0.12, 0.15, o, 'highpass', 4000);
        return;
      }
      const { f } = this.noiseBurst(t, 0.45, 0.32, o, 'bandpass', 500, 3);
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(kind === 'milk' ? 1800 : 1200, t + 0.4);
      for (let i = 0; i < 4; i++) {
        const st = t + 0.08 + i * 0.08 + Math.random() * 0.03;
        const osc = this.tone(500 + Math.random() * 300, st, 0.07, 'sine', 0.12, o);
        osc.frequency.exponentialRampToValueAtTime(1200 + Math.random() * 400, st + 0.06);
      }
    });
  }

  voice(kind = 'meow', pitch = 1) {
    this.sfx((t, o) => {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const formant = ctx.createBiquadFilter();
      const g = ctx.createGain();
      formant.type = 'bandpass';
      formant.Q.value = 2.5;
      osc.connect(formant).connect(g).connect(o);
      let dur;
      if (kind === 'woof') {
        dur = 0.18;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(140 * pitch, t + dur);
        formant.frequency.setValueAtTime(700, t);
      } else if (kind === 'yip') {
        dur = 0.15;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(1400 * pitch, t + 0.05);
        osc.frequency.exponentialRampToValueAtTime(700 * pitch, t + dur);
        formant.frequency.setValueAtTime(1800, t);
      } else if (kind === 'squeak') {
        dur = 0.12;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1500 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(2200 * pitch, t + dur);
        formant.frequency.setValueAtTime(2000, t);
      } else {
        // meow: "m" (low, closed) -> "e-ow" (open, glide down)
        dur = 0.5;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(480 * pitch, t);
        osc.frequency.linearRampToValueAtTime(760 * pitch, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(420 * pitch, t + dur);
        formant.frequency.setValueAtTime(700, t);
        formant.frequency.linearRampToValueAtTime(1700, t + 0.15);
        formant.frequency.linearRampToValueAtTime(900, t + dur);
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        lfo.frequency.value = 7;
        lfoG.gain.value = 12 * pitch;
        lfo.connect(lfoG).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + dur);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }

  coin() {
    this.sfx((t, o) => {
      this.tone(988, t, 0.08, 'square', 0.1, o, 5000);
      this.tone(1319, t + 0.07, 0.25, 'square', 0.1, o, 5000);
    });
  }

  register() {
    // cash-register "ka-CHING"
    this.sfx((t, o) => {
      this.noiseBurst(t, 0.05, 0.3, o, 'bandpass', 2500, 2);
      this.tone(330, t, 0.05, 'square', 0.12, o, 1500);
      [1318, 1760, 2637].forEach((f, i) => this.tone(f, t + 0.06, 0.7 - i * 0.15, 'sine', 0.16, o, 8000));
    });
  }

  chime(perfect = false) {
    this.sfx((t, o) => {
      const notes = perfect ? [72, 76, 79, 84, 88] : [72, 76, 79];
      notes.forEach((n, i) => this.tone(mtof(n), t + i * 0.06, 0.4, 'sine', 0.14, o, 8000));
      if (perfect) this.noiseBurst(t + 0.25, 0.3, 0.06, o, 'highpass', 9000);
    });
  }

  error() {
    this.sfx((t, o) => {
      this.tone(140, t, 0.28, 'square', 0.16, o, 900);
      this.tone(148, t, 0.28, 'square', 0.16, o, 900);
    });
  }

  grind() {
    this.sfx((t, o) => {
      this.noiseBurst(t, 0.06, 0.25, o, 'highpass', 2500);
      this.tone(70 + Math.random() * 30, t, 0.06, 'square', 0.12, o, 600);
    });
  }

  /** Starts a continuous steam/froth hiss; returns a stop function. */
  frothLoop() {
    if (!this.ctx || !this.sfxEnabled) return () => {};
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.15);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 5;
    lfoG.gain.value = 900;
    lfo.connect(lfoG).connect(f.frequency);
    src.connect(f).connect(g).connect(this.sfxGain);
    src.start();
    lfo.start();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.12);
      src.stop(now + 0.15);
      lfo.stop(now + 0.15);
    };
  }

  feverStart() {
    this.sfx((t, o) => {
      const osc = this.tone(200, t, 0.9, 'sawtooth', 0.14, o, 5000, 0.05);
      osc.frequency.exponentialRampToValueAtTime(1600, t + 0.8);
      const { f } = this.noiseBurst(t, 0.9, 0.12, o, 'bandpass', 500, 1.5);
      f.frequency.exponentialRampToValueAtTime(8000, t + 0.8);
      [60, 64, 67, 72].forEach((n) => this.tone(mtof(n + 12), t + 0.85, 0.6, 'square', 0.07, o, 4000));
    });
  }

  lifeLost() {
    this.sfx((t, o) => {
      const osc = this.tone(440, t, 0.5, 'triangle', 0.25, o);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.5);
    });
  }

  gameOver() {
    this.sfx((t, o) => {
      [67, 64, 60, 55].forEach((n, i) => this.tone(mtof(n), t + i * 0.22, 0.4, 'triangle', 0.2, o, 2000));
    });
  }

  unlock_fanfare() {
    this.sfx((t, o) => {
      [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.tone(mtof(n), t + i * 0.07, 0.5, 'square', 0.07, o, 3500));
      this.tone(mtof(48), t + 0.5, 0.8, 'triangle', 0.2, o);
    });
  }

  purr() {
    this.sfx((t, o) => {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 26;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 280;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.1);
      g.gain.setValueAtTime(0.45, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3.2;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5;
      lfo.connect(lfoG).connect(am.gain);
      osc.connect(f).connect(am).connect(g).connect(o);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 1);
      lfo.stop(t + 1);
    });
  }

  whoosh() {
    this.sfx((t, o) => {
      const { f } = this.noiseBurst(t, 0.3, 0.18, o, 'bandpass', 300, 1.2);
      f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    });
  }
}

export const audio = new AudioEngine();
