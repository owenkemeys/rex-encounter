import { RexSim, PV, LEG, IDX, SPINE_N, DIM } from '../../src/sim/rex.js';
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
const s = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 });
const v = s.pose.v, P = (i) => [v[i*3], v[i*3+1], v[i*3+2]].map((x) => +x.toFixed(2));
for (let i = 0; i < SPINE_N; i++) console.log('sp', i, P(i));
console.log('head', P(PV.HEAD_P), 'f', P(PV.HEAD_F), 'u', P(PV.HEAD_U));
for (let k = 0; k < 2; k++) for (let j = 0; j < 6; j++) console.log('leg', k, j, P(PV.LEG + k * 6 + j));
for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) console.log('arm', k, j, P(PV.ARM + k * 3 + j));
console.log('jaw', s.pose.s[0]);
