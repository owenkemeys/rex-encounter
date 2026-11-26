// Saved clips are MP4 (H.264 + AAC) in every browser: X does not take WebM. A recorder that could only make WebM (Firefox, older Chrome) has its file
// converted here, in the browser (mediabunny over WebCodecs; AAC from a small WASM encoder where the browser has none). Built on its own (dist/mp4.js)
// and loaded by clip.js only when a conversion is needed. Throws when this browser cannot make the MP4 with sound: the WebM is then kept.
import { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS, canEncodeAudio } from 'mediabunny';
import { registerAacEncoder } from '@mediabunny/aac-encoder';

export async function toMp4(blob) {
  if (!(await canEncodeAudio('aac'))) registerAacEncoder();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conv = await Conversion.init({ input, output, video: { codec: 'avc', bitrate: 4e6, frameRate: 30 }, audio: { codec: 'aac', bitrate: 128e3 }, showWarnings: false });
  if (!conv.isValid || conv.discardedTracks.length) throw new Error('mp4: ' + conv.discardedTracks.map((d) => d.reason).join(', '));
  await conv.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
