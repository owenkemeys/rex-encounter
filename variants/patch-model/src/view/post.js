// The camera: bloom, tone mapping, grade, vignette, grain, and depth of field for the observe camera.
// High tier: the full chain. Phones render straight to the canvas with the renderer's own tone mapping, unless the
// camcorder look is on, when one cheap pass is added.
//
// The camcorder look (`post.setVHS(on, { stamp })`, off by default; `post.vhs` reads it): 1990s home-video tape played
// back. Soft luma with edge ringing, chroma smeared to the right, interlaced scan lines, tape snow, a wobbling time base
// and a rolling tracking band, head-switching noise along the bottom, rare dropout streaks, slight barrel, blown
// highlights and lifted blacks, and a burned-in REC mark and date/time stamp (`stamp: false` hides them).
import * as THREE from 'three/webgpu';
import { pass, renderOutput, uniform, vec2, vec3, vec4, float, mix, dot, smoothstep, clamp, max, fract, sin, floor, abs, step, time, length, screenUV, viewportSize, texture, convertToTexture } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/** Grades per weather: lift (shadow tint), gain (highlight tint), saturation, contrast, vignette, bloom. */
const GRADE = {
  storm: { lift: [0.012, 0.018, 0.028], gain: [0.98, 1.0, 1.05], sat: 0.85, con: 1.06, vig: 0.32, bloom: 0.34, thr: 0.85 },
  dusk: { lift: [0.018, 0.008, 0.02], gain: [1.06, 0.99, 0.9], sat: 0.98, con: 1.08, vig: 0.38, bloom: 0.3, thr: 0.8 },
  day: { lift: [0.01, 0.012, 0.016], gain: [1.02, 1.0, 0.97], sat: 0.9, con: 1.05, vig: 0.28, bloom: 0.16, thr: 0.95 },
};

const h1 = (x) => fract(sin(x.mul(12.9898)).mul(43758.5453));
const h2 = (p) => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));

/** The on-screen display burned into the tape: REC and a date/time stamp, redrawn once a second. The canvas is stretched over the
 *  whole frame by the shader, so it is drawn in CSS-pixel coordinates through a counter-scale (text is never squashed), and laid
 *  out clear of the safe areas, the barrel crop at the corners and, on touch devices, the on-screen controls. */
