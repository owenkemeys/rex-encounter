// The creature's body: one continuous skinned skin over the simulation's skeleton, plus
// eyes and teeth riding the skull and jaw. Reads only the pose buffer.
import * as THREE from 'three/webgpu';
import { attribute, vertexColor, vec3, float, mix, uniform, positionView, normalView, cross, dot, normalize, abs, sign, mx_worley_noise_float, mx_worley_noise_vec2, mx_noise_float, smoothstep, clamp, length, fwidth, max, faceDirection, exp } from 'three/tsl';
import { RexSim, PS } from '../sim/rex.js';
import { jawFromVoice } from './jawvoice.js';
import { WEATHER } from './world.js';
import { positionWorld, cameraPosition, pow, normalWorld, normalLocal } from 'three/tsl';
import { buildRexGeometry, paintRex, boneMatrices, BONE_COUNT, BONE, mouthY, EYE, EYE_AIM, eyeAim, WEB, WEBSHEET } from './rexgeo.js';

// EYES2 (view-side workaround; the real fix belongs in src/sim/rex.js, see out/skel/EYES2.md): main.js hands the view
// `body.fix = sim.fix` once, at boot, but `RexSim.reset` replaces `this.fix` with a new Vector3, and the game's opening
// (arena.js `opening`) resets the animal next to the gate at the start of every game. The view was left holding the boot
// spawn's point (40 m ahead, 4 m up) for the whole game, so the eyes stared at a fixed spot in the sky, not at the player.
// Keep the Vector3 the view holds: copy the new value into the old object.
if (!RexSim.prototype._keepFix) {
  const reset0 = RexSim.prototype.reset;
  RexSim.prototype.reset = function (...a) { const f = this.fix, r = reset0.apply(this, a); if (f && f !== this.fix && f.copy) { f.copy(this.fix); this.fix = f; } return r; };
  RexSim.prototype._keepFix = true;
}

const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };

// The hide. Everything is evaluated in rest (bind-pose) space, so the pattern is carved into the skin and rides it
// through every bend without swimming or stretching, and a 3D field has no seams to hide. Relief is carried by the
// normal and the roughness, not by painted lines: pebbly tuberculate scales (big on the back and flanks, finer on the
// belly, neck and feet, finest on the face, with flat scutes along the snout and lips), soft transverse folds only where
// the skin bunches (neck base, throat, armpit, knee, ankle, groin; paintRex supplies the mask and an along-the-bone
// coordinate), and a broad lumpy undulation. Colour comes from the vertex paint (countershading, muted bands, blotches);
// the scales only nudge it by a few percent. Each band fades out by its own on-screen size before it can alias, and the
// normal variance it would have carried is handed to the roughness, so distant hide goes softly matte instead of sparkling.
// The face, in head space, per pixel: forms finer than the skin mesh can carry (the phone grid is 7 cm) as relief and
// tone that need no triangles: the rolled upper lip with a shadowed undercut over the teeth, nostril openings with a
// raised rim, a heavy brow boss shading a dark orbit, rugose lumps along the nasal ridge, and wrinkled skin at the jaw
// corner. Returns height (m), darkening (0..1) and a roughness offset.
function headDetail(hp, scute, E, N, lo, jaw) {
  const hx = abs(hp.x), hy = hp.y, hz = hp.z, g = (t) => exp(t.mul(t).negate());
  const mY = float(-0.13).sub(float(1).sub(smoothstep(0.0, 1.25, hz)).mul(0.17)).sub(g(hz.sub(0.95).div(0.34)).mul(0.04)).add(g(hz.sub(1.5).div(0.1)).mul(0.014));
  const dy = hy.sub(mY), along = smoothstep(0.3, 0.55, hz).mul(smoothstep(1.92, 1.74, hz));
  const lw = lo ? 1.35 : 1.0;                                            // phones: everything a little broader so it survives the pixels
  const lipRim = g(dy.sub(0.055 * lw).div(0.024 * lw)).mul(along), lipUnder = smoothstep(0.045 * lw, 0.015, dy).mul(smoothstep(-0.005, 0.012, dy)).mul(along);
  const lipGroove = g(dy.sub(0.11 * lw).div(0.02 * lw)).mul(along), lowRim = g(dy.add(0.045 * lw).div(0.02 * lw)).mul(along);
  const dn = length(vec3(hx.sub(N.x), hy.sub(N.y), hz.sub(N.z).mul(0.7))), pit = smoothstep(0.06 * lw, 0.028, dn), nrim = g(dn.sub(0.07 * lw).div(0.02 * lw));
  const gap = smoothstep(lo ? 0.056 : 0.034, lo ? 0.03 : 0.018, abs(dy)).mul(smoothstep(WEBSHEET.cut0, WEBSHEET.cut0 + 0.06, hz));   // the cut faces inside the lip gap: dark mouth, not lit skin
  const de = length(vec3(hx.sub(E.x), hy.sub(E.y), hz.sub(E.z))), orbit = smoothstep(0.24, 0.075, de).mul(smoothstep(-0.12, 0.02, hy.sub(E.y)).mul(0.5).add(0.5));
  const db = length(vec3(hx.sub(E.x + 0.01), hy.sub(E.y + 0.11).mul(1.5), hz.sub(E.z + 0.02).mul(0.55))), brow = g(db.div(0.085));
  const rq = lo ? 9.0 : 14.0, rn = mx_noise_float(hp.mul(rq).add(3.3)).add(mx_noise_float(hp.mul(rq * 2.3).add(8.1)).mul(0.45));
  const nasal = smoothstep(0.6, 0.9, hz).mul(smoothstep(1.8, 1.6, hz)).mul(smoothstep(0.25, 0.08, hx)).mul(smoothstep(0.1, 0.3, dy.sub(0.25)));
  const rug = rn.mul(max(scute, nasal)).add(rn.mul(brow).mul(0.6));
  const cz = g(hz.sub(0.22).div(0.2)).mul(g(dy.div(0.17))).mul(smoothstep(0.15, 0.3, hx));
  const wph = hz.mul(lo ? 40.0 : 58.0).sub(dy.mul(22.0)).add(rn.mul(1.5)), wr = smoothstep(-0.2, 0.9, wph.sin()).mul(cz);
  // the corner webs: folded into creases along the mouth line while the jaw is shut, smoothing out as it opens (the skin is
  // pulled taut); the creases live in rest space, so opening also spreads them apart
  const web = smoothstep(WEB.z + 0.04, WEB.z - 0.04, hz).mul(smoothstep(-0.05, 0.1, hz)).mul(g(dy.div(0.07))).mul(float(1).sub(smoothstep(0.12, 0.55, jaw)).mul(0.8).add(0.2));
  const wc = smoothstep(-0.3, 0.8, dy.mul(lo ? 110.0 : 150.0).add(hz.mul(9.0)).add(rn.mul(1.2)).sin()).mul(web).mul(smoothstep(0.38, 0.46, hx));      // outer face only
  const h = lipRim.mul(0.008).sub(lipGroove.mul(0.004)).add(lowRim.mul(0.004)).sub(pit.mul(0.016)).add(nrim.mul(0.005))
    .add(brow.mul(0.022)).add(rug.mul(lo ? 0.007 : 0.005)).add(wr.mul(0.005)).add(wc.mul(0.0025));
  const dark = clamp(pit.mul(0.85).add(lipUnder.mul(0.55)).add(gap.mul(0.75)).add(lipGroove.mul(0.12)).add(orbit.mul(0.45)).add(float(1).sub(wr).mul(cz).mul(0.18))
    .add(rug.min(0).negate().mul(0.12)).add(float(1).sub(wc).mul(web).mul(smoothstep(0.38, 0.46, hx)).mul(0.2))
    .add(g(dy.div(0.05)).mul(web).mul(float(1).sub(smoothstep(0.1, 0.4, jaw))).mul(0.5))
    .add(g(dy.div(0.042)).mul(smoothstep(WEBSHEET.cut0 - 0.03, WEBSHEET.cut0 + 0.04, hz)).mul(smoothstep(0.62, 0.42, hz)).mul(0.45)), 0, 0.88);      // the lip faces over the web sheets: shaded, not lit      // the shut corner: a dark line, not a lit seam
  const rgh = web.mul(0.15).add(pit.mul(-0.15)).sub(lipUnder.mul(0.2)).add(rug.abs().mul(0.08)).add(float(1).sub(wr).mul(cz).mul(0.1));
  // inside the mouth (narrower than the lips, within the gape's depth of the mouth line): no silhouette rim there, where a big
  // grazing sheet (the stretched back of the open mouth, seen from below) caught the fog fresnel and went pale
  const wq = float(0.5).sub(hz.clamp(0, 1.7).mul(0.17)), inMouth = smoothstep(wq.sub(0.04), wq.sub(0.1), hx).mul(smoothstep(0.32, 0.22, abs(dy))).mul(smoothstep(-0.3, -0.12, hz)).mul(smoothstep(1.75, 1.55, hz));
  return { h, dark, rgh, inMouth };
}

