// P1 persistence: high-score / mute / tutorial-seen stored in localStorage.
// All access is quota-guarded: storage may throw (private mode, quota,
// disabled cookies). Callers never need their own try/catch.
const STORAGE_KEY = 'wt-arcade-save-v1';

export const DEFAULT_SAVE = {
  highScore: 0,
  muted: false,
  seenTutorial: false
};

function sanitize(raw) {
  const out = { ...DEFAULT_SAVE };
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.highScore === 'number' && Number.isFinite(raw.highScore)) {
    out.highScore = Math.max(0, Math.floor(raw.highScore));
  }
  if (typeof raw.muted === 'boolean') out.muted = raw.muted;
  if (typeof raw.seenTutorial === 'boolean') out.seenTutorial = raw.seenTutorial;
  return out;
}

function storageAvailable() {
  return typeof localStorage !== 'undefined' && localStorage !== null;
}

export function load() {
  try {
    if (!storageAvailable()) return { ...DEFAULT_SAVE };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    return sanitize(JSON.parse(raw));
  } catch {
    // Corrupt JSON, denied access, etc. -> fall back to defaults.
    return { ...DEFAULT_SAVE };
  }
}

export function save(state) {
  try {
    if (!storageAvailable()) return false;
    const clean = sanitize(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (err) {
    // QuotaExceededError, SecurityError (private mode), etc.
    // Game must keep running without persistence.
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[persistence] save failed (quota/blocked):', err && err.name ? err.name : err);
      }
    } catch {
      // ignore logging failure
    }
    return false;
  }
}

// Merge a partial patch over the stored save and persist it.
// Returns the merged save object.
export function update(patch) {
  const current = load();
  const merged = sanitize({ ...current, ...(patch || {}) });
  save(merged);
  return merged;
}
