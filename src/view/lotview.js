// Drawing Lot B (#lot): the painted stalls, the cars (src/view/lotcars.js), the lamps, the exit with the ranger's truck
// waiting beyond it, the smashed park gate, the two visitors, and the small tally and closing card.
// Lights are kept cheap: lamps and car lamps glow by emissive material; real lights are three lamp pools, the exit, and
// two that are handed to whichever cars are sounding an alarm or on high beam.
import * as THREE from 'three/webgpu';
import { Figure, ST } from './figure.js';
import { buildCar } from './lotcars.js';

function markingsTex(lot) {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), F = lot.fence, k = S / (F * 2), px = (v) => (F - v) * k, pz = (v) => (F - v) * k;      // north up, east to the left: the plane is turned so the lettering reads from the kiosk
  g.fillStyle = 'rgba(15,17,20,0.8)'; g.fillRect(0, 0, S, S);
  const line = (x0, z0, x1, z1, w = 0.12) => { g.lineWidth = w * k; g.beginPath(); g.moveTo(px(x0), pz(z0)); g.lineTo(px(x1), pz(z1)); g.stroke(); };
  // stalls: a line each side, a spine down the middle of a double row
  g.strokeStyle = 'rgba(232,234,226,0.62)';
  const hl = lot.stallL / 2, hw = lot.stallW / 2, seen = new Set();
  for (const s of lot.stalls) for (const sx of [-hw, hw]) { const key = `${(s.x + sx).toFixed(1)}|${s.z}`; if (seen.has(key)) continue; seen.add(key); line(s.x + sx, s.z - hl, s.x + sx, s.z + hl); }
  const X0 = lot.spine, X1 = Math.max(...lot.stalls.map((s) => s.x)) + hw;
  for (const sd of [1, -1]) { line(sd * X0, -16, sd * X1, -16); line(sd * X0, 14, sd * X1, 14); line(sd * X0, 45, sd * X1, 45, 0.3); }
  // hatched ends of the islands
  g.strokeStyle = 'rgba(226,200,96,0.5)';
  for (const [za, zb] of [[-21.4, -10.6], [8.6, 19.4]]) for (const sd of [1, -1]) for (const xe of [X0 - 1.2, X1]) for (let z = za; z < zb - 0.2; z += 1.2) line(sd * xe, z, sd * (xe + 1.2), z + 1.2, 0.1);
  // the avenue: dashed centre line, arrows toward the exit, a stop bar and EXIT at the north end, a crossing at the kiosk
  g.strokeStyle = 'rgba(226,200,96,0.45)'; g.setLineDash([2.4 * k, 2.4 * k]); line(0, -30, 0, 40, 0.14); g.setLineDash([]);
  g.fillStyle = 'rgba(232,234,226,0.55)';
  for (const z of [-24, -2, 28]) { g.beginPath(); g.moveTo(px(0), pz(z + 2.4)); g.lineTo(px(-0.9), pz(z + 0.8)); g.lineTo(px(-0.3), pz(z + 0.8)); g.lineTo(px(-0.3), pz(z - 1.4)); g.lineTo(px(0.3), pz(z - 1.4)); g.lineTo(px(0.3), pz(z + 0.8)); g.lineTo(px(0.9), pz(z + 0.8)); g.closePath(); g.fill(); }
  g.fillRect(px(lot.spine), pz(46.6), lot.spine * 2 * k, 0.45 * k);
  g.font = `bold ${2.6 * k}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', px(0), pz(43.6));
  for (let i = -4; i <= 4; i++) g.fillRect(px(lot.kiosk.x + i * 1.1) - 0.3 * k, pz(lot.kiosk.z + lot.kiosk.hd + 7), 0.6 * k, 3.2 * k);
  g.fillStyle = 'rgba(232,234,226,0.3)'; g.font = `bold ${3.4 * k}px "Arial Narrow", Arial, sans-serif`; g.fillText('LOT B', px(0), pz(-33));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function signTex(text, fg, bg, w = 256, h = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.56)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class LotView {
  constructor(scene, terrain, lotMode, Q, onRestart) {
    this.terrain = terrain; this.lotMode = lotMode; this.lot = lotMode.lot;
    const lot = this.lot, lo = this.lo = !!(Q && Q.tier === 'low'), G = this.group = new THREE.Group();
    G.name = 'lotView'; scene.add(G);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); G.add(m); return m; };

    // the paint on the tarmac
    const sz = lot.fence * 2, dg = new THREE.PlaneGeometry(sz, sz); dg.rotateX(-Math.PI / 2);
    const dec = add(dg, new THREE.MeshStandardMaterial({ map: markingsTex(lot), transparent: true, roughness: 0.3, metalness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.03, 0);
    dec.rotation.y = Math.PI; dec.receiveShadow = true;

    // the cars
    this.carViews = lotMode.cars.map((car) => {
      const v = buildCar({ kind: car.kind, color: car.color, openDoor: car.openDoor, livery: car.livery, flareBox: car.hasFlares }, lo);
      G.add(v.root);
      return { car, ...v };
    });
    this.carLights = [0, 1].map(() => { const pl = new THREE.PointLight(0xffcf80, 0, 26, 1.8); G.add(pl); return pl; });

    // the lamps: a head on each pole (the pole itself is the world's), three of them really lighting the ground
    this.lamps = [];
    const lit = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb850, emissiveIntensity: 3 }), out = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7 });
    const near = [...lot.lights].filter((L) => L.state !== 'off').sort((a, b) => Math.hypot(a.x, a.z + 5) - Math.hypot(b.x, b.z + 5)).slice(0, lo ? 2 : 4);
    for (const L of lot.lights) {
      const gy = terrain.height(L.x, L.z), mat = L.state === 'off' ? out : lit.clone();
      const head = add(new THREE.BoxGeometry(1.5, 0.16, 0.5), mat, L.x, gy + L.h, L.z);
      let light = null;
      if (near.includes(L)) { light = new THREE.PointLight(0xffb866, lo ? 60 : 90, 46, 1.5); light.position.set(L.x, gy + L.h - 0.5, L.z); G.add(light); }
      this.lamps.push({ def: L, head, light, base: light ? light.intensity : 0 });
    }

    // the exit: a gantry over the gap in the fence, and the ranger's truck waiting outside it, lights on, facing in
    const E = lot.evac, F = lot.fence, ey = terrain.height(E.x, F), steel = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6, metalness: 0.4 });
    for (const dx of [-lot.spine - 0.3, lot.spine + 0.3]) add(new THREE.BoxGeometry(0.3, 5.4, 0.3), steel, E.x + dx, ey + 2.7, F);
    add(new THREE.BoxGeometry(lot.spine * 2 + 0.9, 0.3, 0.3), steel, E.x, ey + 5.4, F);
    const st = signTex('EXIT', '#6dffa6', '#06200f');
    this.exitMat = new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 1.6 });
    add(new THREE.BoxGeometry(4.2, 1.5, 0.2), this.exitMat, E.x, ey + 4.5, F - 0.1).rotation.y = Math.PI;
    this.exitLight = new THREE.PointLight(0x44ff88, 40, 30, 1.5); this.exitLight.position.set(E.x, ey + 3.6, F - 2.5); G.add(this.exitLight);
    this.truck = buildCar({ kind: 'pickup', color: 0x2a4a35, livery: 'ranger' }, lo);
    this.truck.root.position.set(E.x + 0.4, terrain.height(E.x, F + 7), F + 7); this.truck.root.rotation.y = Math.PI + 0.06;
    this.truck.headMat.emissiveIntensity = 3.2; this.truck.tailMat.emissiveIntensity = 0.8; this.truck.beams.visible = true; G.add(this.truck.root);

    // the park gate, smashed in beside the kiosk: two leaves thrown down, a hazard beacon still turning
    const B = lot.breach, by = terrain.height(B.x, B.z), gateMat = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide });
    const leaf = (x, z, ry, rx) => { const m = add(new THREE.BoxGeometry(4.8, 3.6, 0.1), gateMat, B.x + x, by + 0.35, B.z + z); m.rotation.set(rx, ry, 0); };
    leaf(-2.6, 3.4, 0.5, -1.42); leaf(3.4, 6.2, -0.9, 1.5);
    const pt = signTex('PARK', '#e8e2c4', '#1c2a20', 256, 80);
    add(new THREE.BoxGeometry(5, 1.3, 0.16), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7 }), B.x + 1.2, by + 0.75, B.z + 8.6).rotation.set(-1.25, 0.4, 0.1);
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0x8a2a10, emissive: 0xff5a14, emissiveIntensity: 2.4 });
    add(new THREE.SphereGeometry(0.22, 10, 8), this.beaconMat, B.x - 5.2, by + 4.7, B.z);

    // the two visitors
    this.kidFigs = lotMode.kids.map((k) => {
      const fig = new Figure(scene, terrain); fig.root.scale.setScalar(k.scale);
      fig.root.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xa8552e) o.material = new THREE.MeshStandardMaterial({ color: k.jacket, roughness: 0.7, emissive: k.jacket, emissiveIntensity: 0.12 }); });
      fig.visible = true;
      return { kid: k, fig };
    });

    // the tally, and the closing card
    const mono = '"Lucida Console","Courier New",monospace';
    this.hud = document.createElement('div'); this.hud.id = 'lotHud';
    this.hud.style.cssText = `position:fixed;top:14px;right:18px;z-index:18;font:700 13px/1.35 ${mono};color:#ecf4ec;background:rgba(8,12,10,0.62);border:1px solid rgba(236,244,236,0.28);padding:6px 10px;letter-spacing:0.06em;pointer-events:none;display:none`;
    document.body.appendChild(this.hud);
    this.endCard = document.createElement('div'); this.endCard.id = 'lotEnd';
    this.endCard.style.cssText = `position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(6,8,8,0.6);font-family:${mono};color:#f1eee4`;
    this.endCard.innerHTML = `<div style="max-width:420px;width:90%;border:2px solid rgba(241,238,228,0.75);background:rgba(10,12,11,0.92);padding:22px 24px;text-align:left">
      <div style="font-size:12px;letter-spacing:0.14em;opacity:0.75;margin-bottom:6px">LOT B</div>
      <div id="lotEndTitle" style="font-size:22px;font-weight:700;margin-bottom:10px"></div>
      <div id="lotEndBody" style="font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:18px"></div>
      <button id="lotEndBtn" style="font:700 14px/1 ${mono};padding:10px 16px;background:#f1eee4;color:#0b0e0d;border:0;cursor:pointer;width:100%">▶ START OVER</button>
      <button id="lotEndStay" style="font:700 12px/1 ${mono};padding:10px 16px;background:none;color:#f1eee4;border:0;cursor:pointer;width:100%;opacity:0.7;margin-top:6px">STAY IN THE LOT</button>
    </div>`;
    document.body.appendChild(this.endCard);
    this.endCard.querySelector('#lotEndBtn').addEventListener('click', () => { this.endCard.style.display = 'none'; if (onRestart) onRestart(); });
    this.endCard.querySelector('#lotEndStay').addEventListener('click', () => { this.endCard.style.display = 'none'; });
    this.shownEnd = false;
  }

  reset() {
    this.shownEnd = false; this.endCard.style.display = 'none';
    for (const { fig } of this.kidFigs) { fig.reset(); fig.visible = true; }
  }

  update(dt, started, arena, sim, playerDead = false) {
    const LM = this.lotMode, t = LM.t, fast = Math.floor(t * 4) % 2 === 0, slow = Math.floor(t * 1.6) % 2 === 0;

    let pool = 0; for (const pl of this.carLights) pl.intensity = 0;
    for (const v of this.carViews) {
      const c = v.car;
      v.root.position.set(c.x, c.y, c.z); v.root.rotation.y = c.yaw; v.body.rotation.x = -c.pitch; v.body.rotation.z = c.roll;
      const beams = c.beamsT > 0, flash = c.alarmT > 0 && fast, on = beams || c.lightsOn;
      v.headMat.emissiveIntensity = beams ? 4.5 : flash ? 3 : c.lightsOn ? 1.6 : 0.04;
      v.tailMat.emissiveIntensity = on || flash ? 1.3 : 0.04;
      v.hazMat.emissiveIntensity = (c.hazards && slow) || flash ? 3.2 : 0.03;
      v.beams.visible = on || flash;
      if (v.extras.flareBox) v.extras.flareBox.visible = (c.flaresLeft || 0) > 0;
      if ((beams || flash) && pool < this.carLights.length) {
        const pl = this.carLights[pool++], s = Math.sin(c.yaw), co = Math.cos(c.yaw);
        pl.position.set(c.x + s * (c.l * 0.55 + 1.5), c.y + 1.1, c.z + co * (c.l * 0.55 + 1.5));
        pl.color.setHex(beams ? 0xfff0c4 : 0xffaa33); pl.intensity = beams ? 60 : 40;
      }
    }
    for (const L of this.lamps) if (L.def.state === 'flicker') {
      const fl = Math.sin(t * 17) * Math.sin(t * 43) > -0.35 ? 1 : 0.1;
      L.head.material.emissiveIntensity = 3 * fl; if (L.light) L.light.intensity = L.base * fl;
    }
    this.exitLight.intensity = slow ? 44 : 30;
    this.truck.extras.barMat.emissiveIntensity = fast ? 4 : 0.3;
    this.beaconMat.emissiveIntensity = Math.floor(t * 2.5) % 2 === 0 ? 3.2 : 0.3;

    for (const { kid, fig } of this.kidFigs) {
      if (kid.state === 'escaped') { fig.visible = false; continue; }
      fig.visible = true;
      const v = arena.victims.get(kid.id), H = sim.head;
      const st = kid.state === 'dead' ? ST.DEAD : v && v.state === 'held' ? ST.HELD : v && v.state === 'air' ? ST.AIR : v && v.state === 'down' ? ST.DOWN : ST.FREE;
      fig.update(dt, {
        x: kid.x, y: v && !v.free ? v.y : this.terrain.height(kid.x, kid.z), z: kid.z, vx: kid.vx, vz: kid.vz,
        rvx: v ? v.vx : 0, rvy: v ? v.vy : 0, rvz: v ? v.vz : 0, yaw: kid.yaw + Math.PI, eye: kid.crouch ? 1.0 : 1.7, st,
        hx: H.pos.x, hy: H.pos.y, hz: H.pos.z, fx: H.f.x, fy: H.f.y, fz: H.f.z, hvx: 0, hvz: 0,
      });
    }

    const outN = LM.kids.filter((k) => k.state === 'escaped').length, n = LM.kids.length;
    if (started && LM.active && LM.status === 'active') {
      const run = LM.kids.some((k) => k.state === 'sprint'), lost = LM.kids.filter((k) => k.state === 'dead').length;
      this.hud.style.display = 'block';
      this.hud.textContent = `VISITORS OUT ${outN}/${n}${lost ? ` · LOST ${lost}` : ''} · ${run ? 'RUNNING' : 'IN COVER'}`;
      this.hud.style.borderColor = run ? 'rgba(255,190,70,0.85)' : 'rgba(236,244,236,0.28)';
    } else this.hud.style.display = 'none';

    if (LM.status !== 'active' && !this.shownEnd && !playerDead && t - LM.statusAt > 2.5) {
      this.shownEnd = true;
      const secs = Math.round(LM.statusAt - LM.activeAt), tm = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60} s` : `${secs} s`;
      this.endCard.querySelector('#lotEndTitle').textContent = LM.status === 'won' ? 'BOTH VISITORS OUT' : LM.status === 'partial' ? 'ONE VISITOR OUT' : 'NO VISITORS OUT';
      this.endCard.querySelector('#lotEndBody').textContent = `${outN} of ${n} reached the exit. ${tm}.`;
      this.endCard.style.display = 'flex';
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch {}
    }
  }
}
