// Species variant: the downloaded CC0 tyrannosaur ("Patch", dist/model/patchrex.glb, see dist/model/CREDITS.md), measured off
// its rig so that OUR simulation walks an animal of ITS proportions (view/patchbody.js skins that model to the sim's joints).
// Everything not listed is the default animal's (species/tyrannosaurus.js). Numbers from out/tools/an1.py on the bind skeleton.
import { lerp, sstep } from '../math.js';
import { TYRANNOSAURUS } from './tyrannosaurus.js';

const T = TYRANNOSAURUS;
export const PATCHREX = {
  ...T,
  name: 'Tyrannosaurus rex, adult (Patch model)',
  dims: {
    ...T.dims,
    // the model's hip sockets stand 1.5 m apart (thigh joints at x +-0.75) and its legs are a shorter thigh over a long
    // metatarsus: femur 1.17, tibia 1.30, ankle to the back of the foot 1.23 m, the foot's bone 0.27 m over the sim's MTP
    // line (its sole is thick), so the sim's metatarsus is 1.23 + 0.27
    hipHeight: 3.35, hipHalf: 0.75, femur: 1.17, tibia: 1.3, meta: 1.45, toe: 1.0,
    backLen: 2.1, neckLen: 2.05,       // pelvis to chest joint; chest joint to the skull pivot
    headLen: 2.3,                      // the skull pivot (the model's head joint) to the snout tip: a big head (2.4 m skull)
    tailLen: 5.5,                      // (the sim's tail base sits 0.6 m behind the pelvis: 6.1 m to the tip, the model's ~6)
    reachStop: 4.8,                    // longer head and neck, shorter back: the snout reaches ~0.5 m further from the hips
  },
  // the feet: a long, heavy foot (~1.0-1.2 m from the back of the foot to the claw tips) set wider apart than ours
  foot: { ...T.foot, toes: [0.85, 1.0, 0.85] },
  gait: {
    ...T.gait,
    track: (v) => lerp(0.62, 0.42, sstep(0.05, 1.1, v)) - 0.06 * sstep(3, 8, v),       // half trackway: the hips are wider, so are the prints
  },
  hips: { ...T.hips, footGap: { midline: 0.55 }, footprint: { ...T.hips.footprint, heel: 0.35, toe: 0.95, r: 0.32 } },
};
