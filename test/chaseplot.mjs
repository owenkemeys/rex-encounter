import { play } from './mind.mjs';
import fs from 'fs';
const tr = [];
play('chase swerve', (s, dt) => {
  if (s.t < 1e-6) { s.me.x = 0; s.me.z = 24; }
  if (s.t > 10 && s.t < 26) { const a = s.t < 16 ? 0.2 : 1.9; s.me.x += Math.sin(a) * dt * 5.8; s.me.z += Math.cos(a) * dt * 5.8; }
  s.face = s.t > 10 && s.t < 26 ? null : 'rex';
  if (Math.round(s.t * 120) % 12 === 0) tr.push([s.t, s.me.x, s.me.z, s.sim.x, s.sim.z, s.mind.label, s.sim.v]);
}, 32, { seed: 7, verbose: false });
fs.writeFileSync('out/chase.json', JSON.stringify(tr));
