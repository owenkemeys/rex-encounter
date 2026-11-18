// The gatehouse start, view side (main.js GATE; layout in paddock.js LAYOUT.spawns.gate): the guard's counter and the
// security monitor on it, inside the Gatehouse. The splash is that monitor's camera full screen; on "click to begin" the
// picture cuts to the guard looking down at the monitor, which holds the last frame of the feed (grab() copies the
// canvas right after a render, the one moment a WebGL/WebGPU canvas can be read). Blockout boxes: real art comes later.
import * as THREE from 'three/webgpu';

export function makeGatehouseDesk(scene, terrain, G) {
  const floor = terrain.height(G.guard.x, G.guard.z), fx = Math.sign(G.window.x - G.guard.x) || 1;      // the guard faces the window along x
  const grp = new THREE.Group(); grp.name = 'gatehouseDesk';
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.85 }), case_ = new THREE.MeshStandardMaterial({ color: 0x2b2c2a, roughness: 0.6 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); grp.add(b); return b; };
  const dx = G.guard.x + fx * 0.72, z = G.guard.z;
  box(0.6, 0.05, 1.5, wood, dx, floor + 1.0, z);                                  // the counter top
  box(0.05, 0.98, 1.4, wood, dx + fx * 0.27, floor + 0.49, z);                    // its front panel
  // the monitor: a deep old CRT box, turned a little up toward the eye
  const mon = new THREE.Group(); mon.position.set(dx + fx * 0.05, floor + 1.25, z); mon.rotation.y = fx > 0 ? -Math.PI / 2 : Math.PI / 2; grp.add(mon);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.42), case_); shell.position.z = -0.21; mon.add(shell);
  const W = 320, H = 180, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#0b120c'; g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.33), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xb8c8b8 }));
  screen.position.z = 0.002; mon.add(screen);
  mon.rotation.x = 0; mon.rotateX(-0.25);
  scene.add(grp);
  let lastGrab = -1;
  return {
    group: grp,
    /** where the screen's middle is, for aiming the eye at it */
    screenAt: () => screen.getWorldPosition(new THREE.Vector3()),
    /** copy what was just rendered onto the monitor (call right after the render; throttled to `every` s) */
    grab(src, now, every = 0.15) {
      if (now - lastGrab < every) return; lastGrab = now;
      try { const sw = src.width, sh = src.height, k = Math.min(sw / W, sh / H), cw = W * k, ch = H * k; g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H); tex.needsUpdate = true; } catch {}
    },
  };
}
