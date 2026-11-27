// GPU driver-reset & WebGPU->WebGL2 fallback helpers.
// Kept pure and DOM-free so Node tests can verify persistence, step-down, expiry, and loop-guard rules.

export const BACKEND_KEY = 'dh.backend';
export const QUALITY_AUTO_KEY = 'dh.q.auto';
export const LOSS_SESSION_KEY = 'dh.gpuLoss';
export const WEBGL_PIN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // retry WebGPU after 14 days (e.g. post driver update)
export const MAX_AUTO_RELOADS = 2;
export const LOSS_WINDOW_MS = 5 * 60 * 1000;

function readJson(storage, key) {
  try {
    const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, val) {
  try {
    if (storage && typeof storage.setItem === 'function') storage.setItem(key, JSON.stringify(val));
  } catch {}
}

/** Step one quality level down per GPU loss: high -> medium -> low.
 *  Remembering 'low' lets detectQuality() choose the light build on reload. */
export function nextLowerLevel(currentLevel) {
  if (currentLevel === 'high') return 'medium';
  if (currentLevel === 'medium') return 'low';
  return 'low';
}

/** Check whether a saved dh.backend record is still active (crash pins expire after 14 days). */
export function isBackendPinActive(rec, now = Date.now()) {
  if (!rec || !rec.use) return false;
  if (rec.at && (rec.why === 'device-lost' || rec.why === 'draw-error')) {
    return now - rec.at < WEBGL_PIN_TTL_MS;
  }
  return true;
}

/** Persist a 14-day WebGL2 pin (after a WebGPU crash) and step dh.q.auto down one level.
 *  Note: unlike the slow-frame backend trial (which clears dh.q.auto so WebGL2 probes fresh),
 *  a hard GPU crash steps quality down deliberately so the next load avoids re-tripping TDR. */
export function recordGpuLoss(localStore, sessionStore, { gpu, backend, currentLevel, manual = null, why = 'device-lost', now = Date.now() }) {
  const g = gpu || 'unknown';
  if (backend === 'WebGPU') {
    writeJson(localStore, BACKEND_KEY, { gpu: g, use: 'webgl', why, at: now });
  }
  if (!manual) {
    const prevQ = readJson(localStore, QUALITY_AUTO_KEY);
    const base = (prevQ && prevQ.gpu === g && prevQ.level) || currentLevel || 'high';
    const nextLevel = nextLowerLevel(base);
    writeJson(localStore, QUALITY_AUTO_KEY, { gpu: g, level: nextLevel, why, at: now });
  }
  const prev = readJson(sessionStore, LOSS_SESSION_KEY);
  const recent = prev && prev.at && (now - prev.at) < LOSS_WINDOW_MS ? (prev.count || 0) : 0;
  const count = recent + 1;
  writeJson(sessionStore, LOSS_SESSION_KEY, { count, at: now, why });
  return { count, shouldReload: count <= MAX_AUTO_RELOADS };
}

/** Player-facing message when WebGPU/WebGL2 cannot start at boot. */
export function formatBootError(err) {
  const msg = err && err.message ? err.message : String(err);
  return (
    `This browser could not start the 3D renderer (${msg}). ` +
    'If your graphics driver just reset, fully quit and reopen your browser; otherwise try a current Chrome, Edge, Firefox or Safari.'
  );
}

/** Player-facing message when repeated GPU resets stop automatic reloads. */
export function formatRepeatedLossMessage() {
  return (
    'Your graphics driver reset repeatedly while drawing the 3D scene, so automatic reload paused to avoid a loop. ' +
    'Fully quit and reopen your browser (or click Reload below to try again on lower quality).'
  );
}