function skinMaterial(wet, lo, E, NOS, jaw) {
  const m = new THREE.MeshStandardNodeMaterial();
  m.name = 'rexSkin';      // pipeline errors name it (renderPipeline_rexSkin_<id>), and the self-check below looks for it
  const rest = attribute('rest', 'vec3'), rough = attribute('rough', 'float'), small = attribute('scl', 'float'), face = attribute('face', 'float');
  const foldA = attribute('fold', 'float'), foldM = foldA.max(0), foldS = attribute('fs', 'float');
  // the corner web sheets (rexgeo WEBSHEET) carry a negative fold: 1 + w outer face, 3 + w inner, 5 + w rim (w: jaw weight,
  // 0 at the upper lip, 1 at the lower). webT marks them; the face's per-pixel forms (lip gap, shut-corner line) stay off them
  const wc0 = foldA.negate().max(0), webT = smoothstep(0.5, 0.9, wc0), webW = wc0.sub(1).sub(smoothstep(2.5, 2.6, wc0).mul(2)).sub(smoothstep(4.5, 4.6, wc0).mul(2)).clamp(0, 1);
  const webMid = webW.mul(float(1).sub(webW)).mul(4), webOpen = smoothstep(0.08, 0.5, jaw);
  // shut, the sheet lies folded in the corner: two or three soft creases along it (across w), gone as it opens and pulls taut;
  // open, the middle (stretched thinnest) a little paler
  const webCrease = webW.mul(lo ? 14.0 : 19.0).sin().mul(webMid).mul(float(1).sub(webOpen)).mul(webT);
  const webTone = float(1).add(webMid.mul(webOpen).mul(0.18).mul(webT)).sub(webCrease.min(0).negate().mul(0.25));
  const px = fwidth(rest).length();                                     // metres of skin under one pixel
  // a band shows fully while its cell spans more than ~14 px and is gone below ~4.5 px (screen-derivative bump needs room)
  // (gone by ~3.3 px: the fine scales hold to ~6-8 m on a desktop screen; the cells' own jitter keeps that free of moire)
  // (SKIN3: was smoothstep(0.07, 0.3): every band began to go at 14 px a cell, so at 8 m nothing finer than ~15 cm was left)
  const fade = (f) => float(1).sub(smoothstep(0.1, 0.36, px.mul(f)));
  // SKIN3, the hide at range (both tiers). What the fine scales carried, handed to broader forms as they fall below a few
  // pixels: `near` is how much of the fine relief is still on screen (1 close, 0 from ~6-8 m on a desktop). Soft broad relief
  // and tone only, never lines: patches where the scales run larger (a patch field), a network of soft skin folds ~40 cm apart
  // (ridged noise: rounded ridges, wide soft valleys) that gathers at the neck, shoulder, flank and tail base (the fold mask
  // and a broad mask of its own), and a broad tonal break-up that grows as the detail under it goes. Each keeps its own
  // footprint fade, so nothing shimmers once it is smaller than a few pixels
  const near = fade(20.0), farW = float(1).sub(near).mul(0.9).add(0.35);
  const patch = smoothstep(-0.25, 0.35, mx_noise_float(rest.mul(0.9).add(7.1)));                  // 0..1: where the scales run large
  const warpN = mx_noise_float(rest.mul(0.7).add(2.2));
  const ridgeN = mx_noise_float(rest.mul(vec3(2.6, 2.2, 2.6)).add(vec3(warpN.mul(0.8), 0, warpN.mul(0.6))).add(5.5));
  const ridge = smoothstep(0.55, 1.0, float(1).sub(abs(ridgeN)));                                // soft rounded folds
  const fR = fade(2.6);
  // what carries the hide from ~5 to 30 m, where the scales are sub-pixel: tonal mottling (two octaves of broad blotches),
  // faded like everything else by the screen footprint, so zoom and resolution are respected
  const mottle = mx_noise_float(rest.mul(1.3).add(4.4)).add(mx_noise_float(rest.mul(3.1).add(1.2)).mul(0.5).mul(fade(3.1)));
  const body = float(1).sub(face);
  // folds: rolls ~10 cm apart across the bone axis, wandering a little, broad tops and narrower soft creases
  const foldPhase = (warp) => foldS.mul(62.0).add(warp);
  const foldProfile = (ph) => smoothstep(-1.0, 0.55, ph.sin());
  const sX = positionView.dFdx(), sY = positionView.dFdy(), N = normalView;
  const R1 = cross(sY, N), R2 = cross(N, sX), det = dot(sX, R1).mul(faceDirection);
  const bump = (h) => normalize(abs(det).mul(N).sub(R1.mul(h.dFdx()).add(R2.mul(h.dFdy())).mul(sign(det))));
  // geometric specular anti-aliasing: where the surface normal turns fast across a pixel (the jaw, lips, throat creases
  // at range) widen the highlight instead of letting it break into bright stair-stepped flecks
  const nVar = fwidth(normalView).length();
  const V = normalize(cameraPosition.sub(positionWorld)), fr = pow(float(1).sub(clamp(dot(normalWorld, V), 0, 1)), 4);
  if (lo) {
    // phones: one cell field (pebbles, coarser than the high tier's), the folds (a sine: nearly free), no undulation
    // phones: pebbles on the body; on the head, where the player looks from a metre or two, a finer field of its own with
    // flat scutes along the lips, snout and brow; folds (a sine: nearly free); no undulation
    const FB = 12.0, FA = 21.0, scuteA = attribute('scute', 'float'), scute = scuteA.max(0), horn = scuteA.negate().clamp(0, 1);
    const cell = mx_worley_noise_float(rest.mul(FB).add(1.7)), fcell = mx_worley_noise_float(rest.mul(FA).add(5.3)), fC = fade(FB), fA = fade(FA);
    const peb = float(1).sub(smoothstep(0.08, 0.95, cell)), pebA = float(1).sub(smoothstep(0.05, 0.9, fcell));
    const scP = smoothstep(0.08, 0.5, fcell).oneMinus().mul(0.5).add(smoothstep(0.3, 0.6, fcell).oneMinus().mul(0.5));      // flatter-topped plates
    const wob = rest.x.mul(9.0).add(rest.y.mul(7.0)).sin().mul(1.2).add(rest.z.mul(4.0).add(rest.y.mul(5.0)).sin().mul(1.6));
    const fF = fade(14.0), folds = foldProfile(foldPhase(wob)).mul(foldM).mul(fF).mul(body).mul(smoothstep(-0.9, 0.6, rest.z.mul(6.0).add(rest.x.mul(5.0)).sin()));
    // the underside (under the jaw, throat, neck, chest, belly): larger, flatter scales than the flank's pebbles, in an
    // irregular cell field like the flank's (regular transverse rows and throat wrinkles read as corrugation, and from
    // the front as rings round the neck). Mostly seen against the sky, lit only by ambient: the relief is repeated, faintly,
    // in tone, roughness and the ambient term
    const nb = attribute('normal', 'vec3'), ven = smoothstep(-0.15, -0.55, nb.y);
    const vcell = mx_worley_noise_float(rest.mul(8.0).add(vec3(3.3, 1.1, 7.7))), fV = fade(8.0);
    const plate = float(1).sub(smoothstep(0.35, 0.95, vcell)), vMask = ven.mul(fV);
    const hVen = plate.mul(0.004).mul(vMask);
    const vGroove = float(1).sub(plate).mul(0.3).mul(vMask).clamp(0, 1);
    // head scales: a larger field with more relief than before (it filtered to nothing at 1.5-3 m on a phone), and the
    // per-pixel face forms on top, faded only well beyond the distance anyone reads a face
    const HD0 = headDetail(attribute('hp', 'vec3'), scute, E, NOS, true, jaw), fH = fade(5.0), noWeb = float(1).sub(webT);
    const HD = { h: HD0.h.mul(noWeb), dark: HD0.dark.mul(noWeb), rgh: HD0.rgh.mul(noWeb), inMouth: max(HD0.inMouth.mul(noWeb), webT) };      // (no fog-fresnel rim on the webs: seen edge-on they lit up as pale ribbons)
    const hFace = mix(pebA.mul(0.0055), scP.mul(0.006), scute).mul(fA).add(HD.h.mul(fH)).add(webCrease.mul(0.004));
    const foldZone = smoothstep(0.0, 0.35, foldM).mul(0.6).add(0.4);
    const hMacro = ridge.mul(0.022).mul(fR).mul(foldZone).mul(farW).mul(body).add(patch.mul(peb).mul(0.006).mul(fade(FB * 0.5)).mul(body));
    const h = mix(peb.mul(0.009).mul(fC), hFace, face).add(folds.mul(0.006)).add(hVen).add(hMacro);
    m.normalNode = bump(h.mul(float(1).sub(horn.mul(0.9))));
    const dl = mix(peb.mul(fC), mix(pebA, scP, scute).mul(fA), face);
    const tint = float(1).add(dl.sub(0.5).mul(mix(float(0.08), float(0.2), face))).add(mottle.mul(float(0.08).add(float(1).sub(near).mul(0.14))).mul(body))
      .add(patch.sub(0.5).mul(0.16).mul(body)).sub(float(1).sub(ridge).mul(0.15).mul(fR).mul(farW).mul(body)).sub(float(1).sub(folds).mul(foldM).mul(fF).mul(0.03)).mul(float(1).sub(HD.dark.mul(face))).mul(float(1).sub(vGroove.mul(0.22)));
    m.colorNode = vertexColor().mul(tint).mul(webTone).mul(1.3).mul(mix(float(1), float(0.82), wet));
    m.roughnessNode = clamp(rough.add(0.04).add(HD.rgh.mul(face)).add(vGroove.mul(0.12)).add(float(0.5).sub(dl).mul(0.1).mul(face)).sub(wet.mul(0.2)).add(float(1).sub(fC).mul(0.08)).add(nVar.mul(0.6)), 0.42, 1);
    m.metalness = 0;
    // plus a modest lift on the shadowed underside (sky bounce), carrying the scute grooves so the relief reads against a bright sky
    m.emissiveNode = vec3(WEATHER.fog).mul(fr).mul(mix(float(0.26), float(0.45), wet)).mul(float(1).sub(HD.inMouth))
      .add(vertexColor().mul(vec3(WEATHER.fog)).mul(normalWorld.y.mul(0.5).add(0.5)).mul(0.2))
      .add(vertexColor().mul(vec3(WEATHER.fog)).mul(clamp(normalWorld.y.negate(), 0, 1)).mul(0.22).mul(float(1).sub(vGroove.mul(0.7))).mul(float(1).sub(HD.dark.mul(face))));
    return m;
  }
  const scuteA = attribute('scute', 'float'), scute = scuteA.max(0), horn = scuteA.negate().clamp(0, 1);      // a negative scute marks claw horn
  // three fixed-frequency cell fields blended by region (a frequency that varied across the body would shear the cells
  // wherever it changed): big pebbles ~5 cm, fine ~2.4 cm, face ~2.2 cm
  const FB = 20.0, FF = 42.0, FA = 46.0;
  const big = mx_worley_noise_vec2(rest.mul(FB).add(1.7)), fine = mx_worley_noise_float(rest.mul(FF).add(3.1)), fc = mx_worley_noise_float(rest.mul(FA).add(5.3));
  const und = mx_noise_float(rest.mul(3.3).add(9.0));                   // broad lumps, and what makes the folds and scale prominence wander
  const fB = fade(FB), fN = fade(FF), fA = fade(FA), fU = fade(3.3), fF = fade(14.0);
  // a tubercle: domed, with a soft groove where it meets its neighbour (F2 - F1 small); slightly irregular because the
  // cell points are jittered and their prominence wanders with the undulation field
  const edge = big.y.sub(big.x);
  const tub = smoothstep(0.0, 0.35, edge).mul(0.25).add(float(1).sub(smoothstep(0.0, 0.85, big.x)).mul(0.75));
  const prom = und.mul(0.5).add(0.75).clamp(0.35, 1.15);
  const pebF = float(1).sub(smoothstep(0.05, 0.9, fine)), pebA = float(1).sub(smoothstep(0.05, 0.9, fc));
  const scutePlate = smoothstep(0.0, 0.3, edge).mul(scute);            // flat plates with crisp joints along the snout and lips
  const hBody = mix(tub.mul(prom).mul(0.0062).mul(fB), pebF.mul(0.0034).mul(fN), small)
    .add(pebF.mul(0.0014).mul(fN).mul(float(1).sub(small)));            // little scales packed between the big ones
  const HD0 = headDetail(attribute('hp', 'vec3'), scute, E, NOS, false, jaw), fH = fade(5.0), noWeb = float(1).sub(webT);
  const HD = { h: HD0.h.mul(noWeb), dark: HD0.dark.mul(noWeb), rgh: HD0.rgh.mul(noWeb), inMouth: max(HD0.inMouth.mul(noWeb), webT) };      // (no fog-fresnel rim on the webs: seen edge-on they lit up as pale ribbons)
  const hFace = mix(pebA.mul(0.0026).mul(fA), scutePlate.mul(0.0032).mul(fB), scute).add(HD.h.mul(fH)).add(webCrease.mul(0.003));
  // folds wander (two crossed sines and the lump field bend each crease) and come and go along their length, so they read
  // as bunched skin rather than ribbing
  const wob = rest.x.mul(9.0).add(rest.y.mul(7.0)).sin().mul(1.2).add(rest.z.mul(4.0).add(rest.y.mul(5.0)).sin().mul(1.6)).add(und.mul(3.5));
  const folds = foldProfile(foldPhase(wob)).mul(foldM).mul(fF).mul(smoothstep(-0.35, 0.45, und.add(rest.z.mul(6.0).add(rest.x.mul(5.0)).sin().mul(0.35))));
  // the mid layer: large plates (~16 cm, the pebbles gathered into rosettes and plates by shallow grooves), and the folds
  // grouped into wrinkle fields; it shows from ~2 m (where the fine relief is fading) out to ~30 m
  // Broad soft swells, never outlines: a groove network read as cracked mud. The plate joints keep a quarter of their depth,
  // and only on the back and flanks (none on the belly, chest front or throat); the plates' interiors vary in tone and roughness
  const mid = mx_worley_noise_vec2(rest.mul(6.0).add(2.9)), fM = fade(6.0), midJ = float(1).sub(smoothstep(0.0, 0.22, mid.y.sub(mid.x)));
  const midS = float(1).sub(smoothstep(0.0, 0.9, mid.x)), dors = smoothstep(-0.35, 0.05, attribute('normal', 'vec3').y);
  // the scales in large patches: a coarser cell field (~9 cm) that shows where `patch` is high, and from range everywhere a little
  const bigC = mx_worley_noise_float(rest.mul(11.0).add(6.6)), fBC = fade(11.0), bigT = float(1).sub(smoothstep(0.05, 0.9, bigC));
  const foldZone = smoothstep(0.0, 0.35, foldM).mul(0.6).add(0.4);
  const hMacro = ridge.mul(0.022).mul(fR).mul(foldZone).mul(farW)
    .add(bigT.mul(0.008).mul(fBC).mul(patch.mul(0.75).add(float(1).sub(near).mul(0.25))))
    .add(midS.mul(0.0035).sub(midJ.mul(0.0012).mul(dors)).mul(fM).mul(float(1).sub(near).mul(0.6).add(0.4)));
  const h = mix(hBody, hFace, face).add(folds.mul(0.0065).mul(body)).add(und.mul(0.012).mul(fU).mul(body))
    .add(hMacro.mul(body));
  m.normalNode = bump(h.mul(float(1).sub(horn.mul(0.9))));
  // colour: scale tops a shade lighter (worn), interstices a shade darker; a few percent, never lines
  const detail = mix(mix(tub.mul(fB), pebF.mul(fN), small), pebA.mul(fA), face);
  const tint = float(0.97).add(detail.sub(0.5).mul(mix(float(0.08), float(0.14), face))).add(mottle.mul(float(0.09).add(float(1).sub(near).mul(0.14))).mul(body)).add(midS.sub(0.5).mul(0.06).mul(fM).mul(body))
    .add(patch.sub(0.5).mul(0.16).mul(body)).add(bigT.sub(0.5).mul(0.05).mul(fBC).mul(patch).mul(body)).sub(float(1).sub(ridge).mul(0.15).mul(fR).mul(farW).mul(body)).sub(float(1).sub(folds).mul(foldM).mul(fF).mul(0.035)).add(und.mul(0.05)).mul(float(1).sub(HD.dark.mul(face)));
  m.colorNode = vertexColor().mul(tint).mul(webTone).mul(1.3).mul(mix(float(1), float(0.82), wet));
  // roughness: tops a little smoother (they shine first when wet), grooves rougher; faded bands hand their lost normal
  // variance to the roughness, and so does fast-turning geometry
  const lost = float(1).sub(mix(mix(fB, fN, small), fA, face));
  m.roughnessNode = clamp(rough.add(HD.rgh.mul(face)).add(float(0.5).sub(detail).mul(0.12)).add(float(0.5).sub(midS).mul(0.06).mul(fM).mul(body)).sub(wet.mul(0.2)).add(lost.mul(0.1)).add(nVar.mul(0.6)), 0.38, 1);
  m.metalness = 0;
  // the air around it: a thin fresnel of fog colour at the silhouette, so a dark wet hide still reads against the storm
  // (not in the face's own occluded places: lip gap, nostrils, the shut mouth corner, where a grazing crease lit up as a pale seam)
  m.emissiveNode = vec3(WEATHER.fog).mul(fr).mul(mix(float(0.12), float(0.35), wet)).add(vec3(0.7, 0.75, 0.9).mul(WEATHER.flash).mul(fr).mul(0.3)).mul(float(1).sub(HD.dark.mul(face))).mul(float(1).sub(HD.inMouth));
  return m;
}

function irisTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#2a1d0c'; g.fillRect(0, 0, 256, 128);
  const cx = 64, cy = 64, gr = g.createRadialGradient(cx, cy, 3, cx, cy, 44);
  // EYES: a brighter amber iris (it was a dull brown that merged with the pupil and the lids' shade beyond ~8 m)
  gr.addColorStop(0, '#e2b24c'); gr.addColorStop(0.35, '#c8902f'); gr.addColorStop(0.75, '#8a5a1a'); gr.addColorStop(1, '#2a1a08');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 44, 0, 7); g.fill();
  g.strokeStyle = 'rgba(60,30,5,0.5)'; g.lineWidth = 1;
  for (let a = 0; a < 6.28; a += 0.12) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); g.lineTo(cx + Math.cos(a + 0.05) * 42, cy + Math.sin(a + 0.05) * 42); g.stroke(); }
  for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, r0 = 10 + Math.random() * 30; g.fillStyle = Math.random() < 0.5 ? 'rgba(255,200,90,0.25)' : 'rgba(70,35,5,0.3)'; g.fillRect(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, 2, 2); }
  g.strokeStyle = 'rgba(20,10,2,0.9)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 43, 0, 7); g.stroke();      // dark limbal ring
  g.fillStyle = '#030202'; g.beginPath(); g.ellipse(cx, cy, 12, 14, 0, 0, 7); g.fill();     // a round pupil (~17 x 20 degrees of the ball): big enough to read at 8-20 m, still a hunter's eye
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Teeth (and, in the lower set, the tongue) from the sockets the skin builder found along each lip line.
// T. rex teeth are thick, recurved cones, barely flattened; ivory crowns stained toward the gum.
function teethGeometry(sockets, upper, ridge) {
  const parts = [], cols = [], C = (h) => new THREE.Color(h);
  const ROOT = C(0x8a6a50), STAIN = C(0xa48c66), CROWN = C(0xc2ad84), TIP = C(0xe0d3b0), GUMC = C(0x5a4240);      // aged ivory, stained toward the gum
  const base = new THREE.ConeGeometry(1, 1, 10, 6, true); base.rotateX(Math.PI); base.translate(0, -0.5, 0);          // root at y=0, tip at y=-1
  let seed = upper ? 7 : 13; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  void cols;
  // each socket is where the crown leaves this tier's gum (rexgeo samples the built mesh); the root runs on up (or down) into
  // the jaw from there, straight, so the tooth grows out of the skin with no gap and no exposed root, whatever the grid did
  for (const [x0, yS, z0, len00, rad0, nx, nz] of sockets) for (const sd of [1, -1]) {
    const rad = rad0, len = len00 * (0.85 + 0.3 * rnd()), sink = 0.035 + rad * 0.5, Lt = len + sink;
    const t = base.clone(), p = t.attributes.position, a = Math.atan2(-nz, nx * sd), lean = (rnd() - 0.5) * 0.2, out = (rnd() - 0.3) * 0.08;
    const ca = Math.cos(a), sa = Math.sin(a), col = [], bend = 0.24 + 0.1 * rnd();
    for (let i = 0; i < p.count; i++) {
      const f = -p.getY(i), d = f * Lt - sink, fc = Math.max(0, d / len);      // fc: 0 at the gum, 1 at the tip; the buried root is d < 0
      let lx = p.getX(i) * rad * 0.8, lz = p.getZ(i) * rad;
      // full width at and under the gum, a little swelling just out of it, then the taper to the point
      const sw = upper ? (1 + 0.14 * Math.sin(Math.min(1, fc * 1.8) * Math.PI)) * (1 - 0.4 * fc * fc) : (1 + 0.1 * Math.sin(Math.min(1, fc * 1.8) * Math.PI)) * (1 - 0.45 * fc * fc);
      lx *= sw; lz *= sw;
      let wx = lx * ca + lz * sa, wz = -lx * sa + lz * ca;
      wz -= bend * len * fc * fc - (lean + 0.08) * len * fc;    // recurved: bowed forward out of the gum, hooked back toward the throat at the tip
      wx -= sd * ((0.06 + 0.05 - out) * len * fc * fc + 0.05 * len * fc);      // and leaning in toward the midline
      p.setXYZ(i, x0 * sd + wx, upper ? yS + sink - f * Lt : yS - sink + f * Lt, z0 + wz);
      const c = d < 0 ? ROOT.clone() : fc < 0.12 ? STAIN.clone().lerp(CROWN, fc / 0.12) : CROWN.clone().lerp(TIP, (fc - 0.12) / 0.88);
      col.push(c.r, c.g, c.b);
    }
    t.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (!upper) { const ix = t.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } }   // the lower cone is mirrored in y: restore its winding, or its normals point inward and it renders black
    t.computeVertexNormals();
    // inside-out check: each ring's normals must point away from the ring's centre. A bent, mirrored cone can come out
    // wound the wrong way, and then it is lit from inside and reads as a flat paper card; turn any such tooth right side out
    { const nn = t.attributes.normal, row = 11; let out = 0;
      for (let r = 0; r * row < p.count; r++) { let cx = 0, cy = 0, cz = 0; for (let j = 0; j < row; j++) { const i = r * row + j; cx += p.getX(i); cy += p.getY(i); cz += p.getZ(i); }
        cx /= row; cy /= row; cz /= row; for (let j = 0; j < row; j++) { const i = r * row + j; out += (p.getX(i) - cx) * nn.getX(i) + (p.getY(i) - cy) * nn.getY(i) + (p.getZ(i) - cz) * nn.getZ(i); } }
      if (out < 0) { const ix = t.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } t.computeVertexNormals(); } }
    parts.push(t.toNonIndexed());
  }
  // the gum: one continuous ridge along the row, from the back of one side round the front to the other, half sunk in the
  // jaw's skin and filling out from the tooth line to just inside the lip, so every crown comes out of the same wet gum
  if (ridge && ridge.length > 2) {
    const path = [...ridge.map((r) => [-r[0], r[1], r[2], -r[3], r[4], r[5]]), ...ridge.slice().reverse().slice(1)];
    const R = 10, pos = [], col = [], idx = [], hgt = upper ? 0.012 : 0.011;
    for (let k = 0; k < path.length; k++) {
      const [x, y0, z, nx, nz, ins] = path[k], w = ins * 0.7, y = y0 + (upper ? 1 : -1) * 0.006;      // a low ridge, mostly sunk, flush with the jaw
      for (let j = 0; j < R; j++) {
        const th = (j / R) * Math.PI * 2, cx = Math.cos(th), cy = Math.sin(th);
        pos.push(x + nx * w * cx, y + cy * hgt, z + nz * w * cx);
        const m = Math.sin(x * 61 + z * 37) * Math.sin(z * 83 - x * 29), c = GUMC.clone().multiplyScalar(0.62 + 0.1 * (upper ? -cy : cy) + 0.12 * m); col.push(c.r, c.g, c.b);      // dark, mottled
      }
      if (k > 0) for (let j = 0; j < R; j++) { const a0 = (k - 1) * R + j, a1 = (k - 1) * R + (j + 1) % R, b0 = k * R + j, b1 = k * R + (j + 1) % R; idx.push(a0, b0, a1, a1, b0, b1); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); rg.setIndex(idx);
    rg.computeVertexNormals();
    { const nn = rg.attributes.normal, pp = rg.attributes.position; let o = 0; for (let k = 0; k < path.length; k++) for (let j = 0; j < R; j++) { const i = k * R + j; o += (pp.getX(i) - path[k][0]) * nn.getX(i) + (pp.getY(i) - path[k][1]) * nn.getY(i) + (pp.getZ(i) - path[k][2]) * nn.getZ(i); }
      if (o < 0) { const ix = rg.index.array; for (let i = 0; i < ix.length; i += 3) { const q = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = q; } rg.computeVertexNormals(); } }
    parts.push(rg.toNonIndexed());
  }
  const tparts = [];
  if (!upper) {      // a thick, fleshy tongue lies in the trough of the mouth floor and runs back into the throat
    for (const [sx, sy, sz, y, z, hex] of [[0.17, 0.065, 0.5, mouthY(0.85) - 0.1, 0.82, 0x55291f], [0.16, 0.085, 0.32, mouthY(0.35) - 0.17, 0.32, 0x4a2220]]) {
      const t = new THREE.SphereGeometry(1, 14, 8); t.scale(sx, sy, sz); t.translate(0, y, z);
      const col = [], p = t.attributes.position;
      for (let i = 0; i < p.count; i++) { const c = C(hex).multiplyScalar(0.75 + 0.35 * Math.max(0, (p.getY(i) - y) / sy)); col.push(c.r, c.g, c.b); }
      t.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); t.deleteAttribute('uv'); tparts.push(t.toNonIndexed());
    }
  }
  const merge = (parts) => { const g = new THREE.BufferGeometry(), cnt = parts.reduce((s, p) => s + p.attributes.position.count, 0);
    const pos = new Float32Array(cnt * 3), nrm = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3); let o = 0;
    for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nrm.set(p.attributes.normal.array, o * 3); col.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g; };
  const g = merge(parts); if (tparts.length) g.userData.tongue = merge(tparts);
  return g;
}

