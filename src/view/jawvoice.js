// jaw-from-voice, the one place that turns what audio.js measured into a jaw angle (view only; body.js draws it, test/jaw_audio.py scores it).
/** The widest the voice alone opens the jaw (rad): a bit under the sim's roar gape (0.8). */
export const VOICE_GAPE = 0.75;
/** open: audio.mouthOpen (0..1, the spectrum says how far the mouth is open), flutter: audio.mouthFlutter (signed, 0..1 units, the low band's fast amplitude
 *  variation: the tremble of a growl, the quiver of a roar). The flutter is scaled to a few degrees and capped at 15% of the opening plus 0.03 rad,
 *  so a dark sound shows a tremble on a nearly shut jaw and a roar a slight quiver, never a flapping. */
export function jawFromVoice(open, flutter = 0) {
  const base = VOICE_GAPE * Math.max(0, Math.min(1, open)), cap = 0.15 * base + 0.03;
  return Math.max(0, base + Math.max(-cap, Math.min(cap, 0.25 * flutter)));
}
