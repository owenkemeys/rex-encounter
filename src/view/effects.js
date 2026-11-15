// What a footfall does to the world: dust, a print left in the ground, camera shake, a thump.
import * as THREE from 'three/webgpu';
import { makeRng } from '../math.js';
import { SNIFF_RHYTHM } from './audiohybrid.js';

function dustTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function printTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); g.translate(64, 78); g.fillStyle = 'rgba(0,0,0,0.85)'; g.filter = 'blur(2.5px)';
  for (const a of [-0.45, 0, 0.45]) { g.save(); g.rotate(a); g.beginPath(); g.ellipse(0, -30, 9, a === 0 ? 34 : 28, 0, 0, 7); g.fill(); g.restore(); }
  g.beginPath(); g.ellipse(0, 4, 15, 13, 0, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
}

export class Effects {
  constructor(scene, terrain) {
    this.terrain = terrain; this.rand = makeRng(99);
    const tex = dustTexture();
    this.dust = Array.from({ length: 56 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb7a887, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s);
      return { s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 };
    });
    this.di = 0;
    const N = 90;
    const pg = new THREE.PlaneGeometry(1.5, 1.5); pg.rotateX(-Math.PI / 2); pg.rotateY(Math.PI);
    this.prints = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: printTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), N);
    this.prints.count = 0; this.prints.frustumCulled = false; this.pi = 0; this.pn = N; scene.add(this.prints);
    // breath vapour: a short plume from the nostrils on each exhale, carried off downwind
    this.vap = Array.from({ length: 28 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x6c7680, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false; scene.add(s); return { s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.3 };
    });
    this.vi = 0; this.lastBreath = 0; this.vapT = 0; this.wind = { x: 0, z: 0 }; this.sniffQ = []; this.nose = null; this.noseDir = null;
    this.trauma = 0; this.jolt = 0; this.pending = []; this.t = 0;
    this.shakeGain = 1;
  }
  setDust(hex, wet) { for (const d of this.dust) d.s.material.color.setHex(hex); this.wet = wet; }
  /** A low sustained vibration you feel more than hear (a growl at close range). */
  rumble(k, dur) { this.rum = { k, t: 0, dur }; }
  puff(x, y, z) { for (let i = 0; i < 4; i++) { const d = this.dust[this.di++ % this.dust.length], a = this.rand() * 6.283; d.s.position.set(x, y + 0.1, z); d.vx = Math.sin(a) * 0.6; d.vz = Math.cos(a) * 0.6; d.vy = 0.5; d.life = d.max = 0.8; d.size = 0.3; d.s.visible = true; } }
  /** Exhaled vapour in cold wet air: call every frame with the nostril position, snout direction and the breath signal. */
  breath(pos, dir, b, dt) {
    if (pos) { this.nose = pos; this.noseDir = dir; }
    if (!pos || !this.wet || dt <= 0) { this.lastBreath = b; return; }
    const out = (this.lastBreath - b) / dt; this.lastBreath = b;
    if (out <= 0.15) return;
    this.vapT -= dt * Math.min(4, out) * 9;
    while (this.vapT <= 0) {
      this.vapT += 1;
      const d = this.vap[this.vi++ % this.vap.length], R = this.rand, sp = 0.6 + Math.min(3, out) * 0.9;
      d.s.position.set(pos.x + (R() - 0.5) * 0.1, pos.y + (R() - 0.5) * 0.1, pos.z + (R() - 0.5) * 0.1);
      d.vx = dir.x * sp + (R() - 0.5) * 0.3; d.vy = dir.y * sp - 0.25; d.vz = dir.z * sp + (R() - 0.5) * 0.3;
      d.life = d.max = 1.1 + R() * 0.8; d.size = 0.22 + R() * 0.15; d.inw = 0; d.s.visible = true;
    }
  }
  /** A visible burst of breath from the nostrils with a snort or huff (k 0..1); k < 0 is a sniff: wisps drawn in, not blown out. */
  snort(pos, dir, k = 1) {
    if (!pos) return; if (k < 0) { this.nose = pos; this.noseDir = dir; for (let i = 0; i < 3; i++) this.sniffQ.push(this.t + SNIFF_RHYTHM[i] + 0.05); return; }
    const R = this.rand, n = Math.round(5 + 9 * k);
    for (let i = 0; i < n; i++) {
      const d = this.vap[this.vi++ % this.vap.length], sp = (1.6 + R() * 2.2) * (0.5 + 0.5 * k);
      d.s.position.set(pos.x + (R() - 0.5) * 0.15, pos.y + (R() - 0.5) * 0.1, pos.z + (R() - 0.5) * 0.15);
      d.vx = dir.x * sp + (R() - 0.5) * 0.9; d.vy = dir.y * sp - 0.1 + (R() - 0.5) * 0.5; d.vz = dir.z * sp + (R() - 0.5) * 0.9;
      d.life = d.max = 1.2 + R() * 0.9; d.size = (0.3 + R() * 0.25) * (0.7 + 0.5 * k); d.inw = 0; d.s.visible = true;
    }
  }
  /** One inhale of a sniff: two faint, small wisps just ahead of the nostrils, pulled in to them and gone (the air the animal draws in). */
  _inhale() {
    const p = this.nose, dir = this.noseDir; if (!p || !dir) return; const R = this.rand;
    for (let i = 0; i < 2; i++) {
      const d = this.vap[this.vi++ % this.vap.length], off = 0.22 + R() * 0.12, sx = (R() - 0.5) * 0.14, sy = (R() - 0.5) * 0.08, sz = (R() - 0.5) * 0.14;
      d.life = d.max = 0.2 + R() * 0.08;
      d.s.position.set(p.x + dir.x * off + sx, p.y + dir.y * off + sy - 0.03, p.z + dir.z * off + sz);
      d.vx = -(dir.x * off + sx) / d.max; d.vy = -(dir.y * off + sy - 0.03) / d.max; d.vz = -(dir.z * off + sz) / d.max;      // reaches the nostril as it fades
      d.size = 0.1 + R() * 0.05; d.inw = 1; d.s.visible = true;
    }
  }
  /** A jolt that is not a footfall (a roar, a thunderclap). */
  /** What comes off a thing the animal ran into: dust and grit thrown out from the surface (n) and rolling down it, sized to the knock (k 0..1). */
  burst(x, y, z, nx, nz, k) {
    const R = this.rand, n = Math.round(6 + 12 * k);
    for (let i = 0; i < n; i++) { const d = this.dust[this.di++ % this.dust.length], a = R() * 6.283, sp = (0.5 + 1.6 * R()) * (0.6 + k);
      d.s.position.set(x + (R() - 0.5) * 1.6, Math.max(0.1, y * (i % 3 ? R() : 0.1)), z + (R() - 0.5) * 1.6);
      d.vx = nx * sp * 1.3 + Math.sin(a) * 0.5; d.vz = nz * sp * 1.3 + Math.cos(a) * 0.5; d.vy = 0.3 + R() * 0.9;
      d.life = d.max = (0.9 + R() * 0.9) * (this.wet ? 0.6 : 1); d.size = (0.5 + R() * 0.7) * (0.6 + 0.8 * k) * (this.wet ? 0.6 : 1); d.inw = 0; d.s.visible = true; }
  }
  kick(k) { this.trauma = Math.min(1, this.trauma + k); }

  footfall(e, camPos, audio) {
    const T = this.terrain, R = this.rand;
    const n = Math.round(4 + 7 * e.intensity);
    for (let i = 0; i < n; i++) {
      const d = this.dust[this.di++ % this.dust.length], a = R() * 6.283, sp = (0.6 + R() * 1.8) * e.intensity;
      d.s.position.set(e.x + Math.sin(a) * 0.4, e.y + 0.15, e.z + Math.cos(a) * 0.4);
      d.vx = Math.sin(a) * sp; d.vz = Math.cos(a) * sp; d.vy = 0.3 + R() * 0.9 * e.intensity;
      d.life = d.max = (0.9 + R() * 1.1) * (this.wet ? 0.55 : 1); d.size = (0.7 + R() * 0.9) * (this.wet ? 0.6 : 1); if (this.wet) d.vy += 1.6 * e.intensity; d.s.visible = true;
    }
    const m = new THREE.Matrix4(), nrm = T.normal(e.x, e.z, new THREE.Vector3());
    const f = new THREE.Vector3(Math.sin(e.yaw), 0, Math.cos(e.yaw)); f.addScaledVector(nrm, -f.dot(nrm)).normalize();
    const l = new THREE.Vector3().crossVectors(nrm, f);
    m.makeBasis(l, nrm, f).setPosition(e.x + f.x * 0.25 + nrm.x * 0.04, e.y + nrm.y * 0.04, e.z + f.z * 0.25 + nrm.z * 0.04);
    this.prints.setMatrixAt(this.pi % this.pn, m); this.pi++;
    this.prints.count = Math.min(this.pi, this.pn); this.prints.instanceMatrix.needsUpdate = true;

    const dist = Math.hypot(e.x - camPos.x, e.y - camPos.y, e.z - camPos.z);
    this.pending.push({ at: this.t + dist / 900, k: e.intensity * Math.min(1, 64 / (dist * dist + 16)) * 1.5 });
    if (audio) audio.thump(e.intensity, dist);
  }

  update(dt, camera) {
    this.t += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.t) {
      const k = this.pending[i].k; this.trauma = Math.min(1, this.trauma + k * 0.55); this.jolt -= k * 0.5; this.pending.splice(i, 1);
    }
    for (const d of this.dust) {
      if (d.life <= 0) continue;
      d.life -= dt; const u = 1 - d.life / d.max;
      d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt;
      d.vx += (this.wind.x * 0.7 - d.vx) * Math.min(1, 2.2 * dt); d.vz += (this.wind.z * 0.7 - d.vz) * Math.min(1, 2.2 * dt); d.vy = this.wet ? d.vy - 6 * dt : d.vy * (1 - 1.2 * dt);      // dust drifts off downwind
      const sc = d.size * (0.6 + 2.6 * u); d.s.scale.set(sc, sc, 1);
      d.s.material.opacity = 0.42 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.3);
      if (d.life <= 0) d.s.visible = false;
    }
    for (let i = this.sniffQ.length - 1; i >= 0; i--) if (this.sniffQ[i] <= this.t) { this.sniffQ.splice(i, 1); this._inhale(); }
    for (const d of this.vap) {
      if (d.life <= 0) continue;
      if (d.inw) {      // a sniff's wisp: straight in to the nose, shrinking, faint
        d.life -= dt; const u = 1 - d.life / d.max; d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt;
        const sc = d.size * (1.2 - 0.7 * u); d.s.scale.set(sc, sc, 1); d.s.material.opacity = 0.09 * Math.sin(Math.PI * Math.min(1, u * 1.1));
        if (d.life <= 0) { d.s.visible = false; d.inw = 0; } continue;
      }
      d.life -= dt; const u = 1 - d.life / d.max, k = Math.min(1, 2.5 * dt);
      d.vx += (this.wind.x * 0.9 - d.vx) * k; d.vz += (this.wind.z * 0.9 - d.vz) * k; d.vy += (0.15 - d.vy) * k;
      d.s.position.x += d.vx * dt; d.s.position.y += d.vy * dt; d.s.position.z += d.vz * dt;
      const sc = d.size * (1 + 5 * u); d.s.scale.set(sc, sc, 1);
      d.s.material.opacity = 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.05)) * (1 - u);
      if (d.life <= 0) d.s.visible = false;
    }
    // shake: decays fast, low-frequency so it reads as ground movement, not camera noise
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    this.jolt += (0 - this.jolt) * Math.min(1, dt * 9);
    const s = this.trauma * this.trauma * this.shakeGain, t = this.t;
    if (this.rum) { this.rum.t += dt; const r = this.rum, e = Math.sin(Math.PI * Math.min(1, r.t / r.dur)) * r.k * this.shakeGain; camera.position.y += Math.sin(t * 47) * 0.006 * e; camera.rotateZ(Math.sin(t * 39) * 0.002 * e); if (r.t > r.dur) this.rum = null; }
    camera.position.y += (this.jolt * 0.05 + Math.sin(t * 31) * 0.022 * s) * this.shakeGain;
    camera.rotateX(Math.sin(t * 27 + 1) * 0.011 * s + this.jolt * 0.006 * this.shakeGain);
    camera.rotateZ(Math.sin(t * 23 + 2) * 0.009 * s);
    camera.rotateY(Math.sin(t * 19 + 4) * 0.005 * s);
  }
}

export { Audio } from './audio.js';
