// What the shared simulation's objects look like: stones, flares (with their light), meat,
// the prey herd (procedural, light on draw calls), birds in the perimeter trees, and your torch.
import * as THREE from 'three/webgpu';
import { makeRng, clamp, lerp } from '../math.js';
import { tune, tuneGroup } from './tune.js';      // tune
const LIGHT = { torch: 140, flare: 26 };      // tune: the torch's and a burning flare's light (read live)
{ tuneGroup('Player', { order: 80 }); tune('Player', 'Torch brightness', LIGHT, 'torch', 0, 500, 1, null, 'torch.intensity'); tune('Player', 'Flare light brightness', LIGHT, 'flare', 0, 100, 0.5, null, 'flare.intensity'); }      // tune
import { mergeGeometries as mergeGeo } from 'three/addons/utils/BufferGeometryUtils.js';
import { PREY } from '../sim/herd.js';
import { WEATHER } from './world.js';
import { vec3, float, mix, sin, smoothstep, normalWorld, positionWorld, mx_noise_float } from 'three/tsl';

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,240,220,1)'); r.addColorStop(0.18, 'rgba(255,90,60,0.85)'); r.addColorStop(0.5, 'rgba(255,40,20,0.25)'); r.addColorStop(1, 'rgba(255,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Props {
  constructor(scene, terrain, Q) {
    this.scene = scene; this.T = terrain; this.lo = Q.tier === 'low'; this.meshes = new Map(); this.R = makeRng(99);
    this.geo = {
      stone: new THREE.IcosahedronGeometry(0.09, 0),
      flare: new THREE.CylinderGeometry(0.035, 0.035, 0.32, 6).rotateZ(Math.PI / 2),
      meat: (() => { const g = new THREE.IcosahedronGeometry(0.28, 1), p = g.attributes.position, r = makeRng(4); for (let i = 0; i < p.count; i++) { const f = 0.75 + r() * 0.45; p.setXYZ(i, p.getX(i) * f * 1.3, p.getY(i) * f * 0.6, p.getZ(i) * f); } g.computeVertexNormals(); return g; })(),
    };
    this.mat = {
      stone: new THREE.MeshStandardMaterial({ color: 0x8a857a, roughness: 0.9 }),
      flare: new THREE.MeshStandardMaterial({ color: 0xb02018, roughness: 0.6, emissive: 0xff3010, emissiveIntensity: 0 }),
      meat: new THREE.MeshStandardMaterial({ color: 0x6e1c16, roughness: 0.45, metalness: 0.05 }),
    };
    this.glow = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    // one moving light for the flare nearest the camera (a fixed light count keeps shaders stable)
    this.flareLight = new THREE.PointLight(0xff6a3a, 0, 30, 1.7); scene.add(this.flareLight);
    this.torch = new THREE.SpotLight(0xfff1d8, 0, 70, 0.32, 0.45, 1.2); this.torch.position.set(0, 0, 0); scene.add(this.torch, this.torch.target);
    this.torchOn = false;
    // flare smoke: lit red near the flame, grey as it climbs, always leaning off downwind
    { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.smokeTex = new THREE.CanvasTexture(c); }
    this.smoke = Array.from({ length: this.lo ? 18 : 40 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, color: 0x888888, transparent: true, opacity: 0, depthWrite: false })); sp.visible = false; scene.add(sp); return { sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 0.3, rot: 0 }; });
    this.si = 0; this.smokeT = 0; this.wind = { x: 0, z: 0 };
    this._prey(); this._birds();
  }

  // ---------------------------------------------------------------- prey: a body, neck, head, tail and two jointed legs each
  _prey() {
    // countershaded hide with broken stripes over the back, darker legs; wet in the rain like everything else
    const hide = (base, belly) => {
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
      const up = normalWorld.y, st = sin(positionWorld.x.mul(5.1).add(positionWorld.z.mul(4.3)).add(mx_noise_float(positionWorld.mul(2.2)).mul(3)));
      let c = mix(vec3(belly), vec3(base), smoothstep(-0.35, 0.35, up));
      c = mix(c, vec3(base).mul(0.45), smoothstep(0.55, 0.9, st).mul(smoothstep(0.1, 0.6, up)).mul(0.8));
      c = c.mul(float(0.85).add(mx_noise_float(positionWorld.mul(9)).mul(0.15)));
      m.colorNode = c.mul(mix(float(1), float(0.7), WEATHER.wet)); m.roughnessNode = mix(float(0.8), float(0.45), WEATHER.wet);
      return m;
    };
    const skin = hide(new THREE.Color(0x6e5f45), new THREE.Color(0xb3a585)), dark = hide(new THREE.Color(0x4a4335), new THREE.Color(0x6e6450));
    this.preyMat = [skin, dark];
    this.preyGeo = {
      body: new THREE.SphereGeometry(1, 18, 12).scale(0.36, 0.4, 0.85),
      neck: new THREE.CylinderGeometry(0.08, 0.16, 1, 10).translate(0, 0.5, 0),
      head: new THREE.SphereGeometry(1, 12, 8).scale(0.1, 0.11, 0.26).translate(0, 0, 0.12),
      tail: new THREE.ConeGeometry(0.24, 1.9, 10).rotateX(-Math.PI / 2).translate(0, 0, -0.95),
      thigh: new THREE.SphereGeometry(1, 10, 8).scale(0.15, 0.36, 0.2).translate(0, -0.26, 0),
      shin: new THREE.CylinderGeometry(0.045, 0.07, 0.62, 5).translate(0, -0.31, 0),
      meta: new THREE.CylinderGeometry(0.03, 0.04, 0.42, 5).translate(0, -0.21, 0),
    };
    this.preyViews = new Map();
  }
  // every prey is a little scene graph of empty joints (posed below); its ten parts are drawn as seven instanced meshes
  // shared by the whole herd, one per part, so the herd costs the same few draw calls however many animals are in view
  _preyParts(cap) {
    const G = this.preyGeo, [skin, dark] = this.preyMat;
    if (this.preyIM) for (const im of Object.values(this.preyIM)) { this.scene.remove(im); im.dispose(); }
    this.preyCap = cap; this.preyIM = {};
    for (const [k, mat, n] of [['body', skin, 1], ['neck', skin, 1], ['head', dark, 1], ['tail', skin, 1], ['thigh', skin, 2], ['shin', dark, 2], ['meta', dark, 2]]) {
      const im = new THREE.InstancedMesh(G[k], mat, cap * n); im.count = 0; im.frustumCulled = false; im.castShadow = !this.lo;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(im); this.preyIM[k] = im;
    }
  }
  _preyView(id) {
    const root = new THREE.Group(), slot = (k) => { const x = new THREE.Object3D(); x.userData.part = k; return x; };
    const body = new THREE.Group(); root.add(body); body.position.y = PREY.hip;
    body.add(slot('body'));
    const neck = new THREE.Group(); neck.position.set(0, 0.15, 0.62); body.add(neck); neck.add(slot('neck')); neck.rotation.x = 0.4;
    const head = new THREE.Group(); head.position.set(0, 1, 0); neck.add(head); head.add(slot('head'));
    const tail = new THREE.Group(); tail.position.set(0, 0.05, -0.6); body.add(tail); tail.add(slot('tail'));
    const legs = [-1, 1].map((s) => {
      const hip = new THREE.Group(); hip.position.set(s * 0.2, -0.08, 0); body.add(hip); hip.add(slot('thigh'));
      const knee = new THREE.Group(); knee.position.y = -0.62; hip.add(knee); knee.add(slot('shin'));
      const ank = new THREE.Group(); ank.position.y = -0.62; knee.add(ank); ank.add(slot('meta'));
      return { hip, knee, ank, s };
    });
    const slots = []; root.traverse((x) => { if (x.userData.part) slots.push(x); });
    const v = { root, body, neck, head, tail, legs, id, slots };
    this.preyViews.set(id, v); return v;
  }
  /** Copy every posed part into its instanced mesh. */
  _drawPrey(views) {
    if (!this.preyIM || views.length > this.preyCap) this._preyParts(Math.max(16, views.length * 2));
    const IM = this.preyIM; for (const im of Object.values(IM)) im.count = 0;
    for (const v of views) {
      v.root.updateMatrixWorld(true);
      for (const x of v.slots) { const im = IM[x.userData.part]; im.setMatrixAt(im.count++, x.matrixWorld); }
    }
    for (const im of Object.values(IM)) im.instanceMatrix.needsUpdate = true;
  }
  _updatePrey(herd, dt) {
    const seen = new Set();
    if (herd.disabled) { this._drawPrey([]); return; }
    for (const p of herd.list) {
      seen.add(p.id);
      const v = this.preyViews.get(p.id) || this._preyView(p.id);
      v.root.position.set(p.x, p.y, p.z); v.root.rotation.set(0, p.yaw, 0); v.root.scale.setScalar(p.size);
      if (p.dead) {
        const k = clamp((herd.t - p.deadT) / 0.6, 0, 1);
        v.root.rotation.z = lerp(0, 1.45, k * k); v.body.position.y = lerp(PREY.hip, 0.35, k);
        v.neck.rotation.x = lerp(0.35, 1.2, k); for (const L of v.legs) { L.hip.rotation.x = lerp(0, 0.5, k); L.knee.rotation.x = -0.3; L.ank.rotation.x = 0.4; }
        continue;
      }
      const sp = clamp(p.v / PREY.run, 0, 1), ph = p.phase;
      v.body.position.y = PREY.hip - 0.05 * sp + Math.abs(Math.sin(ph)) * 0.06 * sp - 0.08 * p.head;
      v.body.rotation.x = 0.1 * sp + 0.15 * p.head;
      v.neck.rotation.x = lerp(0.35, 2.0, p.head) + 0.45 * sp + Math.sin(ph * 2) * 0.05 * sp;     // upright and alert, stretched forward to run, down to graze
      v.head.rotation.x = -v.neck.rotation.x + lerp(0.05, 1.45, p.head) + 0.15 * sp;
      v.tail.rotation.y = p.tail; v.tail.rotation.x = 0.05 - 0.1 * sp;
      for (const L of v.legs) {
        const q = ph + (L.s > 0 ? 0 : Math.PI), sw = Math.sin(q), up = Math.max(0, Math.cos(q));
        const A = lerp(0.18, 0.75, sp) * (p.v > 0.1 ? 1 : 0);
        L.hip.rotation.x = -sw * A - 0.15;
        L.knee.rotation.x = 0.55 + up * lerp(0.4, 1.3, sp) * (p.v > 0.1 ? 1 : 0);
        L.ank.rotation.x = -0.75 - up * 0.5 * sp;
      }
    }
    for (const [id, v] of this.preyViews) if (!seen.has(id)) this.preyViews.delete(id);
    this._drawPrey([...this.preyViews.values()]);
  }

  // ---------------------------------------------------------------- birds in the perimeter trees, flushed by loud things
  _birds() {
    const N = this.lo ? 14 : 26, R = this.R, A = this.T.arena;
    const wing = new THREE.BufferGeometry(); wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.08, 0.42, 0.02, -0.02], 3)); wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide });
    this.wingL = new THREE.InstancedMesh(wing, mat, N); this.wingR = new THREE.InstancedMesh(wing, mat, N);
    this.wingL.frustumCulled = this.wingR.frustumCulled = false; this.scene.add(this.wingL, this.wingR);
    this.perches = Array.from({ length: 8 }, () => { const a = R() * 6.283, d = A + 26 + R() * 30; return { x: Math.sin(a) * d, z: Math.cos(a) * d, y: this.T.height(Math.sin(a) * d, Math.cos(a) * d) + 13 + R() * 9 }; });
    this.birds = Array.from({ length: N }, (_, i) => { const P = this.perches[i % 8]; return { x: P.x + R.range(-2, 2), y: P.y + R.range(-1, 1), z: P.z + R.range(-2, 2), vx: 0, vy: 0, vz: 0, perch: i % 8, fly: 0, ph: R() * 6, flock: 0 }; });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v3 = new THREE.Vector3(); this.s3 = new THREE.Vector3(1, 1, 1);
  }
  /** Loud noises within range flush the birds; returns the noise their flight makes, for the animal to hear. */
  flush(x, z, loud) {
    let out = null, R = this.R;
    for (const P of this.perches) {
      if (Math.hypot(P.x - x, P.z - z) > loud * 140) continue;
      let any = false;
      for (const b of this.birds) if (b.perch === this.perches.indexOf(P) && b.fly <= 0) { b.fly = R.range(14, 26); b.vx = R.range(-3, 3); b.vy = R.range(4, 7); b.vz = R.range(-3, 3); b.next = Math.floor(R() * 8); any = true; }
      if (any && !out) out = { x: P.x, y: P.y, z: P.z, loud: 0.22, kind: 'birds' };
    }
    return out;
  }
  _updateBirds(dt, t) {
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      let flap = 0;
      if (b.fly > 0) {
        b.fly -= dt; const P = this.perches[b.fly > 6 ? (b.perch + 4) % 8 : b.next], tx = b.fly > 6 ? Math.sin(t * 0.3 + i) * 50 : P.x, tz = b.fly > 6 ? Math.cos(t * 0.3 + i) * 50 : P.z, ty = b.fly > 6 ? 30 : P.y;
        b.vx += ((tx - b.x) * 0.08 - b.vx) * dt * 1.2; b.vz += ((tz - b.z) * 0.08 - b.vz) * dt * 1.2; b.vy += ((ty - b.y) * 0.25 - b.vy) * dt * 1.5;
        const sp = Math.hypot(b.vx, b.vz); if (sp > 11) { b.vx *= 11 / sp; b.vz *= 11 / sp; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; flap = Math.sin(t * 18 + b.ph) * 0.9;
        if (b.fly <= 0) { b.perch = b.next; b.x = P.x; b.y = P.y; b.z = P.z; }
      } else flap = 0.9 + Math.sin(t * 0.7 + b.ph) * 0.05;     // folded
      const yaw = Math.atan2(b.vx, b.vz);
      for (const [mesh, s] of [[this.wingL, -1], [this.wingR, 1]]) {
        this.e.set(0, b.fly > 0 ? yaw : b.ph, s * flap * (b.fly > 0 ? 1 : 1.4)); this.q.setFromEuler(this.e);
        this.s3.set(s, 1, 1); this.m4.compose(this.v3.set(b.x, b.y, b.z), this.q, this.s3); mesh.setMatrixAt(i, this.m4);
      }
    }
    this.wingL.instanceMatrix.needsUpdate = this.wingR.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- what is left of you: a torn jacket, a boot, the torch, a dark patch
  _remains(o) {
    if (!this.remainsKit) {
      const cloth = (w, d, seed, sag) => {      // a crumpled sheet: folds and a torn edge, draped on the ground
        const g = new THREE.PlaneGeometry(w, d, 14, 12).rotateX(-Math.PI / 2), p = g.attributes.position, r = makeRng(seed);
        const folds = Array.from({ length: 5 }, () => [r() * 6.28, 2 + r() * 5, r() * 6.28, 0.02 + r() * 0.05]);
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), z = p.getZ(i); let y = 0.015;
          for (const [a, f, ph, amp] of folds) y += Math.max(0, Math.sin((x * Math.cos(a) + z * Math.sin(a)) * f + ph)) * amp;
          const rim = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (d / 2)); if (rim > 0.8 && r() < 0.35) { p.setX(i, x * 0.86); p.setZ(i, z * 0.86); }      // torn
          p.setY(i, y * (1 - sag * rim));
        }
        g.computeVertexNormals(); return g;
      };
      const stainTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = makeRng(5);
        for (let i = 0; i < 26; i++) { const x = 64 + (r() - 0.5) * 60, y = 64 + (r() - 0.5) * 50, rad = 10 + r() * 26, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
        return new THREE.CanvasTexture(c); })();
      this.remainsKit = {
        jacket: cloth(0.9, 0.7, 3, 0.6), scrap: cloth(0.35, 0.22, 8, 0.3),
        boot: (() => { const a = new THREE.CapsuleGeometry(0.055, 0.2, 3, 8).rotateX(Math.PI / 2).scale(1.1, 0.9, 1).translate(0, 0.05, 0.03), b = new THREE.CylinderGeometry(0.06, 0.065, 0.2, 8).translate(0, 0.14, -0.07); return mergeGeo([a, b]); })(),
        torch: new THREE.CylinderGeometry(0.022, 0.03, 0.24, 8).rotateZ(Math.PI / 2),
        stain: new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
        mJacket: new THREE.MeshStandardMaterial({ color: 0x3c4230, roughness: 0.85 }), mBoot: new THREE.MeshStandardMaterial({ color: 0x241c15, roughness: 0.7 }),
        mTorch: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.4, metalness: 0.6 }),
        mStain: new THREE.MeshStandardMaterial({ color: 0x1a0705, roughness: 0.25, transparent: true, opacity: 0.75, alphaMap: stainTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      };
    }
    const K = this.remainsKit, G = new THREE.Group(), r = makeRng((Number(o.id) || 3) * 7 + 1), T = this.T;
    const put = (geo, mat, dx, dz, yaw, lift = 0) => { const x = o.x + dx, z = o.z + dz, m = new THREE.Mesh(geo, mat); m.position.set(x, T.height(x, z) + lift, z); m.rotation.y = yaw; m.castShadow = !this.lo && mat !== K.mStain; m.receiveShadow = true; G.add(m); return m; };
    put(K.stain, K.mStain, 0, 0, r() * 6.28, 0.02);
    put(K.jacket, K.mJacket, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, r() * 6.28);
    put(K.scrap, K.mJacket, (r() - 0.5) * 2.2, (r() - 0.5) * 2.2, r() * 6.28);
    const b = put(K.boot, K.mBoot, (r() - 0.5) * 2, (r() - 0.5) * 2, r() * 6.28, 0.02); b.rotation.z = 1.4;
    put(K.torch, K.mTorch, (r() - 0.5) * 2.6, (r() - 0.5) * 2.6, r() * 6.28, 0.03);
    this.scene.add(G); return G;
  }

  /** Start over (main.js startOver): what is left of you, the smoke and the torch go with the last scenario (its things' meshes go on the next update). */
  reset() {
    for (const r of this.remains || []) this.scene.remove(r.g); this.remains = [];
    for (const p of this.smoke) { p.life = 0; p.sp.visible = false; }
    this.torchOn = false;
  }

  // ---------------------------------------------------------------- frame
  update(dt, things, herd, camera, t) {
    const seen = new Set();
    let best = null, bd = 1e9;
    for (const o of things.list) {
      seen.add(o.id);
      if (o.kind === 'carcass') {      // a prey carcass is drawn as the fallen animal; yours as what it leaves (kept after it has fed, the last two)
        if (o.of === 'you' && !(this.remains || (this.remains = [])).some((x) => x.id === o.id)) { this.remains.push({ id: o.id, g: this._remains(o) }); if (this.remains.length > 2) this.scene.remove(this.remains.shift().g); }
        continue;
      }      // a prey carcass is drawn as the fallen animal
      let v = this.meshes.get(o.id);
      if (!v) {
        const mesh = new THREE.Mesh(this.geo[o.kind], o.kind === 'flare' ? this.mat.flare.clone() : this.mat[o.kind]); mesh.castShadow = o.kind !== 'stone' || !this.lo;
        v = { mesh }; this.scene.add(mesh);
        if (o.kind === 'flare') { v.glow = new THREE.Sprite(this.glow); v.glow.scale.setScalar(1.6); this.scene.add(v.glow); }
        this.meshes.set(o.id, v);
      }
      v.mesh.position.set(o.x, o.y, o.z); v.mesh.rotation.set(o.spin * 0.7, o.spin, 0);
      if (o.kind === 'meat') v.mesh.scale.setScalar(Math.max(0.15, Math.sqrt(o.amount)));
      if (o.kind === 'flare') {
        const on = o.burn > 0, fl = on ? 0.75 + 0.25 * Math.sin(t * 31 + o.id) * Math.sin(t * 17.3) + 0.1 * Math.sin(t * 53) : 0, k = clamp(o.burn / 3, 0, 1);
        v.glow.visible = on; v.glow.position.set(o.x, o.y + 0.12, o.z); v.glow.scale.setScalar((1.2 + 0.8 * fl) * (0.4 + 0.6 * k));
        v.mesh.material.emissiveIntensity = on ? 3 * fl : 0;
        if (on) { const d = camera.position.distanceTo(v.mesh.position); if (d < bd) { bd = d; best = { o, fl, k }; } }
      }
    }
    for (const [id, v] of this.meshes) if (!seen.has(id)) { this.scene.remove(v.mesh); if (v.glow) this.scene.remove(v.glow); this.meshes.delete(id); }
    // smoke from every burning flare
    for (const o of things.list) if (o.kind === 'flare' && o.burn > 0) {
      this.smokeT -= dt * (this.lo ? 6 : 14);
      while (this.smokeT <= 0) {
        this.smokeT += 1;
        const p = this.smoke[this.si++ % this.smoke.length], R = this.R;
        p.sp.position.set(o.x + (R() - 0.5) * 0.05, o.y + 0.15, o.z + (R() - 0.5) * 0.05); p.vx = (R() - 0.5) * 0.3; p.vy = 0.9 + R() * 0.5; p.vz = (R() - 0.5) * 0.3;
        p.life = p.max = 2.2 + R() * 1.6; p.size = 0.25 + R() * 0.2; p.rot = R() * 6; p.sp.visible = true;
      }
    }
    for (const p of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt; const u = 1 - p.life / p.max, kk = Math.min(1, 1.6 * dt);
      p.vx += (this.wind.x * 1.1 - p.vx) * kk; p.vz += (this.wind.z * 1.1 - p.vz) * kk; p.vy *= 1 - 0.5 * dt;
      p.sp.position.x += p.vx * dt; p.sp.position.y += p.vy * dt; p.sp.position.z += p.vz * dt;
      const sc = p.size * (1 + 6 * u); p.sp.scale.set(sc, sc, 1); p.sp.material.rotation = p.rot + u;
      const hot = Math.max(0, 1 - u * 4);
      p.sp.material.color.setRGB(0.32 + 0.9 * hot, 0.3 + 0.25 * hot, 0.3 + 0.15 * hot);
      p.sp.material.opacity = 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.04)) * (1 - u * 0.5);
      if (p.life <= 0) p.sp.visible = false;
    }
    if (best) { this.flareLight.position.set(best.o.x, best.o.y + 0.5, best.o.z); this.flareLight.intensity = LIGHT.flare * best.fl * best.k; } else this.flareLight.intensity = 0;
    // torch: from just below the eye, along the view
    this.torch.intensity = this.torchOn ? LIGHT.torch : 0;
    if (this.torchOn) {
      const f = this.v3.set(0, 0, -1).applyQuaternion(camera.quaternion);
      this.torch.position.copy(camera.position).add(new THREE.Vector3(0.25, -0.3, 0).applyQuaternion(camera.quaternion));
      this.torch.target.position.copy(camera.position).addScaledVector(f, 20); this.torch.target.updateMatrixWorld();
    }
    this._updatePrey(herd, dt);
    this._updateBirds(dt, t);
  }
}
