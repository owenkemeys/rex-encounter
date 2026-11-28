// View layer for Lot B (#lot): wet asphalt markings, reactive 3D parked cars with suspension
// rock & headlights/hazards, floodlights, evacuation exit beacons, scaled Figure kids, and minimal VHS HUD.
import * as THREE from 'three/webgpu';
import { Figure, ST } from './figure.js';

function lotMarkingsTex(lot) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  const toPx = (v) => ((v + lot.fence) / (lot.fence * 2)) * S;
  // Subtle dark asphalt base tint
  g.fillStyle = 'rgba(18, 21, 25, 0.72)';
  g.fillRect(0, 0, S, S);
  // Painted parking bay lines (faded yellow/white)
  g.strokeStyle = 'rgba(220, 205, 140, 0.42)';
  g.lineWidth = 3;
  for (const rowZ of [-22, -8, 12, 28]) {
    const py = toPx(rowZ);
    g.beginPath(); g.moveTo(toPx(-36), py); g.lineTo(toPx(36), py); g.stroke();
    for (let x = -34; x <= 34; x += 6.2) {
      const px = toPx(x);
      g.beginPath(); g.moveTo(px, py - 24); g.lineTo(px, py + 24); g.stroke();
    }
  }
  // Crosswalk near Evacuation Exit Gate
  const ex = toPx(lot.evac.x), ez = toPx(lot.evac.z);
  g.fillStyle = 'rgba(235, 240, 225, 0.5)';
  for (let i = -3; i <= 3; i++) g.fillRect(ex - 26, ez + i * 11 - 3, 52, 6);
  // Stencil "LOT B" in the central aisle
  g.save();
  g.translate(S * 0.5, S * 0.5);
  g.fillStyle = 'rgba(225, 220, 195, 0.28)';
  g.font = 'bold 64px "Arial Narrow", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('LOT B', 0, 0);
  g.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeCarMesh(car, lo) {
  const root = new THREE.Group();
  const body = new THREE.Group();      // tilts with suspension pitch/roll
  root.add(body);

  const w = car.w, l = car.l, h = car.h;
  const paint = new THREE.MeshStandardMaterial({ color: car.color, roughness: 0.35, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1117, roughness: 0.12, metalness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.8 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe4a0, emissiveIntensity: car.lightsOn ? 2.0 : 0.05, roughness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xaa1818, emissive: 0xdd1818, emissiveIntensity: car.lightsOn ? 1.2 : 0.05, roughness: 0.3 });
  const hazMat = new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0xff8800, emissiveIntensity: 0, roughness: 0.25 });

  const box = (bw, bh, bd, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y, z); m.castShadow = !lo; m.receiveShadow = true; parent.add(m); return m;
  };

  // Lower chassis
  const lowH = h * 0.44;
  box(w, lowH, l, paint, 0, 0.32 + lowH * 0.5, 0);
  // Bumpers
  box(w + 0.06, 0.24, 0.22, trim, 0, 0.38, l * 0.5 + 0.04);
  box(w + 0.06, 0.24, 0.22, trim, 0, 0.38, -l * 0.5 - 0.04);
  // Upper cabin (longer for minivan/SUV/ranger)
  const cabL = car.kind === 'sedan' ? l * 0.48 : l * 0.66;
  const cabZ = car.kind === 'sedan' ? -l * 0.06 : -l * 0.08;
  const cabH = h - (0.32 + lowH);
  box(w * 0.88, cabH, cabL, paint, 0, 0.32 + lowH + cabH * 0.5, cabZ);
  // Windows wrap
  box(w * 0.90, cabH * 0.68, cabL * 0.92, glass, 0, 0.32 + lowH + cabH * 0.52, cabZ);
  box(w * 0.82, cabH * 0.68, cabL * 1.01, glass, 0, 0.32 + lowH + cabH * 0.52, cabZ);

  // Ranger stripe & roof lightbar
  if (car.kind === 'ranger') {
    const stripe = new THREE.MeshStandardMaterial({ color: 0xd9c26a, roughness: 0.5 });
    box(w + 0.03, 0.14, l * 0.92, stripe, 0, 0.32 + lowH * 0.65, 0);
    // Open rear hatch + glowing red flare crate
    const hatch = box(w * 0.86, 0.08, 0.95, paint, 0, 0.32 + lowH + cabH + 0.22, -l * 0.5 - 0.22);
    hatch.rotation.x = 0.35;
    const flareMat = new THREE.MeshStandardMaterial({ color: 0xd62828, emissive: 0xff2211, emissiveIntensity: 1.4 });
    const flareBox = box(0.42, 0.22, 0.32, flareMat, 0, 0.32 + lowH * 0.9, -l * 0.44);
    body.userData.flareBox = flareBox;
  }

  // Abandoned open driver door
  if (car.openDoor) {
    const door = box(0.08, lowH + cabH * 0.7, 0.95, paint, w * 0.5 + 0.34, 0.32 + (lowH + cabH * 0.7) * 0.5, 0.35);
    door.rotation.y = 0.95;
  }

  // Wheels (on root so suspension rocks independently above axles)
  const wGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12); wGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wh = new THREE.Mesh(wGeo, tireMat);
    wh.position.set(sx * (w * 0.48), 0.34, sz * (l * 0.32));
    root.add(wh);
  }

  // Headlights, taillights & hazard corners
  for (const sx of [-1, 1]) {
    box(0.32, 0.16, 0.08, headMat, sx * (w * 0.34), 0.32 + lowH * 0.62, l * 0.5 + 0.02);
    box(0.32, 0.16, 0.08, tailMat, sx * (w * 0.34), 0.32 + lowH * 0.62, -l * 0.5 - 0.02);
    box(0.16, 0.14, 0.09, hazMat, sx * (w * 0.44), 0.32 + lowH * 0.62, l * 0.5 + 0.03);
    box(0.16, 0.14, 0.09, hazMat, sx * (w * 0.44), 0.32 + lowH * 0.62, -l * 0.5 - 0.03);
  }

  // Soft headlight pool (PointLight in front of bumper, cheap and works on both WebGPU/WebGL2)
  let beam = null;
  if (!lo || car.role === 'start' || car.openDoor || car.role === 'ranger') {
    beam = new THREE.PointLight(0xffe6b0, car.lightsOn ? 8 : 0, 22, 1.8);
    beam.position.set(0, 0.9, l * 0.5 + 2.4);
    body.add(beam);
  }

  return { root, body, headMat, tailMat, hazMat, beam };
}

