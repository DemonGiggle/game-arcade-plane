// src/analytics.js — P2 analytics + error-reporting stub.
//
// Privacy-first, disabled by default:
//   VITE_ANALYTICS=0 (default)  -> track() is a no-op, no network calls.
//   VITE_ANALYTICS=1            -> enabled, provider from VITE_ANALYTICS_PROVIDER.
//   VITE_ANALYTICS=plausible|posthog|console -> enabled with that provider.
//
// Pluggable providers:
//   - "plausible": calls window.plausible(event, { props }) when loaded.
//   - "posthog":   calls window.posthog.capture(event, payload) when loaded.
//   - "console":   console.debug only (local dev).
//   - custom:      setAnalyticsProvider({ track(event, payload) {} }).
//
// Events used by the game: start, level_clear, boss_kill, game_over, retry.
// No PII is ever sent — only small gameplay payloads (score/level/attempt).

function readEnv(key, fallback) {
  try {
    const env =
      typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env
        : {};
    const v = env[key];
    return v === undefined || v === null || v === '' ? fallback : String(v);
  } catch {
    return fallback;
  }
}

const ANALYTICS_FLAG = readEnv('VITE_ANALYTICS', '0');
const PROVIDER_NAME = readEnv('VITE_ANALYTICS_PROVIDER', 'plausible').toLowerCase();

function isEnabledFlag(v) {
  const s = String(v).trim().toLowerCase();
  // "0", "false", "off", "no", "" all mean disabled.
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
  return true;
}

function resolveProviderName() {
  const flag = String(ANALYTICS_FLAG).trim().toLowerCase();
  if (flag === 'plausible' || flag === 'posthog' || flag === 'console') return flag;
  return PROVIDER_NAME;
}

export function isAnalyticsEnabled() {
  return isEnabledFlag(ANALYTICS_FLAG);
}

function plausibleProvider(event, payload) {
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    window.plausible(event, { props: payload });
  }
}

function posthogProvider(event, payload) {
  if (typeof window !== 'undefined' && window.posthog && typeof window.posthog.capture === 'function') {
    window.posthog.capture(event, payload);
  }
}

function consoleProvider(event, payload) {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug('[analytics]', event, payload);
  }
}

const builtinProviders = {
  plausible: { name: 'plausible', track: plausibleProvider },
  posthog: { name: 'posthog', track: posthogProvider },
  console: { name: 'console', track: consoleProvider },
};

let customProvider = null;

export function setAnalyticsProvider(provider) {
  // Accept a provider name ("plausible" | "posthog" | "console") or a
  // custom object with a track(event, payload) function. Returns active provider.
  if (typeof provider === 'string') {
    const name = provider.toLowerCase();
    customProvider = builtinProviders[name] || null;
    return customProvider;
  }
  if (provider && typeof provider.track === 'function') {
    customProvider = provider;
    return customProvider;
  }
  customProvider = null;
  return null;
}

export function getAnalyticsProvider() {
  return customProvider || builtinProviders[resolveProviderName()] || null;
}

// No-op unless VITE_ANALYTICS enables it. Never throws — analytics must
// never break gameplay.
export function track(event, payload = {}) {
  if (!event || !isAnalyticsEnabled()) return;
  try {
    const provider = getAnalyticsProvider();
    if (provider && typeof provider.track === 'function') {
      provider.track(event, { ...(payload || {}) });
    }
  } catch {
    // ignore analytics errors
  }
}

// --- Sentry / error-reporting opt-in stub (P2) ---
//
// Disabled by default. To opt in, set:
//   VITE_SENTRY_DSN=https://...  (and optionally VITE_SENTRY=1)
// then provide @sentry/browser (dynamic import, no hard dependency).
// Returns true when reporting was initialised, false otherwise.
export async function initErrorReporting() {
  try {
    const dsn = readEnv('VITE_SENTRY_DSN', '');
    if (!dsn) return false;
    if (typeof window === 'undefined') return false;
    // Optional peer, usually NOT installed: build the specifier dynamically so
    // Vite/Rollup leave this as a runtime-only import (a static bare
    // specifier would fail the dev transform / production build).
    const spec = '@sentry/' + 'browser';
    const mod = await import(/* @vite-ignore */ spec).catch(() => null);
    if (!mod || typeof mod.init !== 'function') return false;
    mod.init({ dsn });
    return true;
  } catch {
    return false;
  }
}

// Alias kept for readability at call sites.
export const initSentry = initErrorReporting;
