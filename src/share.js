// "Share your run": the death tape and one still go to the share server, which hands back a short link whose page shows the still as its
// preview and sends people on to this game with #tape=<id>,seed<n>. SHARE_API empty: sharing is off and the button stays hidden.
export const SHARE_API = '';

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

/** The preview still: while the death replay plays, each new shown frame is scored and the best one is kept, cropped to 1200x630.
 *  Best: just before the death (about a third of a second), more if the visitor is in the air, more if the animal's head is close to them. */
export class StillPicker {
  constructor() { this.c = null; this.best = -Infinity; }
  reset() { this.best = -Infinity; }
  consider(rec, canvas, airCode) {
    const f = rec.s0 + rec.t * 30, S = rec.S, h = rec.head, d = Math.hypot(h.x - S.x, h.z - S.z);
    const score = -Math.abs(f - (rec.death - 10)) + (S.st === airCode ? 40 : 0) + (d < 3 ? 20 : 0);
    if (score <= this.best) return;
    this.best = score;
    if (!this.c) { this.c = document.createElement('canvas'); this.c.width = 1200; this.c.height = 630; }
    const W = canvas.width, H = canvas.height, k = Math.max(1200 / W, 630 / H), w = 1200 / k, hh = 630 / k;
    try { this.c.getContext('2d').drawImage(canvas, (W - w) / 2, (H - hh) / 2, w, hh, 0, 0, 1200, 630); } catch {}
  }
  blob() { return this.c ? new Promise((ok) => this.c.toBlob(ok, 'image/jpeg', 0.85)) : Promise.resolve(null); }
}
