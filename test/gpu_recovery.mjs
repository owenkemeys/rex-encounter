import assert from 'node:assert/strict';
import {
  BACKEND_KEY,
  QUALITY_AUTO_KEY,
  WEBGL_PIN_TTL_MS,
  nextLowerLevel,
  isBackendPinActive,
  recordGpuLoss,
  formatBootError,
  formatRepeatedLossMessage,
} from '../src/gpu_recovery.js';

function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    dump: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
  };
}

// 1. Quality step-down chain: high -> medium -> low -> low
assert.equal(nextLowerLevel('high'), 'medium');
assert.equal(nextLowerLevel('medium'), 'low');
assert.equal(nextLowerLevel('low'), 'low');

// 2. WebGPU loss pins WebGL2 with timestamp and steps high -> medium -> low across reloads, stopping auto-reload on the 3rd loss
{
  const local = makeStorage();
  const sess = makeStorage();
  const t0 = 1_700_000_000_000;

  const r1 = recordGpuLoss(local, sess, { gpu: 'AMD RX', backend: 'WebGPU', currentLevel: 'high', now: t0 });
  assert.equal(r1.shouldReload, true);
  assert.equal(r1.count, 1);
  assert.equal(local.dump(BACKEND_KEY).use, 'webgl');
  assert.equal(local.dump(BACKEND_KEY).at, t0);
  assert.equal(local.dump(QUALITY_AUTO_KEY).level, 'medium');

  const r2 = recordGpuLoss(local, sess, { gpu: 'AMD RX', backend: 'WebGL2', currentLevel: 'medium', now: t0 + 10_000 });
  assert.equal(r2.shouldReload, true);
  assert.equal(r2.count, 2);
  assert.equal(local.dump(QUALITY_AUTO_KEY).level, 'low');

  const r3 = recordGpuLoss(local, sess, { gpu: 'AMD RX', backend: 'WebGL2', currentLevel: 'low', now: t0 + 20_000 });
  assert.equal(r3.shouldReload, false);
  assert.equal(r3.count, 3);
}

// 3. Manual quality setting is respected (dh.q.auto not overwritten)
{
  const local = makeStorage();
  const sess = makeStorage();
  recordGpuLoss(local, sess, { gpu: 'AMD RX', backend: 'WebGL2', currentLevel: 'high', manual: 'high', now: 1000 });
  assert.equal(local.dump(QUALITY_AUTO_KEY), null);
}

// 4. Crash WebGL2 pins expire after 14 days so WebGPU can be retried after driver updates; trial pins without `why: 'device-lost'` stay active
{
  const t0 = 1_700_000_000_000;
  const crashPin = { gpu: 'AMD RX', use: 'webgl', why: 'device-lost', at: t0 };
  assert.equal(isBackendPinActive(crashPin, t0 + WEBGL_PIN_TTL_MS - 1000), true);
  assert.equal(isBackendPinActive(crashPin, t0 + WEBGL_PIN_TTL_MS + 1000), false);
  const trialPin = { gpu: 'Intel', use: 'webgl', webgpu: 20, webgl: 45 };
  assert.equal(isBackendPinActive(trialPin, t0 + WEBGL_PIN_TTL_MS * 10), true);
}

// 5. Player-facing messages advise quitting and reopening the browser
assert.match(formatBootError(new Error('WebGL2 unavailable')), /fully quit and reopen your browser/i);
assert.match(formatRepeatedLossMessage(), /automatic reload paused/i);

console.log('gpu_recovery: ok');
