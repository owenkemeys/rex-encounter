// A replay tape as bytes, for "share your run": the recorded frames (animal pose, player track, things) and sound events, packed for upload.
// Every float channel is quantised to 1/1000 and stored as frame-to-frame differences, channel by channel, then gzipped. Plain data only:
// nothing about the player but where the figure was. VERSION changes when the pose layout does, so an old tape is refused, not misdrawn.
export const VERSION = 1;
const Q = 1000;

async function gzip(bytes, dir) {
  const s = new Blob([bytes]).stream().pipeThrough(dir === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** t: { nv, ns, nm, frames, v, s, m (Float32Arrays, frame-major), th (per frame: list or null), ev ([{ f, e }], f in frames from the first), meta } */
export async function encodeTape(t) {
  const head = { version: VERSION, nv: t.nv, ns: t.ns, nm: t.nm, frames: t.frames, th: t.th, ev: t.ev, meta: t.meta };
  const chans = [[t.v, t.nv], [t.s, t.ns], [t.m, t.nm]], total = t.frames * (t.nv + t.ns + t.nm), q = new Int32Array(total);
  let o = 0;
  for (const [a, w] of chans) for (let c = 0; c < w; c++) { let prev = 0; for (let f = 0; f < t.frames; f++) { const v = Math.round(a[f * w + c] * Q); q[o++] = v - prev; prev = v; } }
  const hb = new TextEncoder().encode(JSON.stringify(head)), out = new Uint8Array(4 + hb.length + q.byteLength);
  new DataView(out.buffer).setUint32(0, hb.length, true); out.set(hb, 4); out.set(new Uint8Array(q.buffer), 4 + hb.length);
  return gzip(out, 'in');
}

export async function decodeTape(bytes) {
  const raw = await gzip(bytes, 'out'), hl = new DataView(raw.buffer).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + hl)));
  if (head.version !== VERSION) throw new Error('tape version ' + head.version);
  const q = new Int32Array(raw.slice(4 + hl).buffer), n = head.frames, t = { ...head, v: new Float32Array(n * head.nv), s: new Float32Array(n * head.ns), m: new Float32Array(n * head.nm) };
  let o = 0;
  for (const [a, w] of [[t.v, head.nv], [t.s, head.ns], [t.m, head.nm]]) for (let c = 0; c < w; c++) { let v = 0; for (let f = 0; f < n; f++) { v += q[o++]; a[f * w + c] = v / Q; } }
  return t;
}