function makeOSD() {
  const N = 1024, c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  let last = '';
  const text = (s, x, y, al = 'left') => { g.textAlign = al; g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillText(s, x + 1.5, y + 1.5); g.fillStyle = '#f2f2ea'; g.fillText(s, x, y); };
  const draw = (stamp, year) => {
    const vw = window.innerWidth, vh = window.innerHeight, d = new Date(), sec = Math.floor(d.getTime() / 1000);
    const touch = document.body.classList.contains('touch');
    const cs = getComputedStyle(probe), sa = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const key = sec * 2 + (stamp ? 1 : 0) + '|' + vw + 'x' + vh + '|' + touch + '|' + sa.t + sa.r + sa.b + sa.l;
    if (key === last) return; last = key;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, N, N);
    if (!stamp) { tex.needsUpdate = true; return; }
    g.setTransform(N / vw, 0, 0, N / vh, 0, 0);
    const fs = Math.round(Math.max(13, Math.min(20, Math.min(vw, vh) * 0.045))), lh = Math.round(fs * 1.25);
    // the barrel distortion crops a few percent at the corners: keep clear of it, and of the notch / home bar
    const m = Math.max(10, Math.min(vw, vh) * 0.04), L = m + sa.l, R = vw - m - sa.r, T = m + sa.t + 4, Bt = vh - m - sa.b;
    g.font = `bold ${fs}px "Courier New", Courier, monospace`; g.textBaseline = 'alphabetic';
    const hh = d.getHours(), h12 = ((hh + 11) % 12) + 1, p2 = (n) => String(n).padStart(2, '0');
    const time = `${hh < 12 ? 'AM' : 'PM'} ${h12}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`, date = `${MON[d.getMonth()]}. ${d.getDate()} ${year}`;
    const r0 = fs * 0.36, x0 = L + r0 + 2, tx = L + r0 * 2 + 8;
    let y = T + fs;
    if (sec % 2 === 0) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(x0 + 1, y - fs * 0.32 + 1, r0, 0, 7); g.fill(); g.fillStyle = '#e8261c'; g.beginPath(); g.arc(x0, y - fs * 0.32, r0, 0, 7); g.fill(); }
    text('REC', tx, y); text('SP', tx, y + lh);
    if (touch) { text(time, L, y + lh * 2.3); text(date, L, y + lh * 3.3); }      // under REC, top left: the thumbs and the pause button own the other corners
    else { text(time, R, Bt - lh, 'right'); text(date, R, Bt, 'right'); }
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export function makePost(renderer, scene, camera, Q) {
  const low = Q.tier === 'low';
  const P = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  P.outputColorTransform = false;
  const U = { lift: uniform(new THREE.Vector3()), gain: uniform(new THREE.Vector3(1, 1, 1)), sat: uniform(1), con: uniform(1), vig: uniform(0.35), flash: uniform(0) };
  let B = null, graded;
  // the full build's chains, by quality level (src/view/quality.js): high = bloom + grade, medium = grade, low = tone map only.
  // Built when first used; switching costs one shader build, and the level changes rarely.
  const chains = {};
  const gradeOf = (hdr) => {
    let c = renderOutput(hdr).rgb;                                   // tone mapped, display space
    // contrast around mid grey, saturation, lift/gain split toning
    c = c.sub(0.5).mul(U.con).add(0.5).max(0);
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(lum), c, U.sat);
    c = c.mul(U.gain).add(U.lift.mul(float(1).sub(c)));
    // vignette: soft oval, a little heavier at the bottom corners
    const p = screenUV.sub(0.5).mul(vec2(1.0, 1.15));
    const v = smoothstep(0.25, 0.9, length(p));
    c = c.mul(float(1).sub(v.mul(v).mul(U.vig)));
    // grain: luminance-weighted, animated
    const gr = fract(sin(dot(screenUV.mul(viewportSize).add(fract(time.mul(13.7)).mul(97.3)), vec2(12.9898, 78.233))).mul(43758.5453));
    c = c.add(gr.sub(0.5).mul(0.035).mul(float(1).sub(lum.mul(0.6))));
    return vec4(clamp(c, 0, 1), 1);
  };
  const plain = () => vec4(clamp(renderOutput(color).rgb, 0, 1), 1);
  const chain = (key) => chains[key] || (chains[key] = key === 'bloom' ? gradeOf(color.add(B || (B = bloom(color, 0.4, 0.55, 0.7)))) : key === 'grade' ? gradeOf(color) : plain());
  let chainKey = low ? 'plain' : 'bloom';
  if (!low) B = bloom(color, 0.4, 0.55, 0.7);
  graded = chain(chainKey);
  P.outputNode = graded;

  // ---- the camcorder look, built only when first asked for
  let vhsNode = null, osd = null, vhsOn = false, stamp = true, moodKey = 'storm';
  const V = { year: 1996 };
  const buildVHS = () => {
    osd = makeOSD();
    const src = convertToTexture(graded), osdT = texture(osd.tex);
    const LINES = 240, px = float(1 / 520);                       // a VHS frame: ~240 lines a field, ~3 MHz of luma across the width
    // barrel, then the time base: per-line jitter, a slow wobble, a tracking band that rolls up the frame now and then
    const cc = screenUV.sub(0.5), r2 = dot(cc, cc), q0 = cc.mul(float(1).add(r2.mul(0.1))).mul(0.985).add(0.5);
    const line = floor(q0.y.mul(LINES)), fr = floor(time.mul(30));
    const jit = h1(line.add(fr.mul(17.0))).sub(0.5).mul(0.0009);
    const wob = sin(q0.y.mul(5.0).add(time.mul(1.3))).mul(0.0012).add(sin(q0.y.mul(37.0).add(time.mul(6.1))).mul(0.0004));
    const bandY = fract(time.mul(0.045)).mul(1.6).sub(0.3), band = smoothstep(0.05, 0.0, abs(q0.y.sub(bandY))).mul(step(0.55, fract(time.mul(0.045).mul(0.5))));
    const head = smoothstep(0.955, 0.985, q0.y);                    // head-switching noise along the bottom edge
    const dx = jit.add(wob).add(band.mul(h1(line.add(fr)).sub(0.3).mul(0.025))).add(head.mul(float(0.018).add(h1(line.add(fr.mul(3.0))).mul(0.02))));
    const q = vec2(q0.x.add(dx), q0.y);
    const tap = (o) => { const u = vec2(q.x.add(px.mul(o)), q.y), s = src.sample(u).rgb, t = osdT.sample(u); return mix(s, t.rgb, t.a); };
    const toY = (c) => dot(c, vec3(0.299, 0.587, 0.114)), toI = (c) => dot(c, vec3(0.596, -0.274, -0.322)), toQ = (c) => dot(c, vec3(0.211, -0.523, 0.312));
    // luma: soft, with the ringing halo of the deck's edge enhancement
    const yC = toY(tap(0)), yN = toY(tap(-1.5)).add(toY(tap(1.5))), yW = toY(tap(-4)).add(toY(tap(4)));
    let Y = yC.mul(0.5).add(yN.mul(0.25));
    Y = Y.add(Y.sub(yW.mul(0.5)).mul(0.35));
    // chroma: low bandwidth, smeared and delayed to the right
    const c1 = tap(-3), c2 = tap(-7), c3 = tap(-11);
    let I = toI(c1).mul(0.4).add(toI(c2).mul(0.35)).add(toI(c3).mul(0.25)), Qc = toQ(c1).mul(0.4).add(toQ(c2).mul(0.35)).add(toQ(c3).mul(0.25));
    const cn = h2(vec2(line, fr)).sub(0.5);
    I = I.mul(0.82).add(cn.mul(0.03)); Qc = Qc.mul(0.82).add(h1(line.add(fr.mul(5.0))).sub(0.5).mul(0.025));
    // snow, dropouts (a white streak along part of a line), head noise
    const snow = h2(q.mul(vec2(520, LINES * 2)).add(fract(time.mul(7.3)).mul(311.0))).sub(0.5);
    Y = Y.add(snow.mul(0.07)).add(snow.mul(head).mul(0.5));
    const dSeed = h1(line.mul(0.731).add(fr.mul(1.37))), ds = h1(line.add(fr.mul(2.1))), drop = step(0.9965, dSeed).mul(step(ds, q.x)).mul(step(q.x, ds.add(0.12)));
    Y = mix(Y, float(0.85).add(snow.mul(0.3)), drop.mul(0.85));
    let c = vec3(Y.add(I.mul(0.956)).add(Qc.mul(0.621)), Y.sub(I.mul(0.272)).sub(Qc.mul(0.647)), Y.sub(I.mul(1.106)).add(Qc.mul(1.703)));
    // the tape's tone: blown highlights, lifted milky blacks, a little warm
    c = clamp(c.mul(1.16).add(0.012), 0, 1).mul(vec3(1.02, 1.0, 0.95)).mul(0.93).add(0.04);
    // interlaced fields: alternate lines dim, the pair swapping every frame; a faint soft vignette
    const fl = q.y.mul(viewportSize.y).add(step(0.5, fract(time.mul(30))));
    c = c.mul(float(0.94).add(sin(fl.mul(Math.PI)).mul(sin(fl.mul(Math.PI))).mul(0.06)));
    c = c.mul(float(1).sub(smoothstep(0.35, 0.75, length(cc)).mul(0.35)));
    const inside = step(0, q0.x).mul(step(q0.x, 1)).mul(step(0, q0.y)).mul(step(q0.y, 1));
    vhsNode = vec4(c.mul(inside), 1);
  };
  // Warm the camcorder look once, off screen, when the page is idle after load: build its nodes and draw the pipeline
  // with it into a 1x1 target, so its shaders (and, on phones, the scene's materials in the pass's linear context) are
  // compiled before anyone asks. Nothing reaches the canvas; with the look off nothing of it runs per frame afterwards.
  let warmed = false;
  const warm = () => {
    if (warmed || vhsOn) return; warmed = true;
    try {
      if (!vhsNode) buildVHS();
      const rt = new THREE.RenderTarget(1, 1), prev = renderer.getRenderTarget();
      P.outputNode = vhsNode; P.needsUpdate = true; osd.draw(stamp, V.year);
      renderer.setRenderTarget(rt); P.render(); renderer.setRenderTarget(prev);
      P.outputNode = graded; P.needsUpdate = true; rt.dispose();
    } catch (e) { console.warn('VHS warm-up failed', e); }
  };
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  if (!/novhswarm/.test(location.hash)) setTimeout(() => idle(warm, { timeout: 4000 }), 2500);
  const api = {
    pipe: P, bloom: B, U, warm,
    get vhs() { return vhsOn; },
    get chain() { return chainKey; },
    /** The quality level's post stack: MSAA samples on the scene pass, bloom, grade. The light build keeps drawing straight
     *  to the canvas. */
    setQuality(Pq) {
      if (low) return;
      const key = Pq.bloom ? 'bloom' : Pq.grade ? 'grade' : 'plain';
      if (scenePass.options.samples !== Pq.msaa) { scenePass.options.samples = Pq.msaa; scenePass.renderTarget.samples = Pq.msaa; P.needsUpdate = true; }
      if (key !== chainKey) {
        chainKey = key; graded = chain(key);
        if (vhsNode) { vhsNode = null; if (vhsOn) buildVHS(); }      // the camcorder look reads the graded picture: rebuild it on the new one
        P.outputNode = vhsOn ? vhsNode : graded; P.needsUpdate = true;
        if (key === 'bloom') api.setMood(moodKey);
      }
    },
    get osd() { return osd; },
    /** The camcorder look on or off; opts.stamp (default true) shows REC and the date/time stamp, opts.year the stamp's year. */
    setVHS(on, opts = {}) {
      vhsOn = !!on; if (opts.stamp !== undefined) stamp = !!opts.stamp; if (opts.year) V.year = opts.year;
      if (vhsOn && !vhsNode) buildVHS();
      P.outputNode = vhsOn ? vhsNode : graded; P.needsUpdate = true;
    },
    setMood(key) {
      moodKey = key;
      if (!B) return;
      const G = GRADE[key] || GRADE.storm;
      U.lift.value.set(...G.lift); U.gain.value.set(...G.gain); U.sat.value = G.sat; U.con.value = G.con; U.vig.value = G.vig;
      B.strength.value = G.bloom; B.threshold.value = G.thr;
    },
    render() {
      if (low && !vhsOn) { renderer.render(scene, camera); return; }
      if (vhsOn) osd.draw(stamp, V.year);
      P.render();
    },
  };
  if (location.hash.startsWith('#test')) window.__post = api;
  return api;
}
