// Tiny WebAudio synth for laser / explosion / pickup bleeps.
// No audio files needed. Unlocks on first user gesture.
import { load, update as persistUpdate } from './persistence.js';

let ctx = null;
let master = null;
let muted = false;
try {
  muted = load().muted === true;
} catch {
  muted = false;
}

function ensureCtx() {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    var next = null;
    try {
      next = new AC();
    } catch (e) {
      return null;
    }
    ctx = next;
    try {
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.35;
      master.connect(ctx.destination);
    } catch (e2) {
      try {
        if (ctx.close) ctx.close().catch(function () {});
      } catch (e3) {
        // Ignore cleanup errors.
      }
      ctx = null;
      master = null;
      return null;
    }
    return ctx;
  } catch (e4) {
    return null;
  }
}

export function unlockAudio() {
  ensureCtx();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  try {
    persistUpdate({ muted });
  } catch {
    // persistence already quota-guarded; never break audio toggle
  }
  return muted;
}

export function setMuted(value) {
  muted = value === true;
  if (master) master.gain.value = muted ? 0 : 0.35;
  try {
    persistUpdate({ muted });
  } catch {
    // ignore persistence failure
  }
  return muted;
}

export function isMuted() {
  return muted;
}

function tone({ freq = 440, end = null, dur = 0.12, type = 'square', vol = 0.5, delay = 0 }) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.3, vol = 0.6, delay = 0, cutoff = 1200 }) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
}

export const Sfx = {
  unlock: unlockAudio,
  toggleMute,
  setMuted,
  isMuted,
  laser() {
    tone({ freq: 880, end: 220, dur: 0.12, type: 'square', vol: 0.25 });
  },
  enemyShoot() {
    tone({ freq: 300, end: 140, dur: 0.15, type: 'sawtooth', vol: 0.15 });
  },
  explosion() {
    noiseBurst({ dur: 0.35, vol: 0.7, cutoff: 900 });
    tone({ freq: 160, end: 40, dur: 0.3, type: 'sawtooth', vol: 0.35 });
  },
  bigExplosion() {
    noiseBurst({ dur: 0.7, vol: 0.9, cutoff: 700 });
    tone({ freq: 120, end: 30, dur: 0.6, type: 'sawtooth', vol: 0.4 });
    noiseBurst({ dur: 0.4, vol: 0.5, delay: 0.25, cutoff: 500 });
  },
  hit() {
    tone({ freq: 200, end: 60, dur: 0.25, type: 'square', vol: 0.4 });
    noiseBurst({ dur: 0.2, vol: 0.4, cutoff: 1500 });
  },
  powerup() {
    tone({ freq: 520, dur: 0.09, type: 'square', vol: 0.3 });
    tone({ freq: 780, dur: 0.09, type: 'square', vol: 0.3, delay: 0.09 });
    tone({ freq: 1040, dur: 0.14, type: 'square', vol: 0.3, delay: 0.18 });
  },
  levelClear() {
    tone({ freq: 523, dur: 0.12, type: 'square', vol: 0.3 });
    tone({ freq: 659, dur: 0.12, type: 'square', vol: 0.3, delay: 0.12 });
    tone({ freq: 784, dur: 0.2, type: 'square', vol: 0.3, delay: 0.24 });
  },
  bossWarn() {
    tone({ freq: 110, dur: 0.3, type: 'sawtooth', vol: 0.4 });
    tone({ freq: 110, dur: 0.3, type: 'sawtooth', vol: 0.4, delay: 0.35 });
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: 'square', vol: 0.3, delay: i * 0.14 })
    );
  }
};
