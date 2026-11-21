// "Share your run": the death tape and one still go to the share server, which hands back a short link whose page shows the still as its
// preview and sends people on to this game with #tape=<id>,seed<n>. Server: Mike's Cloudflare Worker (source in the OpenBot shared folder,
// rex-encounter-share). Until the owner has played it, the button shows only on a device that has opened the game once with #share.
export const SHARE_API = 'https://rex-encounter-share.rex-encounter-share.workers.dev';

export const shareOn = (() => { let on = false; try { if (/share/.test(location.hash)) localStorage.setItem('rex.share', '1'); on = localStorage.getItem('rex.share') === '1'; } catch {} return () => on && !!SHARE_API; })();
export const sharedId = () => { const m = location.hash.match(/tape=([\w-]+)/); return m ? m[1] : null; };

export async function fetchTape(id) {
  const r = await fetch(`${SHARE_API}/tape/${encodeURIComponent(id)}`); if (!r.ok) throw new Error('tape ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

/** Upload; returns the link to paste. */
export async function uploadRun(tape, still, seed) {
  const fd = new FormData(); fd.append('seed', String(seed)); fd.append('tape', new Blob([tape], { type: 'application/octet-stream' }), 'tape.bin'); if (still) fd.append('still', still, 'still.jpg');
  const r = await fetch(`${SHARE_API}/tape`, { method: 'POST', body: fd }); if (!r.ok) throw new Error('upload ' + r.status);
  const { id } = await r.json(); return `${SHARE_API}/r/${id}`;
}

/** The preview still: while the death replay plays, each shown frame is scored and the best one is kept, cropped to the 1200x630 preview.
 *  Only frames with the animal's head and body well inside that crop count; then bigger in frame is better, the visitor in shot adds, and
 *  funny moments add most (in the air, in the jaws). Frames in a burst of static never count. */
const AIM = 1200 / 630, EDGE = 0.85;
export class StillPicker {
  constructor() { this.c = null; this.best = -Infinity; this.p = null; }
  reset() { this.best = -Infinity; }
  consider(rec, canvas, camera, ST) {
    const W = canvas.width, H = canvas.height, score = this.score(rec, W, H, camera, ST);
    if (score === null || score <= this.best) return;
    this.best = score;
    if (!this.c) { this.c = document.createElement('canvas'); this.c.width = 1200; this.c.height = 630; }
    const a = W / H, w = W * (a > AIM ? AIM / a : 1), hh = H * (a > AIM ? 1 : a / AIM);
    try { this.c.getContext('2d').drawImage(canvas, (W - w) / 2, (H - hh) / 2, w, hh, 0, 0, 1200, 630); } catch {}
  }
  /** The frame's worth as a preview, or null when the animal is not well inside the crop (or the picture is static). */
  score(rec, W, H, camera, ST) {
    if (rec.burst > 0.2) return null;
    const a = W / H, wf = a > AIM ? AIM / a : 1, hf = a > AIM ? 1 : a / AIM;
    const p = this.p || (this.p = rec.head.clone()), crop = (v) => { p.copy(v).project(camera); return p.z < 1 ? [p.x / wf, p.y / hf] : null; };
    const inside = (q) => q && Math.abs(q[0]) < EDGE && Math.abs(q[1]) < EDGE;
    const h = crop(rec.head), t = crop(rec.torso); if (!inside(h) || !inside(t)) return null;
    const S = rec.S, size = Math.hypot(h[0] - t[0], h[1] - t[1]), f = rec.s0 + rec.t * 30;
    const fig = inside(crop(p.set(S.x, S.y + 0.9, S.z)));
    return 30 * Math.min(1, size / 0.6) + (fig ? 20 : 0) + (S.st === ST.AIR ? 40 : S.st === ST.HELD ? 35 : 0) - 0.3 * Math.abs(f - (rec.death - 10));
  }
  /** JPEG under the server's 256 KiB cap: lower quality until it fits. */
  async blob() {
    if (!this.c) return null;
    for (const q of [0.85, 0.7, 0.5]) { const b = await new Promise((ok) => this.c.toBlob(ok, 'image/jpeg', q)); if (b && b.size < 250000) return b; }
    return null;
  }
}