export class LotView {
  constructor(scene, terrain, lotMode, Q, onRestart) {
    this.scene = scene;
    this.terrain = terrain;
    this.lotMode = lotMode;
    this.lot = lotMode.lot;
    this.lo = Q && Q.tier === 'low';
    this.group = new THREE.Group();
    this.group.name = 'lotView';
    scene.add(this.group);

    // 1. Wet asphalt markings overlay
    const sz = this.lot.fence * 2;
    const decGeo = new THREE.PlaneGeometry(sz, sz); decGeo.rotateX(-Math.PI / 2);
    const decMat = new THREE.MeshStandardMaterial({
      map: lotMarkingsTex(this.lot), transparent: true, roughness: 0.25, metalness: 0.05,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const dec = new THREE.Mesh(decGeo, decMat);
    dec.position.y = 0.025; dec.receiveShadow = true;
    this.group.add(dec);

    // 2. Parked cars
    this.carViews = lotMode.cars.map((car) => {
      const v = makeCarMesh(car, this.lo);
      v.root.position.set(car.x, car.y, car.z);
      v.root.rotation.y = car.yaw;
      this.group.add(v.root);
      return { car, ...v };
    });

    // 3. Sodium floodlights (working, dead, or flickering by seed)
    this.lamps = [];
    const bulbOn = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb850, emissiveIntensity: 3 });
    const bulbOff = new THREE.MeshStandardMaterial({ color: 0x33363a, roughness: 0.7 });
    for (const L of this.lot.lights) {
      const gy = terrain.height(L.x, L.z);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.45), L.state === 'off' ? bulbOff : bulbOn.clone());
      m.position.set(L.x, gy + L.h, L.z);
      this.group.add(m);
      let light = null;
      if (L.state !== 'off') {
        light = new THREE.PointLight(0xffb866, this.lo ? 18 : 28, 38, 1.5);
        light.position.set(L.x, gy + L.h - 0.5, L.z);
        this.group.add(light);
      }
      this.lamps.push({ def: L, mesh: m, light });
    }

    // 4. Evacuation Exit Gate beacons (green) + Breached Fence warning strobes (red/amber)
    const evacY = terrain.height(this.lot.evac.x, this.lot.evac.z);
    this.exitMat = new THREE.MeshStandardMaterial({ color: 0x44ff88, emissive: 0x22ee66, emissiveIntensity: 2.5 });
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.18), this.exitMat);
    exitSign.position.set(this.lot.evac.x, evacY + 3.2, this.lot.evac.z);
    this.group.add(exitSign);
    this.exitLight = new THREE.PointLight(0x44ff88, 16, 22, 1.6);
    this.exitLight.position.set(this.lot.evac.x, evacY + 2.8, this.lot.evac.z);
    this.group.add(this.exitLight);

    const brY = terrain.height(this.lot.breach.x, this.lot.breach.z);
    this.breachMat = new THREE.MeshStandardMaterial({ color: 0xff4422, emissive: 0xff2200, emissiveIntensity: 2.2 });
    const brSign = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), this.breachMat);
    brSign.position.set(this.lot.breach.x, brY + 3.6, this.lot.breach.z - 0.5);
    this.group.add(brSign);
    this.breachLight = new THREE.PointLight(0xff3311, 14, 24, 1.6);
    this.breachLight.position.set(this.lot.breach.x, brY + 3.2, this.lot.breach.z - 1.2);
    this.group.add(this.breachLight);

    // 5. Two stranded kids using Figure (scaled + bright raincoats so they read clearly across the lot)
    this.kidFigs = lotMode.kids.map((k) => {
      const fig = new Figure(scene, terrain);
      fig.root.scale.setScalar(k.scale);
      fig.root.traverse((o) => {
        if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xa8552e) {
          o.material = new THREE.MeshStandardMaterial({ color: k.jacket, roughness: 0.75 });
        }
      });
      fig.visible = true;
      return { kid: k, fig };
    });

    // 6. Minimal VHS-styled HUD strip + End-of-run card
    this.hud = document.createElement('div');
    this.hud.id = 'lotHud';
    this.hud.style.cssText = 'position:fixed;top:14px;right:18px;z-index:18;font:700 13px/1.35 "Lucida Console","Courier New",monospace;color:#ecf4ec;background:rgba(8,12,10,0.62);border:1px solid rgba(236,244,236,0.28);padding:6px 10px;letter-spacing:0.06em;pointer-events:none;display:none';
    document.body.appendChild(this.hud);

    this.endCard = document.createElement('div');
    this.endCard.id = 'lotEnd';
    this.endCard.style.cssText = 'position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(6,8,8,0.72);font-family:"Lucida Console","Courier New",monospace;color:#f1eee4';
    this.endCard.innerHTML = `<div style="max-width:420px;width:90%;border:2px solid rgba(241,238,228,0.75);background:rgba(10,12,11,0.92);padding:22px 24px;text-align:left">
      <div id="lotEndTag" style="font-size:12px;letter-spacing:0.14em;opacity:0.75;margin-bottom:6px">LOT B · EVACUATION LOG</div>
      <div id="lotEndTitle" style="font-size:22px;font-weight:700;margin-bottom:10px"></div>
      <div id="lotEndBody" style="font-size:13px;line-height:1.5;opacity:0.9;margin-bottom:18px"></div>
      <button id="lotEndBtn" style="font:700 14px/1 monospace;padding:10px 16px;background:#f1eee4;color:#0b0e0d;border:0;cursor:pointer;width:100%">▶ TRY LOT B AGAIN</button>
    </div>`;
    document.body.appendChild(this.endCard);
    this.endCard.querySelector('#lotEndBtn').addEventListener('click', () => {
      this.endCard.style.display = 'none';
      if (onRestart) onRestart();
    });
    this.shownEnd = false;
  }

  reset() {
    this.shownEnd = false;
    this.endCard.style.display = 'none';
    for (const { fig } of this.kidFigs) { fig.reset(); fig.visible = true; }
  }

  update(dt, started, arena, sim) {
    const t = this.lotMode.t;
    const blinkFast = Math.floor(t * 4) % 2 === 0;
    const blinkSlow = Math.floor(t * 2) % 2 === 0;

    // Update cars
    for (const v of this.carViews) {
      const c = v.car;
      v.root.position.set(c.x, c.y, c.z);
      v.root.rotation.y = c.yaw;
      v.body.rotation.x = c.pitch;
      v.body.rotation.z = c.roll;

      const beamOn = c.beamsT > 0 || c.lightsOn;
      const alarmFlash = c.alarmT > 0 && blinkFast;
      const hazOn = (c.hazards && blinkSlow) || alarmFlash;
      v.headMat.emissiveIntensity = c.beamsT > 0 ? 4.0 : alarmFlash ? 3.0 : c.lightsOn ? 1.6 : 0.05;
      v.tailMat.emissiveIntensity = beamOn || alarmFlash ? 1.4 : 0.05;
      v.hazMat.emissiveIntensity = hazOn ? 3.2 : 0.05;
      if (v.beam) v.beam.intensity = c.beamsT > 0 ? 22 : alarmFlash ? 16 : c.lightsOn ? 7 : 0;
      if (v.body.userData.flareBox) v.body.userData.flareBox.visible = (c.flaresLeft || 0) > 0;
    }

    // Flickering floodlight + exit/breach beacons
    for (const L of this.lamps) {
      if (L.def.state === 'flicker' && L.light) {
        const fl = Math.sin(t * 17) * Math.sin(t * 43) > -0.35 ? 1 : 0.12;
        L.light.intensity = (this.lo ? 18 : 28) * fl;
        L.mesh.material.emissiveIntensity = 3 * fl;
      }
    }
    this.exitLight.intensity = blinkSlow ? 18 : 8;
    this.breachLight.intensity = blinkFast ? 18 : 3;
    this.breachMat.emissiveIntensity = blinkFast ? 3.0 : 0.4;

    // Update kids figures
    for (const { kid, fig } of this.kidFigs) {
      if (kid.state === 'escaped') { fig.visible = false; continue; }
      fig.visible = true;
      const v = arena.victims.get(kid.id);
      const st = kid.state === 'dead' ? ST.DEAD : v && v.state === 'held' ? ST.HELD : v && v.state === 'air' ? ST.AIR : v && v.state === 'down' ? ST.DOWN : ST.FREE;
      const g = this.terrain.height(kid.x, kid.z);
      const H = sim.head;
      fig.update(dt, {
        x: kid.x, y: v && !v.free ? v.y : g, z: kid.z,
        vx: kid.vx, vz: kid.vz,
        rvx: v ? v.vx : 0, rvy: v ? v.vy : 0, rvz: v ? v.vz : 0,
        yaw: kid.yaw + Math.PI,
        eye: kid.crouch ? 1.0 : 1.7,
        st,
        hx: H.pos.x, hy: H.pos.y, hz: H.pos.z,
        fx: H.f.x, fy: H.f.y, fz: H.f.z,
        hvx: 0, hvz: 0,
      });
    }

    // Minimal HUD
    if (started && this.lotMode.status === 'active') {
      const esc = this.lotMode.kids.filter((k) => k.state === 'escaped').length;
      const spr = this.lotMode.kids.some((k) => k.state === 'sprint');
      this.hud.style.display = 'block';
      this.hud.textContent = `LOT B · VISITORS SAFE ${esc}/${this.lotMode.kids.length}${spr ? ' · MOVING!' : ' · HIDING'}`;
      this.hud.style.borderColor = spr ? 'rgba(255,190,70,0.8)' : 'rgba(236,244,236,0.28)';
    } else {
      this.hud.style.display = 'none';
    }

    // End card (win / heroic / visitor lost)
    if (this.lotMode.status !== 'active' && !this.shownEnd) {
      this.shownEnd = true;
      const st = this.lotMode.status;
      const secs = Math.round(this.lotMode.t);
      const title = st === 'won' ? 'EVACUATION COMPLETE' : st === 'heroic' ? 'VISITORS ESCAPED' : 'EVACUATION FAILED';
      const body = st === 'won'
        ? `Both stranded visitors reached the exit gate in ${secs} s. Alarms tripped: ${this.lotMode.alarmsTripped}.`
        : st === 'heroic'
          ? `You didn't make it, but both visitors slipped through the exit gate while you held its attention (${secs} s).`
          : `The rex caught one of the stranded visitors before they reached the exit gate (${secs} s).`;
      this.endCard.querySelector('#lotEndTitle').textContent = title;
      this.endCard.querySelector('#lotEndBody').textContent = body;
      this.endCard.style.display = 'flex';
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch {}
    }
  }
}
