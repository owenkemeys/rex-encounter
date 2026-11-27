import assert from 'node:assert/strict';
import {
  BACKEND_KEY,
  QUALITY_AUTO_KEY,
  rememberWebGLFallback,
  stepDownAfterContextLoss,
  formatBootError,
} from '../src/gpu_recovery.js';

function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
  };
}

// 1. WebGPU device loss persists WebGL2 preference and steps auto quality down to medium
{
  const s = makeStorage();
  rememberWebGLFallback(s, 'AMD Radeon RX 6800', 'device-lost');
  assert.deepEqual(s.dump(BACKEND_KEY), { gpu: 'AMD Radeon RX 6800', use: 'webgl', why: 'device-lost' });
  assert.deepEqual(s.dump(QUALITY_AUTO_KEY), { gpu: 'AMD Radeon RX 6800', level: 'medium', why: 'device-lost' });
}

// 2. Does not overwrite an already-low quality memory for the same GPU
{
  const s = makeStorage({ [QUALITY_AUTO_KEY]: JSON.stringify({ gpu: 'AMD Radeon', level: 'low' }) });
  rememberWebGLFallback(s, 'AMD Radeon', 'draw-error');
  assert.equal(s.dump(QUALITY_AUTO_KEY).level, 'low');
}

// 3. WebGL context loss steps down from high -> medium, leaves medium/low alone
{
  const s = makeStorage();
  assert.equal(stepDownAfterContextLoss(s, 'AMD Radeon', 'high'), 'medium');
  assert.equal(s.dump(QUALITY_AUTO_KEY).level, 'medium');
  assert.equal(stepDownAfterContextLoss(s, 'AMD Radeon', 'medium'), null);
}

// 4. Boot error message mentions quitting and reopening the browser after a driver reset
{
  const msg = formatBootError(new Error('WebGL2 unavailable'));
  assert.match(msg, /WebGL2 unavailable/);
  assert.match(msg, /fully quit and reopen your browser/i);
}

console.log('gpu_recovery: ok');
