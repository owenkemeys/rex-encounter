import { play } from './mind.mjs';
play('chase trace', (s, dt) => { if (s.t < 1) { s.me.x = 0; s.me.z = 22; } if (s.t > 12 && s.t < 30) { s.me.z += dt * 5.5; s.me.x += dt * 2; } s.face = s.t > 12 && s.t < 30 ? null : 'rex';
  if (s.t > 12 && s.t < 26 && Math.abs((s.t * 2) % 1) < 0.0083) console.log(s.t.toFixed(1), s.mind.label, 'v', s.sim.v.toFixed(1), 'vT', s.sim.vT.toFixed(1), 'reach', s.sim.reach ? s.sim.reach.phase + ' stop ' + s.sim.reach.stop : '-', 'd', Math.hypot(s.sim.x - s.me.x, s.sim.z - s.me.z).toFixed(1), 'stalk', s.sim.stalk.toFixed(2)); }, 30, { verbose: false });