// EYELIDS FOLLOW THE BALL (16 Nov): the lids used to swing about a horizontal axis fixed in the skull (17 degrees out), so
// their widest parting stayed there while the ball turned: 15 degrees off the rest gaze the pupil was 13-17 degrees from the
// middle of the opening (up/down it was cut by a lid: 30 degrees up the upper lid hid 76% of the pupil). Now the pivot axis and
// the centre of the opening are carried by `lidDir`, a damped, weighted copy of the ball's look direction (never 1:1: the lids
// lag and fall short of the eye a little, as real ones do), clamped about the resting gaze so they never leave the socket.
const LID_FOLLOW = 0.8;       // 0..1: how much of the ball's turn sideways the opening takes (0 = fixed in the skull, 1 = glued to the pupil)
const LID_FOLLOW_UP = 0.9;    // the same up and down: upper lids track vertical gaze more closely than sideways
const LID_TAU = 0.1;          // s: time constant of the lids easing after the ball (a saccade is over before they have moved much)
const LID_YAW_MAX = 0.45, LID_PITCH_MAX = 0.4;     // rad: furthest the opening's centre may leave the resting gaze (no gap at brow or cheek)
const LID_CANT = 0;           // rad: outer corner raised about the lid's own axis (the rim line is level in the skull at 0)

