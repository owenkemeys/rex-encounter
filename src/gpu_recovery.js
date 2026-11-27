// GPU driver reset & WebGPU->WebGL2 fallback helpers.
// Kept pure and DOM-free so Node tests can verify persistence and step-down rules.

export const BACKEND_KEY = 'dh.backend';
export const QUALITY_AUTO_KEY = 'dh.q.auto';

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

/** Remember WebGL2 for this GPU after a WebGPU device loss or draw failure, and step auto-quality down from high. */
export function rememberWebGLFallback(storage, gpu, why = 'device-lost') {
  const g = gpu || 'unknown';
  writeJson(storage, BACKEND_KEY, { gpu: g, use: 'webgl', why });
  const prevQ = readJson(storage, QUALITY_AUTO_KEY);
  if (!prevQ || prevQ.gpu !== g || prevQ.level === 'high') {
    writeJson(storage, QUALITY_AUTO_KEY, { gpu: g, level: 'medium', why });
  }
}

/** After a WebGL context loss (e.g. Windows AMD/NVIDIA driver TDR reset), persist a step-down from high to medium
 *  so the restored context does not immediately re-trigger a second driver timeout. Returns the target level or null. */
export function stepDownAfterContextLoss(storage, gpu, currentLevel) {
  const g = gpu || 'unknown';
  if (currentLevel === 'high') {
    writeJson(storage, QUALITY_AUTO_KEY, { gpu: g, level: 'medium', why: 'context-lost' });
    return 'medium';
  }
  return null;
}

/** Player-facing message when WebGPU/WebGL2 cannot start at boot. */
export function formatBootError(err) {
  const msg = err && err.message ? err.message : String(err);
  return (
    `This browser could not start the 3D renderer (${msg}). ` +
    'If your graphics driver just reset, fully quit and reopen your browser; otherwise try a current Chrome, Edge, Firefox or Safari.'
  );
}
