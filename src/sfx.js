// Tiny WebAudio synth for laser / explosion / pickup bleeps.
// No audio files needed. Unlocks on first user gesture.
//
// Issue #5: volume control + pre-allocated noise buffer + gesture
// unlock + simple bass music loop stub, wired to issue #4 persistence.
import { load, update as persistUpdate } from './persistence.js';

export const BASE_GAIN = 0.35;
// Legacy localStorage keys (pre-#4). Muted now lives in persistence.js
// (wt-arcade-save-v1); VOLUME key kept for volume since save-v1 has no
// volume field. Exported for back-compat / tests.
export const MUTE_STORAGE_KEY = 'wt-arcade.muted';
export const VOLUME_STORAGE_KEY = 'wt-arcade.volume';

let ctx = null;
let master = null;
let muted = false;
let volume = 1;
let noiseBuf = null;
let unlockInstalled = false;
let musicTimer = null;
let musicStep = 0;

// Optional persistence adapter override (tests / future stores).
// When set, it takes precedence over persistence.js for muted.
// Adapter shape: { loadMuted?.(), saveMuted?.(bool), loadVolume?.(), saveVolume?.(number) }
// or generic { load?.(), save?.({ muted, volume }) }.
let persistenceAdapter = null;
const muteListeners = new Set();

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function readVolumeStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(VOLUME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeVolumeStorage(val) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(VOLUME_STORAGE_KEY, val);
  } catch {
    // Storage unavailable (private mode etc.) — non-fatal.
  }
}

// Restore persisted muted (issue #4 store) + volume at import time.
try {
  muted = load().muted === true;
} catch {
  muted = false;
}
try {
  const rawVol = readVolumeStorage();
  if (rawVol !== null) {
    const v = parseFloat(rawVol);
    if (Number.isFinite(v)) volume = clamp01(v);
  }
} catch {
  // Ignore corrupt volume storage.
}

function loadPersistedState() {
  if (persistenceAdapter) {
    try {
      if (typeof persistenceAdapter.load === 'function') {
        const s = persistenceAdapter.load();
        if (s && typeof s === 'object') {
          if (typeof s.muted === 'boolean') muted = s.muted;
          if (s.volume !== undefined) volume = clamp01(s.volume);
          return;
        }
      }
      if (typeof persistenceAdapter.loadMuted === 'function') {
        const m = persistenceAdapter.loadMuted();
        if (typeof m === 'boolean') muted = m;
      } else {
        try {
          muted = load().muted === true;
        } catch {
          // Keep current muted on persistence failure.
        }
      }
      if (typeof persistenceAdapter.loadVolume === 'function') {
        const v = persistenceAdapter.loadVolume();
        if (v !== null && v !== undefined) volume = clamp01(v);
      }
      return;
    } catch {
      // Fall through to default wiring.
    }
  }
  try {
    muted = load().muted === true;
  } catch {
    // Keep current muted on persistence failure.
  }
}

/**
 * Wire an external persistence layer (e.g. tests) so mute survives
 * reloads through a custom store. Default wiring uses src/persistence.js.
 */
export function setPersistenceAdapter(adapter) {
  persistenceAdapter = adapter || null;
  loadPersistedState();
  applyGain();
  notifyMuteListeners();
}