export class RexBody {
  constructor(Q = { tier: 'high' }) {
    const lo = Q.tier === 'low';
    this.group = new THREE.Group();
    const bindSim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 });
    const geo = buildRexGeometry(bindSim.pose, { cell: lo ? 0.0725 : 0.04 }), paint = paintRex(geo, { lo });
    this.stats = geo.stats;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(geo.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(geo.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(paint.color, 3));
    // review aid (LEGDEFORM): '-dbgw' / '&dbgw' in the URL hash colours the skin by its bone weights (each vertex the weighted mix of its
    // bones' colours): spine, tail and pelvis grey, femur red, tibia green, metatarsus blue, proximal toes yellow, distal toes magenta,
    // arms cyan, neck and head pale; the femur's twist bone orange. Hard colour edges are hard weight edges
    if (typeof location !== 'undefined' && location.hash.includes('dbgw')) {
      const n = geo.position.length / 3, c = new Float32Array(n * 3), col = (b) => {
        if (b < BONE.SKULL) return b === 13 ? [0.75, 0.75, 0.75] : [0.42, 0.42, 0.42];
        if (b >= BONE.leg(0, 0) && b < BONE.leg(0, 0) + 18) { const j = (b - BONE.leg(0, 0)) % 9; return j === 0 ? [0.9, 0.08, 0.05] : j === 1 ? [0.1, 0.8, 0.1] : j === 2 ? [0.1, 0.25, 0.95] : j < 6 ? [0.95, 0.9, 0.1] : [0.9, 0.1, 0.9]; }
        if (b >= BONE.arm(0, 0) && b < BONE.arm(0, 0) + 4) return [0.1, 0.85, 0.9];
        if (BONE.twist && (b === BONE.twist(0) || b === BONE.twist(1))) return [1.0, 0.55, 0.0];
        return [0.85, 0.82, 0.75]; };
      for (let i = 0; i < n; i++) for (let q = 0; q < 4; q++) { const w = geo.skinWeight[i * 4 + q]; if (!(w > 0)) continue; const k = col(geo.skinIndex[i * 4 + q]); for (let e = 0; e < 3; e++) c[i * 3 + e] += w * k[e] * k[e]; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    // The hide's own per-vertex data rides ONE interleaved vertex buffer. WebGPU allows only 8 vertex buffers per pipeline
    // (the default limit), and as 13 separate attributes the skin needed 12 (its shadow pass 11): on real WebGPU both
    // pipelines failed validation and the body vanished, leaving the eyes and teeth. WebGL2 (16 attributes) never noticed.
    // Now: position, normal, color, this, skinIndex, skinWeight = 6 buffers. The attribute names are unchanged.
    {
      const n = geo.position.length / 3, S = 12, a = new Float32Array(n * S), P = geo.restTex || geo.position, H = geo.headPos;
      const one = [paint.rough, paint.scl, paint.face, paint.scute, paint.fold, paint.fs];
      for (let i = 0; i < n; i++) {
        const o = i * S;
        a[o] = P[i * 3]; a[o + 1] = P[i * 3 + 1]; a[o + 2] = P[i * 3 + 2];
        a[o + 3] = H[i * 3]; a[o + 4] = H[i * 3 + 1]; a[o + 5] = H[i * 3 + 2];
        for (let k = 0; k < 6; k++) a[o + 6 + k] = one[k][i];
      }
      const ib = new THREE.InterleavedBuffer(a, S);
      g.setAttribute('rest', new THREE.InterleavedBufferAttribute(ib, 3, 0));
      g.setAttribute('hp', new THREE.InterleavedBufferAttribute(ib, 3, 3));
      ['rough', 'scl', 'face', 'scute', 'fold', 'fs'].forEach((k, j) => g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, 1, 6 + j)));
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(geo.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(geo.skinWeight, 4));
    // WebGPU's default limit is 8 vertex buffers per pipeline; the skin (and its shadow pass, a subset) must stay within it on
    // every tier. Upper bound: every distinct buffer behind the geometry's attributes (interleaved views share one)
    this.vbufStatic = vertexBufferCount(g);
    if (this.vbufStatic > MAX_VBUF) console.error(`[body check] the T. rex skin geometry needs ${this.vbufStatic} vertex buffers (WebGPU allows ${MAX_VBUF}): ${Object.keys(g.attributes).join(',')}`);
    g.setIndex(new THREE.BufferAttribute(geo.index, 1));
    this.wet = uniform(0); this.jawU = uniform(0);      // the jaw's opening (PS.JAW): the corner webs' creases smooth out as it opens
    this.bones = Array.from({ length: BONE_COUNT }, () => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; this.group.add(b); return b; });
    const inv = geo.bind.map((m) => m.clone().invert());
    this.skeleton = new THREE.Skeleton(this.bones, inv);
    // review aid: '-dbggrey' in the URL hash renders the hide as plain grey (pure geometry), '-dbgnrm' as geometry normals
    const dbg = typeof location !== 'undefined' ? location.hash : '';
    const skinMat = dbg.includes('dbgw') ? new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }) : dbg.includes('dbggrey') ? new THREE.MeshStandardNodeMaterial({ color: 0x8a8a8a, roughness: 0.8, metalness: 0 })
      : dbg.includes('dbgnrm') ? new THREE.MeshNormalNodeMaterial() : skinMaterial(this.wet, lo, geo.eye || EYE, geo.nostril, this.jawU);
    this.mesh = new THREE.SkinnedMesh(g, skinMat);
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.mats = Array.from({ length: BONE_COUNT }, () => new THREE.Matrix4());

    // teeth on the skull and jaw, eyes in their sockets
    // teeth, eyes and lids are lit like the hide: the same lights, fog and received shadow (they used to cast but not
    // receive, so they glowed in the shade of the head and under the torch), and enamel no glossier than wet skin
    const toothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });      // a little sheen runs down each crown and shows it is round
    const mk = (geom, mat) => { const m = new THREE.Mesh(geom, mat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; this.group.add(m); return m; };
    this.upperTeeth = mk(teethGeometry(geo.teeth.upper, true, geo.teeth.ridge && geo.teeth.ridge.upper), toothMat);
    this.lowerTeeth = mk(teethGeometry(geo.teeth.lower, false, geo.teeth.ridge && geo.teeth.ridge.lower), toothMat);
    const tongueG = this.lowerTeeth.geometry.userData.tongue;
    if (tongueG) { this.tongue = mk(tongueG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, color: 0x9a8a88 })); this.tongue.castShadow = false; }
    // teeth receive the head's shadow but cast none: cones a few cm across are below a shadow texel and only shadow-acne each other
    this.upperTeeth.castShadow = false; this.lowerTeeth.castShadow = false;
    const EY = geo.eye || { x: EYE.x, y: EYE.y, z: EYE.z, r: EYE.r };
    const eyeMat = new THREE.MeshPhysicalNodeMaterial({ map: irisTexture(), roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06, });
    // EYES2: a small, soft glint fixed in view space ~27 deg up and a little left of where the ball faces the camera (on the
    // upper cornea, above a pupil turned toward you), and masked off the pupil disc and its rim in the ball's own frame
    // (normalLocal.z: the pupil is the ball's +z, half-size ~17 x 20 deg), so it can never sit on the pupil whichever way the
    // eye turns. (14 Nov's glint sat 15 deg off, inside a pupil looking at you, and hid it.)
    eyeMat.emissiveNode = vec3(1, 0.97, 0.9).mul(pow(max(dot(normalView, normalize(vec3(-0.15, 0.42, 0.9))), 0), 300).mul(0.45)).mul(smoothstep(0.93, 0.87, normalLocal.z));
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x4d4430, roughness: 0.85 });
    // eyelids: a thick, scaly shell over the top and another under the ball, each with a rolled rim; they swing
    // about the eye's horizontal axis to open, blink, droop and squint, leaving an almond opening between them
    const r = EYE.r, Rl = r * 1.16, prof = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.002, Rl * Math.sin(a)), Rl * Math.cos(a))); }
    prof.push(new THREE.Vector2(Rl + r * 0.06, -r * 0.12), new THREE.Vector2(Rl - r * 0.06, -r * 0.27), new THREE.Vector2(Rl - r * 0.3, -r * 0.16), new THREE.Vector2(Rl - r * 0.34, r * 0.1));
    prof.reverse();     // the lathe faces outward when the profile runs bottom to top
    const upperLid = new THREE.LatheGeometry(prof, 18), lowerLid = upperLid.clone().rotateZ(Math.PI);
    const browG = new THREE.SphereGeometry(1, 12, 8);
    this.eyes = [1, -1].map((sd) => {
      const e = mk(new THREE.SphereGeometry(EYE.r, 20, 14), eyeMat);
      const lid = mk(upperLid, lidMat), lidLo = mk(lowerLid, lidMat), brow = mk(browG, lidMat);
      // the orbit faces forward and out (EYE.yaw, ~34 degrees): each eye sees ~62 degrees either side of its axis,
      // so the two fields overlap by ~55 degrees straight ahead, as in the skull
      const local = new THREE.Matrix4().makeRotationY(sd * (EYE.yaw ?? 0.6)).multiply(new THREE.Matrix4().makeRotationX(-0.06)).setPosition(sd * EY.x, EY.y, EY.z);
      const rest = new THREE.Vector3(0, 0, 1).applyMatrix4(new THREE.Matrix4().extractRotation(local));
      // EYES: the lids and brow face 17 degrees out (EYE_AIM.lidYaw), not the orbit's 34, so their opening is widest where the
      // ball looks when it stares ahead (at 34 the upper lid's rim cut off the top of a pupil turned toward someone in front)
      const lidLocal = new THREE.Matrix4().makeRotationY(sd * EYE_AIM.lidYaw).multiply(new THREE.Matrix4().makeRotationX(-0.06)).setPosition(sd * EY.x, EY.y, EY.z);
      const lidRest = eyeAim(new THREE.Vector3().setFromMatrixPosition(local), local, sd, null, new THREE.Vector3());     // the ball's own resting gaze, in head space
      return { e, lid, lidLo, brow, local, lidLocal, sd, cu: 0, cl: 0, sq: 0, rest, dir: rest.clone(), pos: new THREE.Vector3(), sac: new THREE.Vector3(), lidRest, lidDir: lidRest.clone() };
    });
    this.glareEye = null;     // optional per-eye dazzle from the mind ({1: left, -1: right}, 0..1): the lids follow each eye separately
    this.glare = 0;     // optional outside drive for the squint (0..1), on top of the pose's SQUINT
    this._t = new THREE.Matrix4(); this._hi = new THREE.Matrix4(); this._d = new THREE.Vector3(); this._o = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0); this._lm = new THREE.Matrix4(); this._lf = new THREE.Matrix4(); this._lk = 1;
    this.fix = null; this._sacT = 0; this._sacV = new THREE.Vector3(); this.nostril = new THREE.Vector3(); this.snout = new THREE.Vector3(0, 0, 1);
  }

  /** Fed by main.js each frame (jaw-from-voice): voiceJaw = audio.mouthOpen (0..1), voiceFast = audio.mouthFast (open plus flutter), jawHold = the sim is biting or holding something. */
  voiceJaw = 0; voiceFast = 0; jawHold = false;
  setWet(k) { this.wet.value = k; }

  update(pose) {
    // jaw-from-voice: the drawn jaw is the larger of the sim's and what the sound being made asks for (audio.mouthOpen, which leads the sound by MOUTH_LEAD), with the
    // roar's fast tremolo on top. Never against a bite: `jawHold` (set by main.js while something is held or a strike/seize/snap is under way) and a jaw the sim is
    // closing fast both shut the voice out at once; it comes back over ~80 ms.
    const sj = pose.s[PS.JAW] || 0, nw = performance.now(), jdt = Math.max(1e-3, Math.min(0.1, (nw - (this._jT ?? nw - 16)) / 1000)); this._jT = nw;
    const closing = (sj - (this._jP ?? sj)) / jdt < -1.2; this._jP = sj;
    if (this.jawHold || closing) this._vk = 0; else this._vk = Math.min(1, (this._vk ?? 1) + jdt / 0.08);
    const vo = this.voiceJaw || 0; let ja = null;
    if (vo > 0.004 && this._vk > 0) ja = Math.max(sj, this._vk * jawFromVoice(vo, (this.voiceFast || 0) - vo));
    boneMatrices(pose, this.mats, ja);
    for (let i = 0; i < BONE_COUNT; i++) { const b = this.bones[i]; b.matrix.copy(this.mats[i]); b.matrixWorldNeedsUpdate = true; }
    const H = this.mats[BONE.SKULL], Jm = this.mats[BONE.JAW];
    this.upperTeeth.matrix.copy(H); this.upperTeeth.matrixWorldNeedsUpdate = true;
    this.lowerTeeth.matrix.copy(Jm); this.lowerTeeth.matrixWorldNeedsUpdate = true;
    if (this.tongue) { this.tongue.matrix.copy(Jm); this.tongue.matrixWorldNeedsUpdate = true; }
    this.nostril.set(0, 0.22, 1.74).applyMatrix4(H); this.snout.set(0, -0.35, 1).normalize().transformDirection(H);
    this.jawU.value = ja ?? sj;
    const S = pose.s, blink = S[PS.BLINK] > 0.5 ? 1 : 0, rd = (i) => (i !== undefined && S.length > i ? S[i] || 0 : 0);
    const squint0 = Math.min(1, Math.max(rd(PS.SQUINT), this.glare || 0)), droop = rd(PS.LID);
    this._hi.copy(H).invert();
    // saccades: every so often both eyes jump a little (a few degrees) and hold; between jumps they are still
    const now = performance.now() / 1000;
    if (now > this._sacT) { this._sacT = now + 0.35 + Math.random() * 1.6; this._sacV.set((Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.05, 0); }
    this._ek = 1 - Math.exp(-55 * Math.min(0.25, Math.max(0, now - (this._eT ?? now - 1 / 60)))); this._eT = now; this._lk = 1 - Math.exp(-Math.min(0.25, Math.max(0, now - (this._lT ?? now - 1 / 60))) / LID_TAU); this._lT = now;
    const GE = this.glareEye, gmax = GE ? Math.max(GE[1] || 0, GE[-1] || 0) : 0;
    for (const E of this.eyes) {
      // the pose's squint is shared; while a beam dazzles, the lit eye screws shut and the shaded one only partly
      const squint = gmax > 0.05 ? squint0 * (0.45 + 0.55 * Math.min(1, (GE[E.sd] || 0) / gmax)) : squint0;
      // EYES (14 Nov): each ball turns about its own centre along its own line to the fixation point (so the two converge
      // on a near face), within EYE_AIM's limits; the head does the rest (rexgeo.js eyeAim). The old clamp to 7 degrees off
      // the 34-degree-outward orbit left both pupils ~30 degrees outward of a player it stared at.
      E.pos.setFromMatrixPosition(E.local);
      eyeAim(E.pos, E.local, E.sd, this.fix ? (this._fl || (this._fl = new THREE.Vector3())).copy(this.fix).applyMatrix4(this._hi) : null, this._d);
      // fixating, the saccades are small (+-1.3 x +-0.8 degrees): a stare that wanders by more reads as looking past you
      this._d.x += this._sacV.x * (this.fix ? 0.5 : 1); this._d.y += this._sacV.y * (this.fix ? 0.5 : 1); this._d.normalize();
      E.dir.lerp(this._d, this._ek).normalize();      // EYES2: per second, not per frame (0.6 at 60 fps): at a few fps a turning head left the balls 10+ deg behind
      this._t.lookAt(E.dir, this._o, this._up).setPosition(E.pos);
      E.e.matrix.copy(H).multiply(this._t); E.e.matrixWorldNeedsUpdate = true;
      // lids: blink shuts both; a squint screws them nearly shut and pulls the brow down; contentment droops the upper
      const tu = Math.max(blink, 0.82 * squint, 0.7 * droop), tl = Math.max(blink, 0.6 * squint, 0.25 * droop);
      E.cu += (tu - E.cu) * (tu > E.cu ? 0.6 : 0.35); E.cl += (tl - E.cl) * (tl > E.cl ? 0.6 : 0.35); E.sq += (squint - E.sq) * 0.25;
      // lid frame: its +z is `lidDir`, an eased, weighted, clamped copy of the ball's look direction about the resting gaze (yaw and
      // pitch separately, so the lids stay level in the skull: the x axis they swing about stays horizontal); blink, droop and
      // squint swing the two lids about that x axis exactly as before, so a blink still closes over the pupil wherever it points
      const R = E.lidRest, ry = Math.atan2(R.x, R.z), rp = Math.asin(R.y), dy = Math.atan2(E.dir.x, E.dir.z), dp = Math.asin(Math.max(-1, Math.min(1, E.dir.y)));
      const wy = Math.max(-LID_YAW_MAX, Math.min(LID_YAW_MAX, LID_FOLLOW * (dy - ry))), wp = Math.max(-LID_PITCH_MAX, Math.min(LID_PITCH_MAX, LID_FOLLOW_UP * (dp - rp)));
      const ty = ry + wy, tp = rp + wp, ly = Math.atan2(E.lidDir.x, E.lidDir.z), lp = Math.asin(E.lidDir.y), k = this._lk;
      const ny = ly + (ty - ly) * k, np = lp + (tp - lp) * k;
      E.lidDir.set(Math.sin(ny) * Math.cos(np), Math.sin(np), Math.cos(ny) * Math.cos(np));
      this._lf.lookAt(E.lidDir, this._o.set(0, 0, 0), this._up).setPosition(E.pos);
      this._lf.multiply(this._t.makeRotationX(-0.06)).multiply(this._t.makeRotationZ(E.sd * LID_CANT));      // the old 3.4 degrees up keeps the opening even above and below the pupil
      this._t.makeRotationX(-0.5 + 0.7 * E.cu);
      E.lid.matrix.copy(H).multiply(this._lf).multiply(this._t); E.lid.matrixWorldNeedsUpdate = true;
      this._t.makeRotationX(0.62 - 0.7 * E.cl);
      E.lidLo.matrix.copy(H).multiply(this._lf).multiply(this._t); E.lidLo.matrixWorldNeedsUpdate = true;
      // the brow: a heavy pad over the lid that comes down and forward when it squints
      const r = EYE.r;
      this._lm.makeRotationX(0.25 + 0.3 * E.sq).scale(this._o.set(r * 1.5, r * 0.5, r * 1.3)).setPosition(0, r * (1.12 - 0.42 * E.sq), r * (-0.3 + 0.42 * E.sq));
      E.brow.matrix.copy(H).multiply(E.lidLocal).multiply(this._lm); E.brow.matrixWorldNeedsUpdate = true; this._o.set(0, 0, 0);
    }
  }
}

