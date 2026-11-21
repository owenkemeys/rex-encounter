// node test/share.mjs <share-api-url> : upload a tape and a still to a share server (tools/share_mock.py or the real one), then check the
// tape comes back identical, the still is served, and the link's page carries the preview tags and sends people to #tape=<id>,seed<n>.
import { encodeTape, decodeTape } from '../src/tape.js';

const API = process.argv[2]; if (!API) { console.log('usage: node test/share.mjs <share-api-url>'); process.exit(2); }
globalThis.location = { hash: '' };
const src = (await import('node:fs')).readFileSync(new URL('../src/share.js', import.meta.url), 'utf8').replace(/export const SHARE_API = '[^']*'/, `export const SHARE_API = '${API}'`);
const { uploadRun, fetchTape } = await import('data:text/javascript,' + encodeURIComponent(src));

const frames = 300, v = new Float32Array(frames * 219).map((_, i) => Math.sin(i / 97)), s = new Float32Array(frames * 24), m = new Float32Array(frames * 20).map((_, i) => i % 20 === 5 ? 0 : Math.cos(i / 31));
const tape = await encodeTape({ nv: 219, ns: 24, nm: 20, frames, v, s, m, th: new Array(frames).fill(null), ev: [{ f: 3, e: { type: 'roar' } }], meta: { seed: 4242, death: 250 } });
const still = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const link = await uploadRun(tape, still, 4242), id = link.split('/').pop();
const back = await decodeTape(await fetchTape(id));
const page = await (await fetch(link)).text(), img = await fetch(`${API}/still/${id}.jpg`);
const checks = {
  'link shape': link === `${API}/r/${id}`,
  'tape round trip': back.meta.seed === 4242 && back.meta.death === 250 && Math.abs(back.v[1000] - v[1000]) < 0.001,
  'still served': img.ok && img.headers.get('content-type') === 'image/jpeg',
  'preview image tag': page.includes(`og:image" content="`) && page.includes(`/still/${id}.jpg`),
  'large card': page.includes('summary_large_image'),
  'goes to the tape with the seed': page.includes(`#tape=${id},seed4242`),
  'missing tape is 404': (await fetch(`${API}/tape/nope`)).status === 404,
};
for (const [k, ok] of Object.entries(checks)) console.log(ok ? 'ok  ' : 'FAIL', k);
console.log('link', link);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