/** Subscribe to mute/volume changes (for HUD sync). */
export function onMuteChange(fn) {
  if (typeof fn !== 'function') return () => {};
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

function notifyMuteListeners() {
  for (const fn of muteListeners) {
    try {
      fn({ muted, volume });
    } catch {
      // Listener errors must not break audio.
    }
  }
}

function applyGain() {
  if (master) master.gain.value = muted ? 0 : BASE_GAIN * volume;
}

function persistMuted() {
  if (persistenceAdapter) {
    try {
      if (typeof persistenceAdapter.save === 'function') {
        persistenceAdapter.save({ muted, volume });
      }
      if (typeof persistenceAdapter.saveMuted === 'function') {
        persistenceAdapter.saveMuted(muted);
      }
      if (typeof persistenceAdapter.saveVolume === 'function') {
        persistenceAdapter.saveVolume(volume);
      }
      return;
    } catch {
      // Fall through to persistence.js.
    }
  }
  try {
    persistUpdate({ muted });
  } catch {
    // persistence already quota-guarded; never break audio toggle
  }
}

// Hardened context creation (boot fallback): never throws, tears down
// a half-initialised context so later unlocks can retry.
function ensureCtx() {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      return ctx;
    }
    if (typeof window === 'undefined') return null;
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
      master.gain.value = muted ? 0 : BASE_GAIN * volume;
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

/**
 * Install one-time global gesture unlock for autoplay policies.
 * Listens to pointerdown + touchend (iOS) + keydown.
 * Idempotent — safe to call from every scene.
 */
export function installAudioUnlock() {
  if (unlockInstalled) return;
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  unlockInstalled = true;
  const handler = () => {
    ensureCtx();
  };
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('keydown', handler);
}

// Auto-install when running in a browser so scenes get unlock
// even if they forget to call installAudioUnlock() explicitly.
if (typeof window !== 'undefined') {
  installAudioUnlock();
}

export function setMuted(value) {
  const next = typeof value === 'boolean' ? value : !!value;
  if (next === muted) return muted;
  muted = next;
  applyGain();
  persistMuted();
  notifyMuteListeners();
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

export function isMuted() {
  return muted;
}

/** Master volume 0..1 (multiplied by BASE_GAIN). Persisted in localStorage. */
export function setVolume(v) {
  const next = clamp01(v);
  volume = next;
  applyGain();
  writeVolumeStorage(String(volume));
  if (persistenceAdapter) {
    try {
      if (typeof persistenceAdapter.save === 'function') {
        persistenceAdapter.save({ muted, volume });
      }
      if (typeof persistenceAdapter.saveVolume === 'function') {
        persistenceAdapter.saveVolume(volume);
      }
    } catch {
      // Never break audio on persistence failure.
    }
  }
  notifyMuteListeners();
  return volume;
}

export function getVolume() {
  return volume;
}

/** Pre-allocated 1s white-noise buffer shared by all explosions (no per-shot alloc). */
function ensureNoiseBuffer(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 1);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
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
  const src = c.createBufferSource();
  src.buffer = ensureNoiseBuffer(c);
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  // Random offset into the shared buffer so repeated shots don't sound identical.
  let offset = 0;
  try {
    offset = Math.random() * Math.max(0, src.buffer.duration - dur - 0.02);
  } catch {
    offset = 0;
  }
  try {
    src.start(t0, offset, dur + 0.02);
  } catch {
    src.start(t0);
  }
  try {
    src.stop(t0 + dur + 0.02);
  } catch {
    // Already stopped — ignore.
  }
}

// --- Simple bass music loop stub (issue #5) ---
// 8-step minor groove, triangle bass. Stub: fixed tempo/pattern,
// no assets, respects master mute/volume automatically.
const BASS_PATTERN = [55, 55, 65.41, 82.41, 55, 55, 73.42, 82.41];
const BASS_STEP_DUR = 0.24;

export function startMusic() {
  if (musicTimer) return true;
  const c = ensureCtx();
  if (!c) return false;
  musicStep = 0;
  musicTimer = setInterval(() => {
    if (!muted) {
      const freq = BASS_PATTERN[musicStep % BASS_PATTERN.length];
      tone({ freq, dur: BASS_STEP_DUR * 0.95, type: 'triangle', vol: 0.35 });
    }
    musicStep += 1;
  }, BASS_STEP_DUR * 1000);
  // Let node --check / non-browser timers be GC-able when possible.
  if (musicTimer && typeof musicTimer.unref === 'function') {
    try {
      musicTimer.unref();
    } catch {
      // Browser timers have no unref — ignore.
    }
  }
  return true;
}

export function stopMusic() {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function isMusicPlaying() {
  return !!musicTimer;
}

export const Sfx = {
  unlock: unlockAudio,
  installUnlock: installAudioUnlock,
  toggleMute,
  setMuted,
  isMuted,
  setVolume,
  getVolume,
  onMuteChange,
  setPersistenceAdapter,
  startMusic,
  stopMusic,
  isMusicPlaying,
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
  bomb() {
    tone({ freq: 1200, end: 70, dur: 0.55, type: 'sawtooth', vol: 0.5 });
    noiseBurst({ dur: 0.6, vol: 0.8, cutoff: 2500 });
    tone({ freq: 65, end: 28, dur: 0.7, type: 'sine', vol: 0.5, delay: 0.05 });
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: 'square', vol: 0.3, delay: i * 0.14 })
    );
  }
};
