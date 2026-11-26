// jaw-from-voice, the one place that turns what audio.js measured into a jaw angle (view only; body.js draws it, test/jaw_audio.py scores it).
/** The widest the voice alone opens the jaw (rad): a bit under the sim's roar gape (0.8). */
export const VOICE_GAPE = 0.75;
import { tune, tuneGroup } from '../tune.js';      // tune
export const JAWV = { gape: VOICE_GAPE, cap: 0.15, floor: 0.03, gain: 0.25 };      // tune: the live copies (the gape, the flutter's cap share, its floor in rad, its scale)
{ const J = 'Jaw from voice'; tuneGroup(J, { order: 20 });      // tune
  tune(J, 'Widest the voice alone opens the jaw (rad)', JAWV, 'gape', 0.2, 1.4, 0.01, null, 'jaw.maxOpening'); tune(J, 'Tremble: share of the opening it may add', JAWV, 'cap', 0, 0.6, 0.01, null, 'jaw.flutterCap'); tune(J, 'Tremble: extra allowance on a shut jaw (rad)', JAWV, 'floor', 0, 0.15, 0.005, null, 'jaw.flutterFloor'); tune(J, 'Tremble: strength', JAWV, 'gain', 0, 1.5, 0.01, null, 'jaw.flutterGain'); }      // tune
/** open: audio.mouthOpen (0..1, the spectrum says how far the mouth is open), flutter: audio.mouthFlutter (signed, 0..1 units, the low band's fast amplitude
 *  variation: the tremble of a growl, the quiver of a roar). The flutter is scaled to a few degrees and capped at 15% of the opening plus 0.03 rad,
 *  so a dark sound shows a tremble on a nearly shut jaw and a roar a slight quiver, never a flapping. */
export function jawFromVoice(open, flutter = 0) {
  const base = JAWV.gape * Math.max(0, Math.min(1, open)), cap = JAWV.cap * base + JAWV.floor;
  return Math.max(0, base + Math.max(-cap, Math.min(cap, JAWV.gain * flutter)));
}
