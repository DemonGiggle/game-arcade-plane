// ISSUE-8 (P1 perf/a11y): shared perf flags + delta clamp helper.
// Keeps per-scene edits tiny; overlaps #2 (delta clamp) intentionally
// reuses this single helper so #2 can adopt it without conflicts.
export const MAX_DELTA_MS = 50;

// True when the OS requests reduced motion. Evaluated once (no per-frame cost).
export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;

// Clamp tab-return / hitch spikes so physics steps stay stable.
export function clampDeltaMs(delta) {
  if (!Number.isFinite(delta) || delta < 0) return 0;
  return delta > MAX_DELTA_MS ? MAX_DELTA_MS : delta;
}
