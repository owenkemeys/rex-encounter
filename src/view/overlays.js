// Debug overlays: foot contacts and planned landings, support line, gaze, skeleton, and a
// scrolling gait diagram.
import * as THREE from 'three/webgpu';
import { PV, LEG, SPINE_N, IDX } from '../rex/body/rex.js';

const C = { planted: 0x4fd18b, swing: 0xf2a33a, gaze: 0x8fd3ff, goal: 0xf05a3c };

export class Overlays {
  constructor(scene, terrain) {
    this.terrain = terrain;
    this.gait = new THREE.Group(); this.skel = new THREE.Group(); this.always = new THREE.Group();
    scene.add(this.gait, this.skel, this.always);
    const flat = (color, o = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthTest: false, fog: false });
    const ring = (r0, r1) => new THREE.RingGeometry(r0, r1, 28).rotateX(-Math.PI / 2);
    this.foot = [0, 1].map(() => { const m = new THREE.Mesh(ring(0.42, 0.52), flat(C.planted)); m.renderOrder = 5; this.gait.add(m); return m; });
    this.land = [0, 1].map(() => { const m = new THREE.Mesh(ring(0.2, 0.26), flat(C.swing)); m.renderOrder = 5; this.gait.add(m); return m; });
    const lineMat = (color) => new THREE.LineBasicMaterial({ color, depthTest: false, fog: false, transparent: true });
    const line = (n, color, parent) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); const l = new THREE.LineSegments(g, lineMat(color)); l.frustumCulled = false; l.renderOrder = 6; parent.add(l); return l; };
    this.support = line(8, 0xffffff, this.gait);
    this.gaze = line(2, C.gaze, this.gait);
    this.fix = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flat(C.gaze)); this.fix.renderOrder = 6; this.gait.add(this.fix);
    this.bones = line((SPINE_N - 1) * 2 + 16, 0xffffff, this.skel);
    // goal and stimulus markers are debug too: they show only with the gait or senses overlay on
    this.goal = new THREE.Mesh(ring(0.5, 0.62), new THREE.MeshBasicMaterial({ color: C.goal, transparent: true, opacity: 0.9, depthWrite: false })); this.always.add(this.goal);
    this.goalPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5).translate(0, 0.6, 0), new THREE.MeshBasicMaterial({ color: C.goal })); this.always.add(this.goalPost);
    this.stim = new THREE.Mesh(ring(0.9, 1.0), new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.8, depthWrite: false, fog: false })); this.always.add(this.stim);
    // what it senses and believes
    this.senses = new THREE.Group(); scene.add(this.senses);
    this.parts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.8, depthTest: false, fog: false }), 200);
    this.parts.frustumCulled = false; this.parts.renderOrder = 7; this.senses.add(this.parts);
    this.cone = line(64, 0x8fd3ff, this.senses);
    this.belief = new THREE.Mesh(ring(1.6, 1.8), flat(0xff7a4a, 0.9)); this.belief.renderOrder = 7; this.senses.add(this.belief);
    this.senses.visible = false; this._m = new THREE.Matrix4();
    this.gait.visible = false; this.skel.visible = false; this.goal.visible = this.goalPost.visible = this.stim.visible = false;
    this.hist = []; this.t = 0;
  }

  update(sim, pose, intentGoal, stim, stimT) {
    const T = this.terrain, v = pose.v;
    const dbg = this.gait.visible || this.senses.visible;
    const g = dbg && intentGoal && intentGoal.kind === 'reach' ? intentGoal : null;
    this.goal.visible = this.goalPost.visible = !!g;
    if (g) { const y = T.height(g.x, g.z) + 0.06; this.goal.position.set(g.x, y, g.z); this.goalPost.position.set(g.x, y, g.z); }
    this.stim.visible = dbg && !!stim && stimT < 3;
    if (this.stim.visible) { const s = 0.4 + (stimT % 1) * 3; this.stim.position.set(stim.x, stim.y + 0.1, stim.z); this.stim.scale.set(s, 1, s); this.stim.material.opacity = 0.8 * (1 - (stimT % 1)); }

    if (this.gait.visible) {
      const sp = this.support.geometry.attributes.position; let n = 0;
      const put = (x, y, z) => { sp.setXYZ(n++, x, y, z); };
      sim.feet.forEach((f, i) => {
        const m = this.foot[i]; m.position.set(f.pos.x, (f.planted ? f.pos.y : T.height(f.pos.x, f.pos.z)) + 0.05, f.pos.z);
        m.material.color.setHex(f.planted ? C.planted : C.swing); m.material.opacity = f.planted ? 0.35 + 0.6 * f.load : 0.5;
        const l = this.land[i]; l.visible = !f.planted;
        if (!f.planted) { l.position.set(f.target.x, f.target.y + 0.05, f.target.z); put(f.pos.x, f.pos.y, f.pos.z); put(f.target.x, f.target.y + 0.05, f.target.z); }
      });
      const [L, R] = sim.feet;
      if (L.planted && R.planted) { put(L.pos.x, L.pos.y + 0.05, L.pos.z); put(R.pos.x, R.pos.y + 0.05, R.pos.z); }
      // where the hips sit over the feet
      const gy = T.height(sim.hc.x, sim.hc.z) + 0.05;
      put(sim.hc.x - 0.3, gy, sim.hc.z); put(sim.hc.x + 0.3, gy, sim.hc.z); put(sim.hc.x, gy, sim.hc.z - 0.3); put(sim.hc.x, gy, sim.hc.z + 0.3);
      while (n < 8) put(0, -999, 0);
      sp.needsUpdate = true;
      const gz = this.gaze.geometry.attributes.position, h = sim.head.pos, hf = sim.head.f;
      gz.setXYZ(0, h.x + hf.x * 1.4, h.y + hf.y * 1.4, h.z + hf.z * 1.4); gz.setXYZ(1, sim.fix.x, sim.fix.y, sim.fix.z); gz.needsUpdate = true;
      this.fix.position.copy(sim.fix);
    }
    if (this.skel.visible) {
      const b = this.bones.geometry.attributes.position; let n = 0;
      const seg = (i, j) => { b.setXYZ(n++, v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); b.setXYZ(n++, v[j * 3], v[j * 3 + 1], v[j * 3 + 2]); };
      for (let i = 0; i < SPINE_N - 1; i++) seg(i, i + 1);
      for (let k = 0; k < 2; k++) { const o = PV.LEG + k * LEG.SIZE; seg(IDX.PELVIS, o); seg(o, o + 1); seg(o + 1, o + 2); seg(o + 2, o + 3); }
      b.needsUpdate = true;
    }
  }

  updateSenses(sim, mind) {
    if (!this.senses.visible) return;
    const T = this.terrain, m = this._m;
    mind.p.forEach((p, i) => { const sc = 0.4 + Math.min(3, p.w * 180); m.makeScale(sc, sc, sc).setPosition(p.x, T.height(p.x, p.z) + 0.3, p.z); this.parts.setMatrixAt(i, m); });
    this.parts.count = mind.p.length; this.parts.instanceMatrix.needsUpdate = true;
    this.belief.position.set(mind.sum.x, T.height(mind.sum.x, mind.sum.z) + 0.15, mind.sum.z);
    const s = 0.6 + 3 * (1 - mind.sum.cert); this.belief.scale.set(s, 1, s);
    // field of view: sharp ahead (0.5 rad), peripheral to 1.95 rad, drawn at the height of its eyes
    const h = sim.head, g = this.cone.geometry.attributes.position; let n = 0;
    const put = (x, y, z) => g.setXYZ(n++, x, y, z);
    for (const [ang, R] of [[0.5, 60], [1.1, 40], [1.95, 22]]) for (const sd of [1, -1]) {
      const a = h.yaw + sd * ang; put(h.pos.x, h.pos.y, h.pos.z); put(h.pos.x + Math.sin(a) * R, h.pos.y, h.pos.z + Math.cos(a) * R);
    }
    for (let k = 0; k < 20; k++) { const a0 = h.yaw - 0.5 + k / 20, a1 = h.yaw - 0.5 + (k + 1) / 20; put(h.pos.x + Math.sin(a0) * 60, h.pos.y, h.pos.z + Math.cos(a0) * 60); put(h.pos.x + Math.sin(a1) * 60, h.pos.y, h.pos.z + Math.cos(a1) * 60); }
    while (n < 64) put(0, -999, 0);
    g.needsUpdate = true;
  }

  /** Record stance state each tick for the gait diagram. */
  sample(sim, dt) {
    this.t += dt;
    this.hist.push({ t: this.t, l: sim.feet[0].planted, r: sim.feet[1].planted, v: Math.abs(sim.v) });
    while (this.hist.length && this.hist[0].t < this.t - 8.2) this.hist.shift();
  }

  drawGait(cv) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, span = 8;
    g.clearRect(0, 0, W, H);
    g.font = `${11 * (W / 300)}px ui-monospace, monospace`; g.textBaseline = 'middle';
    const x0 = 22 * (W / 300), row = H / 3;
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText('L', 4, row * 0.5); g.fillText('R', 4, row * 1.5); g.fillText('v', 4, row * 2.5);
    const X = (t) => x0 + (1 - (this.t - t) / span) * (W - x0);
    let pl = null, pr = null;
    for (const s of this.hist) {
      const x = X(s.t);
      if (s.l) { if (pl === null) pl = x; } else if (pl !== null) { g.fillStyle = '#4fd18b'; g.fillRect(pl, row * 0.22, x - pl, row * 0.56); pl = null; }
      if (s.r) { if (pr === null) pr = x; } else if (pr !== null) { g.fillStyle = '#4fd18b'; g.fillRect(pr, row * 1.22, x - pr, row * 0.56); pr = null; }
    }
    g.fillStyle = '#4fd18b';
    if (pl !== null) g.fillRect(pl, row * 0.22, W - pl, row * 0.56);
    if (pr !== null) g.fillRect(pr, row * 1.22, W - pr, row * 0.56);
    g.strokeStyle = '#f2a33a'; g.lineWidth = 1.5; g.beginPath();
    this.hist.forEach((s, i) => { const x = X(s.t), y = row * 2.9 - (s.v / 8.5) * row * 0.85; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
}
