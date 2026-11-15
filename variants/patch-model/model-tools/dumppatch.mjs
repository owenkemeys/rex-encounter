globalThis.location = { hash: '', pathname: '/index.html' };
const { RexSim, PV, SPINE_N, DIM } = await import('../../src/sim/rex.js');
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
const s = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 });
console.log('species', s.species.name, DIM.femur);
const v = s.pose.v, P = (i) => [v[i*3], v[i*3+1], v[i*3+2]].map((x) => +x.toFixed(2));
for (const i of [0, 6, 12, 13, 15, 18, 21, 25]) console.log('sp', i, P(i));
console.log('head', P(PV.HEAD_P), 'f', P(PV.HEAD_F));
for (let k = 0; k < 2; k++) console.log('leg', k, [0,1,2,3,4,5].map(j => P(PV.LEG + k * 6 + j)).join(' | '));
