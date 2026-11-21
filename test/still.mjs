// node test/still.mjs : the share preview's frame choice (StillPicker.score in src/share.js) on staged shots from a real camera:
// the animal must sit well inside the 1200x630 crop, bigger in frame scores more, the visitor in shot and in the air score more.
import * as THREE from 'three/webgpu';
import { StillPicker } from '../src/share.js';
const ST = { FREE: 0, AIR: 1, HELD: 2 }, P = new StillPicker();
const cam = (aspect, at = [0, 3, 0], from = [0, 4, 14]) => { const c = new THREE.PerspectiveCamera(50, aspect, 0.1, 500); c.position.set(...from); c.lookAt(...at); c.updateMatrixWorld(); return c; };
const rec = (head, torso, fig, st = ST.FREE, f = 300) => ({ head: new THREE.Vector3(...head), torso: new THREE.Vector3(...torso), S: { x: fig[0], y: fig[1], z: fig[2], st }, s0: 0, t: f / 30, death: 310, burst: 0 });
const W = 1280, H = 720, c = cam(W / H), score = (r, w = W, h = H, cc = c) => P.score(r, w, h, cc, ST);
const base = rec([1, 4, 0], [-1.5, 3, 0], [2, 0, 1]);
const checks = {
  'framed rex counts': score(base) !== null,
  'rex off to the side is refused': score(rec([14, 4, 0], [11.5, 3, 0], [2, 0, 1])) === null,
  'rex behind the camera is refused': score(rec([0, 4, 20], [0, 3, 19], [2, 0, 1])) === null,
  'head cut by the crop on a tall screen is refused': score(rec([3.2, 4, 0], [1, 3, 0], [2, 0, 1]), 720, 1280, cam(720 / 1280)) === null,
  'closer rex scores more': score(rec([1, 4, 6], [-1.5, 3, 6], [2, 0, 7])) > score(base),
  'visitor in the air scores more': score(rec([1, 4, 0], [-1.5, 3, 0], [2, 0, 1], ST.AIR)) > score(base) + 30,
  'visitor out of shot scores less': score(rec([1, 4, 0], [-1.5, 3, 0], [30, 0, 1])) < score(base),
  'static burst is refused': score({ ...base, burst: 0.8 }) === null,
};
for (const [k, ok] of Object.entries(checks)) console.log(ok ? 'ok  ' : 'FAIL', k);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
