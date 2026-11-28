// Drawing Lot B (#lot): painted stalls, crushable/flippable cars, lamps, glowing green EXIT gantry & waiting Ranger
// truck, smashed park gate, two visitors with a real handheld flashlight (your in-world way to spot them, zero HUD
// clutter during play), and the end-of-run card.
import * as THREE from 'three/webgpu';
import { Figure, ST } from './figure.js';
import { buildCar, makeBeamTex } from './lotcars.js';

function markingsTex(lot) {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), F = lot.fence, k = S / (F * 2), px = (v) => (F - v) * k, pz = (v) => (F - v) * k;
  g.fillStyle = 'rgba(15,17,20,0.8)'; g.fillRect(0, 0, S, S);
  const line = (x0, z0, x1, z1, w = 0.12) => { g.lineWidth = w * k; g.beginPath(); g.moveTo(px(x0), pz(z0)); g.lineTo(px(x1), pz(z1)); g.stroke(); };

  g.strokeStyle = 'rgba(232,234,226,0.62)';
  const hl = lot.stallL / 2, hw = lot.stallW / 2, seen = new Set();
  for (const s of lot.stalls) {
    for (const sx of [-hw, hw]) {
      const key = `${(s.x + sx).toFixed(1)}|${s.z}`; if (seen.has(key)) continue; seen.add(key);
      line(s.x + sx, s.z - hl, s.x + sx, s.z + hl);
    }
  }
  const X0 = lot.spine, X1 = Math.max(...lot.stalls.map((s) => Math.abs(s.x))) + hw;
  for (const row of lot.rows || []) {
    const curbZ = row.yaw === 0 ? row.z + hl : row.z - hl;
    for (const sd of [1, -1]) line(sd * X0, curbZ, sd * X1, curbZ, 0.22);
  }
  // hatched island ends
  g.strokeStyle = 'rgba(226,200,96,0.48)';
  for (const row of lot.rows || []) {
    const za = row.z - hl, zb = row.z + hl;
    for (const sd of [1, -1]) for (const xe of [X0 - 1.2, X1]) for (let z = za; z < zb - 0.2; z += 1.2) line(sd * xe, z, sd * (xe + 1.2), z + 1.2, 0.1);
  }
  // central avenue: dashed yellow line, exit arrows, stop bar, EXIT lettering, kiosk crosswalk
  g.strokeStyle = 'rgba(226,200,96,0.45)'; g.setLineDash([2.2 * k, 2.2 * k]); line(0, -24, 0, 30, 0.14); g.setLineDash([]);
  g.fillStyle = 'rgba(232,234,226,0.58)';
  for (const z of [-18, 2, 22]) {
    g.beginPath();
    g.moveTo(px(0), pz(z + 2.4)); g.lineTo(px(-0.9), pz(z + 0.8)); g.lineTo(px(-0.3), pz(z + 0.8));
    g.lineTo(px(-0.3), pz(z - 1.4)); g.lineTo(px(0.3), pz(z - 1.4)); g.lineTo(px(0.3), pz(z + 0.8));
    g.lineTo(px(0.9), pz(z + 0.8)); g.closePath(); g.fill();
  }
  g.fillRect(px(lot.spine), pz(F - 2.6), lot.spine * 2 * k, 0.45 * k);
  g.font = `bold ${2.6 * k}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('EXIT', px(0), pz(F - 5.4));
  for (let i = -3; i <= 3; i++) g.fillRect(px(lot.kiosk.x + i * 1.1) - 0.3 * k, pz(lot.kiosk.z + lot.kiosk.hd + 5.5), 0.6 * k, 2.8 * k);
  g.fillStyle = 'rgba(232,234,226,0.32)'; g.font = `bold ${3.2 * k}px "Arial Narrow", Arial, sans-serif`;
  g.fillText('LOT B', px(0), pz(-25));

  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function signTex(text, fg, bg, w = 256, h = 96) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.56)}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class LotView {
  constructor(scene, terrain, lotMode, Q, onRestart) {
    this.terrain = terrain; this.lotMode = lotMode; this.lot = lotMode.lot;
    this.rangerFlash = 0;
    const lot = this.lot, lo = this.lo = !!(Q && Q.tier === 'low'), G = this.group = new THREE.Group();
    G.name = 'lotView'; scene.add(G);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); G.add(m); return m; };

    // painted tarmac
    const sz = lot.fence * 2, dg = new THREE.PlaneGeometry(sz, sz); dg.rotateX(-Math.PI / 2);
    const dec = add(dg, new THREE.MeshStandardMaterial({ map: markingsTex(lot), transparent: true, roughness: 0.3, metalness: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 0, 0.03, 0);
    dec.rotation.y = Math.PI; dec.receiveShadow = true;

    // cars
    this.carViews = lotMode.cars.map((car) => {
      const v = buildCar({ kind: car.kind, color: car.color, openDoor: car.openDoor, livery: car.livery, flareBox: car.hasFlares, beams: car.lightsOn || car.openDoor }, lo);
      G.add(v.root);
      return { car, ...v };
    });
    this.carLights = [new THREE.PointLight(0xffcf80, 0, 26, 1.8)];
    G.add(this.carLights[0]);

    // sodium lamps (keep real PointLights lean: 1 on low, 2 on high, so fragment shaders stay fast)
    this.lamps = [];
    const lit = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb850, emissiveIntensity: 3.2 }), out = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7 });
    const near = [...lot.lights].filter((L) => L.state !== 'off').slice(0, lo ? 1 : 2);
    for (const L of lot.lights) {
      const gy = terrain.base ? terrain.base(L.x, L.z) : 0, mat = L.state === 'off' ? out : lit.clone();
      const head = add(new THREE.BoxGeometry(1.5, 0.16, 0.5), mat, L.x, gy + L.h, L.z);
      let light = null;
      if (near.includes(L)) { light = new THREE.PointLight(0xffb866, lo ? 65 : 95, 48, 1.45); light.position.set(L.x, gy + L.h - 0.5, L.z); G.add(light); }
      this.lamps.push({ def: L, head, light, base: light ? light.intensity : 0 });
    }

    // glowing green EXIT gantry + waiting Park Ranger truck outside the bollards
    const E = lot.evac, F = lot.fence, ey = terrain.base ? terrain.base(E.x, F) : 0;
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.6, metalness: 0.4 });
    for (const dx of [-lot.spine - 0.3, lot.spine + 0.3]) add(new THREE.BoxGeometry(0.3, 5.4, 0.3), steel, E.x + dx, ey + 2.7, F);
    add(new THREE.BoxGeometry(lot.spine * 2 + 0.9, 0.3, 0.3), steel, E.x, ey + 5.4, F);
    const st = signTex('EXIT', '#7affb0', '#062410');
    this.exitMat = new THREE.MeshStandardMaterial({ map: st, emissive: 0xffffff, emissiveMap: st, emissiveIntensity: 2.0 });
    add(new THREE.BoxGeometry(4.6, 1.6, 0.2), this.exitMat, E.x, ey + 4.5, F - 0.1).rotation.y = Math.PI;
    this.exitLight = new THREE.PointLight(0x44ff88, 52, 34, 1.4); this.exitLight.position.set(E.x, ey + 3.6, F - 2.5); G.add(this.exitLight);
    this.truck = buildCar({ kind: 'pickup', color: 0x2a4a35, livery: 'ranger', beams: true }, lo);
    this.truck.root.position.set(E.x + 0.4, terrain.base ? terrain.base(E.x, F + 6.5) : 0, F + 6.5);
    this.truck.root.rotation.y = Math.PI + 0.06;
    this.truck.headMat.emissiveIntensity = 3.5; this.truck.tailMat.emissiveIntensity = 0.8; this.truck.beams.visible = true;
    G.add(this.truck.root);

    // smashed park gate beside the kiosk
    const B = lot.breach, by = terrain.base ? terrain.base(B.x, B.z) : 0;
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x30363a, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide });
    const leaf = (x, z, ry, rx) => { const m = add(new THREE.BoxGeometry(4.8, 3.6, 0.1), gateMat, B.x + x, by + 0.35, B.z + z); m.rotation.set(rx, ry, 0); };
    leaf(-2.6, 3.4, 0.5, -1.42); leaf(3.4, 6.2, -0.9, 1.5);
    const pt = signTex('PARK', '#e8e2c4', '#1c2a20', 256, 80);
    add(new THREE.BoxGeometry(5, 1.3, 0.16), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.7 }), B.x + 1.2, by + 0.75, B.z + 8.6).rotation.set(-1.25, 0.4, 0.1);
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0x8a2a10, emissive: 0xff5a14, emissiveIntensity: 2.6 });
    add(new THREE.SphereGeometry(0.22, 10, 8), this.beaconMat, B.x - 5.2, by + 4.7, B.z);

    // the two visitors (bright wet raincoats + Visitor A's handheld flashlight)
    this.kidFigs = lotMode.kids.map((k) => {
      const fig = new Figure(scene, terrain); fig.root.scale.setScalar(k.scale);
      fig.root.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xa8552e) {
          o.material = new THREE.MeshStandardMaterial({ color: k.jacket, roughness: 0.45, emissive: k.jacket, emissiveIntensity: 0.22 });
        }
      });
      fig.visible = true;
      return { kid: k, fig };
    });

    // Visitor A's real handheld flashlight: body, bright glowing lens, volumetric beam cone, and warm bounce light
    this.torchGroup = new THREE.Group(); G.add(this.torchGroup);
    const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.24, 8), new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.5, metalness: 0.6 }));
    tBody.rotation.x = Math.PI / 2; this.torchGroup.add(tBody);
    const tLens = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff5d6, emissiveIntensity: 5.5 }));
    tLens.position.z = 0.13; this.torchGroup.add(tLens);
    const beamGeo = new THREE.ConeGeometry(1.75, 11.5, 14, 1, true);
    beamGeo.translate(0, -5.75, 0); beamGeo.rotateX(-Math.PI / 2);
    this.torchBeamMat = new THREE.MeshBasicMaterial({ map: makeBeamTex('255,244,206', 0.38), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.torchBeam = new THREE.Mesh(beamGeo, this.torchBeamMat);
    this.torchBeam.position.z = 0.14; this.torchGroup.add(this.torchBeam);
    // Single warm bounce light illuminating the wet asphalt, nearby car fenders, and the visitors' raincoats
    this.torchBounce = new THREE.PointLight(0xffe9b5, 24, 16, 1.5); G.add(this.torchBounce);

    // Zero play-mode HUD clutter! Only the end-of-run card once both visitors are out or lost.
    const mono = '"Lucida Console","Courier New",monospace';
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
    this.shownEnd = false; this.rangerFlash = 0; this.endCard.style.display = 'none';
    for (const { fig } of this.kidFigs) { fig.reset(); fig.visible = true; }
  }

  update(dt, started, arena, sim, playerDead = false) {
    const LM = this.lotMode, t = LM.t, fast = Math.floor(t * 4) % 2 === 0, slow = Math.floor(t * 1.6) % 2 === 0;
    if (this.rangerFlash > 0) this.rangerFlash = Math.max(0, this.rangerFlash - dt);

    let pool = 0; for (const pl of this.carLights) pl.intensity = 0;
    for (const v of this.carViews) {
      const c = v.car;
      v.root.position.set(c.x, c.y, c.z);
      v.root.rotation.y = c.yaw;
      // Gentle upright spring rock tilts body over wheels; hard tip/flip rolls the whole car + wheels together
      if (c.flipped !== 0 || Math.abs(c.roll) > 0.26) {
        v.rollPivot.rotation.z = c.roll;
        // Lift or drop rollPivot gently so a car resting on its side or roof sits flush on the asphalt
        const sR = Math.abs(Math.sin(c.roll)), cR = Math.abs(Math.cos(c.roll));
        const halfH = c.flipped === 2 || c.flipped === -2 ? v.style.h * (0.48 - 0.14 * c.crush) : v.rollY;
        v.rollPivot.position.y = halfH * cR + (v.style.w * 0.48) * sR;
        v.body.rotation.z = 0;
      } else {
        v.rollPivot.rotation.z = 0;
        v.rollPivot.position.y = v.rollY;
        v.body.rotation.z = c.roll;
      }
      v.body.rotation.x = -c.pitch;
      // Visible crush deformation: cabin roof caves in and skews, suspension sags onto blown shocks, glass shatters
      v.body.position.y = -0.13 * c.crush;
      v.upper.scale.y = 1 - 0.52 * c.crush;
      v.upper.position.y = v.beltY - 0.06 * c.crush;
      v.upper.rotation.z = c.crushTilt * c.crush;
      if (c.glassBroken && !v.brokenSet) { v.glassMesh.material = v.mats.brokenGlass; v.brokenSet = true; }
      else if (!c.glassBroken && v.brokenSet) { v.glassMesh.material = v.mats.glass; v.brokenSet = false; }

      const beams = c.beamsT > 0 && !c.headDead, flash = c.alarmT > 0 && fast, on = (beams || c.lightsOn) && !c.headDead;
      v.headMat.emissiveIntensity = beams ? 4.5 : flash && !c.headDead ? 3 : on ? 1.8 : 0.04;
      v.tailMat.emissiveIntensity = on || flash ? 1.3 : 0.04;
      v.hazMat.emissiveIntensity = (c.hazards && slow) || flash ? 3.4 : 0.03;
      v.beams.visible = on;
      if (v.extras.flareBox) v.extras.flareBox.visible = (c.flaresLeft || 0) > 0;
      if ((beams || flash) && pool < this.carLights.length) {
        const pl = this.carLights[pool++], s = Math.sin(c.yaw), co = Math.cos(c.yaw);
        pl.position.set(c.x + s * (c.l * 0.55 + 1.5), c.y + 1.1, c.z + co * (c.l * 0.55 + 1.5));
        pl.color.setHex(beams ? 0xfff0c4 : 0xffaa33); pl.intensity = beams ? 62 : 42;
      }
    }

    for (const L of this.lamps) if (L.def.state === 'flicker') {
      const fl = Math.sin(t * 17) * Math.sin(t * 43) > -0.35 ? 1 : 0.1;
      L.head.material.emissiveIntensity = 3.2 * fl; if (L.light) L.light.intensity = L.base * fl;
    }
    this.exitLight.intensity = this.rangerFlash > 0 ? (fast ? 95 : 40) : (slow ? 56 : 38);
    this.truck.headMat.emissiveIntensity = this.rangerFlash > 0 ? (fast ? 8.5 : 1.5) : 3.5;
    this.truck.extras.barMat.emissiveIntensity = this.rangerFlash > 0 || fast ? 5.0 : 0.35;
    this.beaconMat.emissiveIntensity = Math.floor(t * 2.5) % 2 === 0 ? 3.4 : 0.3;

    // Visitors & Visitor A's handheld flashlight
    let torchShown = false;
    for (const { kid, fig } of this.kidFigs) {
      if (kid.state === 'escaped') { fig.visible = false; continue; }
      fig.visible = true;
      const v = arena.victims.get(kid.id), H = sim.head;
      const st = kid.state === 'dead' ? ST.DEAD : v && v.state === 'held' ? ST.HELD : v && v.state === 'air' ? ST.AIR : v && v.state === 'down' ? ST.DOWN : ST.FREE;
      const gy = this.terrain.base ? this.terrain.base(kid.x, kid.z) : 0;
      fig.update(dt, {
        x: kid.x, y: v && !v.free ? v.y : gy, z: kid.z, vx: kid.vx, vz: kid.vz,
        rvx: v ? v.vx : 0, rvy: v ? v.vy : 0, rvz: v ? v.vz : 0, yaw: kid.yaw + Math.PI, eye: kid.crouch ? 1.0 : 1.7, st,
        hx: H.pos.x, hy: H.pos.y, hz: H.pos.z, fx: H.f.x, fy: H.f.y, fz: H.f.z, hvx: 0, hvz: 0,
      });
      if (kid.hasTorch && kid.torchAim && kid.torchAim.active) {
        torchShown = true;
        const aim = kid.torchAim;
        const handY = gy + (kid.crouch ? 0.68 : 1.08);
        const sx = Math.sin(aim.yaw), cz = Math.cos(aim.yaw), cp = Math.cos(aim.pitch), sp = Math.sin(aim.pitch);
        this.torchGroup.visible = true;
        this.torchGroup.position.set(kid.x + cz * 0.16 + sx * 0.22, handY, kid.z - sx * 0.16 + cz * 0.22);
        this.torchGroup.rotation.order = 'YXZ';
        this.torchGroup.rotation.set(-aim.pitch, aim.yaw, 0);
        // Low shielded beam in cover vs. bright sweeping beam while running or on the opening CCTV shot
        const beamDist = aim.low ? 2.4 : 4.6;
        this.torchBeam.scale.set(aim.low ? 0.75 : 1.0, aim.low ? 0.75 : 1.0, aim.low ? 0.55 : 1.0);
        this.torchBeamMat.opacity = aim.low ? 0.65 : 0.95;
        this.torchBounce.position.set(
          this.torchGroup.position.x + sx * cp * beamDist,
          Math.max(gy + 0.45, handY + sp * beamDist),
          this.torchGroup.position.z + cz * cp * beamDist,
        );
        this.torchBounce.intensity = aim.low ? 22 : 34;
      }
    }
    if (!torchShown && LM.droppedTorch) {
      const dt0 = LM.droppedTorch;
      this.torchGroup.visible = true;
      this.torchGroup.position.set(dt0.x, dt0.y, dt0.z);
      this.torchGroup.rotation.set(0.05, dt0.yaw, 0);
      this.torchBeam.scale.set(0.7, 0.7, 0.6);
      this.torchBeamMat.opacity = 0.55;
      this.torchBounce.position.set(dt0.x + Math.sin(dt0.yaw) * 2.5, dt0.y + 0.35, dt0.z + Math.cos(dt0.yaw) * 2.5);
      this.torchBounce.intensity = 16;
    } else if (!torchShown) {
      this.torchGroup.visible = false;
      this.torchBounce.intensity = 0;
    }

    // End card once both visitors are accounted for
    const outN = LM.kids.filter((k) => k.state === 'escaped').length, n = LM.kids.length;
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
