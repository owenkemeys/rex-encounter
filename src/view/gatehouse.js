// The gatehouse start, view side (main.js GATE; layout in paddock.js LAYOUT.spawns.gate): the guard's counter and the
// security monitor on it, inside the Gatehouse. The splash is that monitor's camera full screen; on "click to begin" the
// picture cuts to the guard looking down at the monitor, which holds the last frame of the feed (grab() copies the
// canvas right after a render, the one moment a WebGL/WebGPU canvas can be read). After the cut the monitor is live: live() draws the
// feed's camera into a small render target (main.js monitorTick decides when: close by, in view, ~12 fps); noSignal() puts up NO SIGNAL.
// Blockout boxes: real art comes later.
import * as THREE from 'three/webgpu';
import { texture, uv, uniform, vec3, float, mix, dot, sin, clamp } from 'three/tsl';

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
  // the screen: the canvas (the splash's grabbed frames, or NO SIGNAL) or the live target, in the monitor's own look (grey-green, scanlines)
  const FW = 256, FH = 144, rt = new THREE.RenderTarget(FW, FH, { type: THREE.HalfFloatType, depthBuffer: true });
  const feedCam = new THREE.PerspectiveCamera(40, FW / FH, 0.1, 600), uLive = uniform(0), uGain = uniform(1.0);
  const smat = new THREE.MeshBasicNodeMaterial({ toneMapped: false });
  smat.colorNode = (() => {
    const st = texture(tex, uv()).rgb.mul(vec3(0.72, 0.78, 0.72));
    // a render target's rows run top-down in three's node textures on both backends (TextureNode.setupUV flips them for WebGL2 to match
    // WebGPU; QuadMesh's uv runs top-down to suit), so on a plane, whose uv runs bottom-up, it is sampled flipped to stand upright
    const lv = texture(rt.texture, uv().flipY()).rgb, l = clamp(dot(lv, vec3(0.299, 0.587, 0.114)).mul(uGain), 0, 1).pow(0.8);
    const scan = float(0.82).add(sin(uv().y.mul(FH * Math.PI)).mul(0.5).add(0.5).mul(0.18));
    return mix(st, vec3(l.mul(0.78), l.mul(0.9), l.mul(0.78)).mul(scan), uLive);
  })();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.33), smat);
  screen.position.z = 0.002; mon.add(screen);
  mon.rotation.x = 0; mon.rotateX(-0.25);
  scene.add(grp);
  let lastGrab = -1;
  return {
    group: grp,
    /** where the screen's middle is, for aiming the eye at it */
    screenAt: () => screen.getWorldPosition(new THREE.Vector3()),
    /** copy what was just rendered onto the monitor (call right after the render; throttled to `every` s) */
    feedCam, rt, canvas: cv,
    get isLive() { return uLive.value > 0.5; },
    /** draw the feed's camera into the screen (feedCam already placed: main.js feedDir.update); the screen itself is hidden meanwhile */
    live(renderer, scene) {      // (the screen is hidden while drawn: it must not sample the target it is drawing into)
      const was = renderer.getRenderTarget(); screen.visible = false;
      try { renderer.setRenderTarget(rt); renderer.render(scene, feedCam); } finally { renderer.setRenderTarget(was); screen.visible = true; }
      uLive.value = 1;
    },
    /** the feed is off: a dark screen with NO SIGNAL (drawn once) */
    noSignal(cam = 1) {
      g.fillStyle = '#05080a'; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(120,140,130,0.10)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      g.fillStyle = '#7c8a82'; g.font = 'bold 26px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('NO SIGNAL', W / 2, H / 2);
      g.font = '12px monospace'; g.fillText('CAM ' + String(cam).padStart(2, '0'), W / 2, H / 2 + 26);
      tex.needsUpdate = true; uLive.value = 0;
    },
    grab(src, now, every = 0.15) {
      if (now - lastGrab < every) return; lastGrab = now;
      try { const sw = src.width, sh = src.height, k = Math.min(sw / W, sh / H), cw = W * k, ch = H * k; g.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H); tex.needsUpdate = true; } catch {}
    },
  };
}
