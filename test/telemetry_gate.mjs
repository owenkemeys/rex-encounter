// Unit test for telemetry gating (src/telemetry.js shouldAttachTelemetry).
import assert from 'node:assert/strict';
import { shouldAttachTelemetry } from '../src/telemetry.js';

const claudeHost = { claude: { use: () => null } };

assert.equal(shouldAttachTelemetry('', {}), false, 'public player without #debug or window.claude stays off');
assert.equal(shouldAttachTelemetry('#gate', {}), false, 'unrelated hash stays off');
assert.equal(shouldAttachTelemetry('#debug', {}), true, '#debug enables telemetry');
assert.equal(shouldAttachTelemetry('#debug&notel', {}), false, '#notel overrides #debug');
assert.equal(shouldAttachTelemetry('', claudeHost), true, 'Claude artifact host enables telemetry');
assert.equal(shouldAttachTelemetry('#notel', claudeHost), false, '#notel overrides Claude host');
assert.equal(shouldAttachTelemetry('', { claude: {} }), false, 'incomplete window.claude stays off');

console.log('telemetry_gate: ok');
