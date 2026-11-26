// Debug one forced besiege: node test/sdbg.mjs <kind> <seed> <secs> [every]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Nav } from '../src/rex/body/nav.js';
import { novel } from './novel.mjs';
const kind = process.argv[2], seed = +(process.argv[3] || 3), secs = +(process.argv[4] || 60), every = +(process.argv[5] || 0.25);
const T = makeTerrain(7), S = novel[kind] ? novel[kind](T) : T.structures.find((s) => s.kind === kind);
const NV = new Nav(T); let ax = 0, az = 0;
found: for (const d of [32, 26, 20, 38]) for (const O1 of S.openings) { const nl = Math.hypot(O1.nx, O1.nz), x = O1.x + O1.nx / nl * d, z = O1.z + O1.nz / nl * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt && T.depthAt(x, z) > 0) && [0, 1, 2, 3, 4, 5, 6, 7].every((k) => Math.abs(T.height(x + Math.sin(k) * 6, z + Math.cos(k) * 6) - T.height(x, z)) < 1.5)) { ax = x; az = z; break found; } }
const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(S.cx - ax, S.cz - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
sim.dbg = {}; A.herd.list.length = 0; mind.ov.force = 'besiege'; mind.ov.omniscient = true;
const up = S.kind === 'tower';
const me = { id: 'you', x: S.hide ? S.hide.x : S.cx, z: S.hide ? S.hide.z : S.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: S.kind === 'culvert' || !!S.crouch, fx: 0, fz: 1 };
const depthIn = (x, y, z) => { const dx = x - S.cx, dz = z - S.cz, lx = dx * Math.cos(S.yaw) - dz * Math.sin(S.yaw), lz = dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw); return Math.min(S.hw - Math.abs(lx), S.hd - Math.abs(lz)) - (S.roof && y > S.roof.y ? 9 : 0); };
let lastSpots = null;
for (let i = 0; i < secs * 120; i++) {
  const t = i / 120; me.y = (up ? S.base + S.h : T.height(me.x, me.z)) + (me.crouch ? 0.9 : 1.7);
  A.step(1 / 120, { agents: [me], noises: Math.abs(t - 3) < 0.004 || Math.abs(t - 50) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [], light: 0.9, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
  { const h = sim.head; for (let k = 0; k <= 4; k++) { const u = k / 4 * 1.75, x = h.pos.x + h.f.x * u, y = h.pos.y + h.f.y * u - 0.15, z = h.pos.z + h.f.z * u, r = 0.4 - 0.2 * k / 4; for (const o of T.near(x, z, r + 1)) { if (o.kind !== 'wall' && !o.novel) continue; const pen = o.r + r * 0.8 - Math.hypot(x - o.x, z - o.z); if (pen > 0.1 && y - r * 0.5 < o.top && (o.bot === undefined || y + r * 0.5 > o.bot)) { if (process.env.PEN) console.log(`${t.toFixed(3)} PEN k${k} ${pen.toFixed(2)} y${y.toFixed(2)} bot${o.bot?.toFixed(2)} top${o.top.toFixed(2)} r${o.r} room${sim.headRoom(0).toFixed(3)} pin${sim.headPinned?1:0} wd${mind.beh && mind.beh.wd ? 1 : 0} ${mind.beh && mind.beh.phase}`); } } } }
  for (const j of [0, 1, 2]) { const p = sim.spine[j].p, r = 0.15 + 0.6 * j / 12; for (const o of T.near(p.x, p.z, r + 1)) { if (o.kind !== 'wall') continue; const pen = o.r + r * 0.8 - Math.hypot(p.x - o.x, p.z - o.z); if (pen > 0.1 && p.y - r * 0.5 < o.top && process.env.PEN) console.log(`${t.toFixed(3)} TAIL j${j} pen${pen.toFixed(2)} y${p.y.toFixed(2)} top${o.top.toFixed(2)} om${sim.om.toFixed(2)} v${sim.v.toFixed(2)} sat${sim.tailSat.toFixed(2)} lat${sim.tailLat} B${Array.from(sim.tailBend).map((v) => v.toFixed(2)).join(',')}`); } }
  const b = mind.beh; if (!b || b.name !== 'besiege') continue;
  if (b.spots && b.spots !== lastSpots) { lastSpots = b.spots; console.log(`${t.toFixed(2)} PLAN ${b.spots.length} spots: ` + b.spots.slice(0, 8).map((s) => `${s.kind}${s.eye || ''}@(${s.E.x.toFixed(1)},${s.E.y.toFixed(1)},${s.E.z.toFixed(1)}) low${s.low.toFixed(2)} back${s.back.toFixed(1)} sc${s.score.toFixed(1)} in${depthIn(s.E.x, s.E.y, s.E.z).toFixed(2)}`).join(' | ')); }
  if (i % Math.round(every * 120)) continue;
  const sp = b.spots && b.spots[b.si], h = sim.head, tip = [h.pos.x + h.f.x * 1.75, h.pos.y + h.f.y * 1.75, h.pos.z + h.f.z * 1.75];
  let s = `${t.toFixed(2)} ${b.phase}/${b.sub || ''} si${b.si} wd${b.wd ? 1 : 0} v${sim.v.toFixed(2)} stage${sim.senseStage} on${(sim.senseOn || 0).toFixed(2)} tipIn${depthIn(...tip).toFixed(2)} blk${(sim.headBlocked || 0).toFixed(2)} prs${sim.headPress.toFixed(2)} jam${(sim.headJam || 0).toFixed(2)} det${sim.headDetour.toFixed(2)} low${sim.lowness.toFixed(2)}`;
  if (sp) {
    const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw), ex = sp.B.x - sim.x, ez = sp.B.z - sim.z;
    const es = sp.eye, sx = es ? h.pos.x + h.f.x * 0.42 + h.l.x * es * 0.55 + h.u.x * 0.4 : tip[0], sy = es ? h.pos.y + h.f.y * 0.42 + h.l.y * es * 0.55 + h.u.y * 0.4 : tip[1], sz = es ? h.pos.z + h.f.z * 0.42 + h.l.z * es * 0.55 + h.u.z * 0.4 : tip[2];
    s += ` | ${sp.kind}${sp.eye || ''} ef${(ex * fx + ez * fz).toFixed(2)} el${(ex * fz - ez * fx).toFixed(2)} ey${(((sp.yaw - sim.psi + 9 * Math.PI) % (2 * Math.PI)) - Math.PI).toFixed(2)} off${Math.hypot(sx - sp.E.x, sy - sp.E.y, sz - sp.E.z).toFixed(2)} dH${Math.hypot(h.pos.x - sp.H.x, h.pos.y - sp.H.y, h.pos.z - sp.H.z).toFixed(2)} fit${(b.fitT || 0).toFixed(1)}`;
    const nb = sim.nb, D = sim.dbg; s += ` LH${(Math.hypot(sp.H.x - nb.x, sp.H.y - nb.y, sp.H.z - nb.z) / sim.species.dims.neckLen).toFixed(2)} Lh${(Math.hypot(h.pos.x - nb.x, h.pos.y - nb.y, h.pos.z - nb.z) / sim.species.dims.neckLen).toFixed(2)} dHy${(h.pos.y - sp.H.y).toFixed(2)} fr${D.fr !== undefined ? D.fr.toFixed(2) : '-'} T-H${D.T ? Math.hypot(D.T[0] - sp.H.x, D.T[1] - sp.H.y, D.T[2] - sp.H.z).toFixed(2) : '-'} G-H${D.G ? Math.hypot(D.G[0] - sp.H.x, D.G[1] - sp.H.y, D.G[2] - sp.H.z).toFixed(2) : '-'} t1-H${D.t1 ? Math.hypot(D.t1[0] - sp.H.x, D.t1[1] - sp.H.y, D.t1[2] - sp.H.z).toFixed(2) : '-'} pin${sim.headPinned ? 1 : 0} cone${(()=>{const c=sim.chest; const ax=[c.f.x*0.72+c.u.x*0.69,c.f.y*0.72+c.u.y*0.69,c.f.z*0.72+c.u.z*0.69]; const al=Math.hypot(...ax); const v=[h.pos.x-nb.x,h.pos.y-nb.y,h.pos.z-nb.z], vl=Math.hypot(...v); const vH=[sp.H.x-nb.x,sp.H.y-nb.y,sp.H.z-nb.z], vHl=Math.hypot(...vH); return Math.acos((ax[0]*v[0]+ax[1]*v[1]+ax[2]*v[2])/al/vl).toFixed(2)+'/H'+Math.acos((ax[0]*vH[0]+ax[1]*vH[1]+ax[2]*vH[2])/al/vHl).toFixed(2)+' axEl'+Math.asin(ax[1]/al).toFixed(2)+' nbY'+(nb.y-sim.groundY).toFixed(2)})()} fold${sim.neckFold.toFixed(2)} edge${D.edge ? D.edge.map((v) => v.toFixed(2)).join(',') : '-'} acc${D.acc ? D.acc.map((v) => v.toFixed(1)).join(',') : ''} ys${D.ys ? D.ys.map((v) => v.toFixed(3)).join(',') : ''} rel${(()=>{const c=sim.chest, fx=Math.sin(c.yaw), fz=Math.cos(c.yaw); const R=(P)=>{const dx=P[0]-nb.x, dy=P[1]-nb.y, dz=P[2]-nb.z; return '('+(dx*fx+dz*fz).toFixed(2)+','+(dx*fz-dz*fx).toFixed(2)+','+dy.toFixed(2)+')';}; return 'h'+R([h.pos.x,h.pos.y,h.pos.z])+'H'+R([sp.H.x,sp.H.y,sp.H.z])+(D.G?'G'+R(D.G):'')+' NL'+sim.species.dims.neckLen;})()} Gy-hy${D.G ? (D.G[1] - h.pos.y).toFixed(2) : ''}`;
  }
  console.log(s);
}