/**
 * Self-check: an invisible animal must never ship silently again. Watches the renderer's own draw calls for the skin
 * (the backend's draw, which a WebGPU pipeline that failed validation skips, and the WebGL program's link status) and,
 * after `frames` frames and `secs` seconds, reads back: is the skin visible, did its pipeline/program build, how many of
 * its triangles were drawn with the skin material over the last `win` frames. If the skin is visible but its own material
 * failed or drew nothing, it logs a clear console error and puts a plain standard material on it (a plain-looking animal
 * beats an invisible one), then checks again. The result is window.__bodyCheck (and in #perf / __perfReport()).
 */
export const MAX_VBUF = 8;
/** distinct vertex buffers behind a geometry's attributes (what a pipeline using all of them binds) */
export function vertexBufferCount(g) { const s = new Set(); for (const k in g.attributes) { const a = g.attributes[k]; s.add(a.isInterleavedBufferAttribute ? a.data : a); } return s.size; }

export function watchBody(renderer, body, { frames = 30, secs = 2.5, win = 10 } = {}) {
  const be = renderer.backend, mesh = body.mesh, webgpu = !!(be && be.isWebGPUBackend);
  const R = { ok: null, stage: 'waiting', backend: webgpu ? 'WebGPU' : 'WebGL2', visible: null, tris: 0, calls: 0, pipelineError: false, message: '', fallback: false,
    vbuf: { geometry: body.vbufStatic != null ? body.vbufStatic : vertexBufferCount(mesh.geometry), max: MAX_VBUF, passes: {} } };      // vertex buffers: geometry upper bound, and per pass as drawn
  window.__bodyCheck = R; body.check = R;
  if (!be || typeof be.draw !== 'function') { R.stage = 'unavailable'; return R; }
  let frame = 0, t0 = performance.now(), winTris = 0, winCalls = 0, mark = 0; const linked = new WeakMap();
  const errOrig = console.error;
  console.error = function (...a) {
    try { const s = a.map(String).join(' '); if (/rexSkin/.test(s) || (/Shader Error|Program Info Log/.test(s) && frame < frames + 60)) { R.pipelineError = R.pipelineError || /rexSkin/.test(s); R.message = R.message || s.slice(0, 300); } } catch {}
    return errOrig.apply(this, a);
  };
  const draw0 = be.draw.bind(be);
  let drew = 0;      // draws of anything since the last step: a frame the app did not render (test hashes render on demand) is not judged
  be.draw = function (ro, info) {
    drew++;
    if (ro && ro.object === mesh) {      // every pass of the skin (colour, shadow, ...): count the vertex buffers its pipeline binds
      try { const n = ro.getVertexBuffers().length, k = ro.material === mesh.material ? 'main' : (ro.material && (ro.material.name || ro.material.type)) || 'other';
        if (!(R.vbuf.passes[k] >= n)) { R.vbuf.passes[k] = n; if (n > MAX_VBUF) { R.vbufOver = true; console.error(`[body check] skin pass '${k}' binds ${n} vertex buffers (WebGPU allows ${MAX_VBUF})`); } } } catch {}
    }
    if (ro && ro.object === mesh && ro.material === mesh.material) {
      try {
        const pd = be.get(ro.pipeline);
        if (webgpu) { if (pd && pd.error) R.pipelineError = true; }
        else if (pd && pd.programGPU && frame > 10 && !linked.has(pd.programGPU)) {
          const gl = be.gl; linked.set(pd.programGPU, true);
          if (gl.getProgramParameter(pd.programGPU, gl.LINK_STATUS) === false) { R.pipelineError = true; R.message = R.message || ('program link failed: ' + gl.getProgramInfoLog(pd.programGPU)); }
        }
      } catch {}
      const I = renderer.info, before = I && I.render ? I.render.triangles : 0;
      const r = draw0(ro, info);
      const drawn = I && I.render ? I.render.triangles - before : 0;
      if (!(webgpu && be.get(ro.pipeline).error)) { winCalls++; winTris += drawn; }
      return r;
    }
    return draw0(ro, info);
  };
  const visibleNow = () => { let o = mesh; while (o) { if (!o.visible) return false; if (o.isScene) return true; o = o.parent; } return false; };
  const verdict = (sT, sC) => {
    R.visible = visibleNow(); R.tris = Math.round(sT / Math.max(1, hist.length)); R.calls = +(sC / Math.max(1, hist.length)).toFixed(2);
    R.ok = R.visible && !R.pipelineError && R.tris > 0 && R.vbuf.geometry <= MAX_VBUF && !R.vbufOver;
    return R.ok;
  };
  const hist = [];      // per frame: [skin triangles drawn, skin draw calls]
  const step = () => {
    if (!drew) return requestAnimationFrame(step);
    drew = 0; frame++; R.frame = frame; hist.push([winTris, winCalls]); winTris = 0; winCalls = 0; if (hist.length > win) hist.shift();
    const judge = () => { const sT = hist.reduce((s, h) => s + h[0], 0), sC = hist.reduce((s, h) => s + h[1], 0); return verdict(sT, sC); };
    if (R.stage === 'waiting') {
      if (frame < frames || performance.now() - t0 < secs * 1000) return requestAnimationFrame(step);
      if (judge()) { R.stage = 'done'; console.info(`[body check] ok: skin drawn, ${R.tris} tris/frame (${R.backend})`); return; }
      if (!R.visible) { R.stage = 'done'; console.error('[body check] FAILED: the T. rex skin mesh is not visible (it or a parent has visible=false, or it is not in the scene)'); return; }
      console.error(`[body check] FAILED on ${R.backend}: the T. rex skin ${R.pipelineError ? 'material failed to build' : 'drew no triangles'} (${R.tris} tris/frame, ${R.calls} calls/frame)${R.message ? ': ' + R.message : ''}. Falling back to a plain material.`);
      const old = mesh.material;
      mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, name: 'rexSkinFallback' });
      mesh.castShadow = false;      // its shadow pass shares the failure mode (a failed shadow pipeline drops the whole shadow pass)
      try { old.dispose(); } catch {}
      R.fallback = true; R.firstFailure = { tris: R.tris, pipelineError: R.pipelineError, message: R.message };
      R.pipelineError = false; R.message = ''; R.stage = 'fallback'; mark = frame; hist.length = 0;
      return requestAnimationFrame(step);
    }
    if (R.stage === 'fallback' && frame - mark >= win + 20) {      // the fallback's first frames compile; judge the last `win`
      R.stage = 'done';
      if (judge()) console.warn(`[body check] fallback material drawing: ${R.tris} tris/frame. The skin shader needs fixing.`);
      else {
        console.error(`[body check] FAILED: even the fallback material draws nothing (${R.tris} tris/frame).${webgpu ? ' Reloading on WebGL2 (#webgl).' : ' The geometry or skinning is broken.'}`);
        if (webgpu && !/webgl|test/.test(location.hash)) { location.hash = '#webgl'; location.reload(); }
      }
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return R;
}
