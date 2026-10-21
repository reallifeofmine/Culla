import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flags, keepScore, groupSimilar, decodeEmbedding, cosine, hamming, albumsFor, search, reasons, type Analysis, type Media, type Face } from '../src/lib/quality.ts';

const enc = (v: number[]) => Buffer.from(Int8Array.from(v).buffer).toString('base64');
const base = (o: Partial<Analysis> = {}): Analysis => ({
  sharp: 800, noise: 2.5, lum: 115, std: 60, clipLow: 0.05, clipHigh: 0.01, entropy: 7.4, colour: 60,
  hash: '0f0f0f0f0f0f0f0f', emb: null, faces: [], labels: [], text: null, lat: null, lon: null, ...o,
});
const face = (o: Partial<Face> = {}): Face => ({ x: 0.4, y: 0.3, w: 0.2, h: 0.25, leftEye: 0.95, rightEye: 0.9, smile: 0.6, sharp: 300, ...o });
let n = 0;
const media = (a: Analysis | null, o: Partial<Media> = {}): Media => ({
  id: String(++n), type: 'photo', uri: 'content://x/' + n, taken: 0, size: 3_000_000, w: 4000, h: 3000,
  mime: 'image/jpeg', bucket: 'Camera', path: 'DCIM/Camera/', duration: 0, a, ...o,
});
// Embeddings: a scene direction plus small per-shot jitter.
const scene = (seed: number) => Array.from({ length: 64 }, (_, i) => Math.round(Math.sin(seed * 7.3 + i * 1.7) * 90));
const jitter = (v: number[], amt: number, s: number) => v.map((x, i) => Math.max(-127, Math.min(127, x + Math.round(Math.sin(s * 13 + i) * amt))));

test('calibrated flags: sharp photo clean, blur/noise/dark/accidental detected', () => {
  assert.deepEqual(flags(base()), []);
  assert.deepEqual(flags(base({ sharp: 23.6 })), ['blurry']);           // astronaut, gaussian 1.5
  assert.deepEqual(flags(base({ noise: 8.9, sharp: 2285 })), ['noisy']); // coffee + noise
  assert.deepEqual(flags(base({ lum: 0.3 * 0 + 134.6, std: 0.5, sharp: 0.3 })), ['accidental']); // finger over lens
  assert.deepEqual(flags(base({ lum: 12.9, std: 5, sharp: 0.2, clipLow: 0.81 })), ['accidental']); // pocket
  assert.deepEqual(flags(base({ lum: 24, std: 22, clipLow: 0.7, sharp: 120 })), ['dark']);
});

test('faces: closed eyes flagged, blur judged on the face not the background', () => {
  assert.deepEqual(flags(base({ faces: [face({ leftEye: 0.05, rightEye: 0.1 })] })), ['eyesClosed']);
  assert.deepEqual(flags(base({ sharp: 15, faces: [face({ sharp: 200 })] })), [], 'portrait with soft background is fine');
  assert.deepEqual(flags(base({ sharp: 300, faces: [face({ sharp: 10 })] })), ['blurry']);
  assert.deepEqual(flags(base({ faces: [face({ w: 0.03, leftEye: 0.01, rightEye: 0.01 })] })), [], 'tiny faces are not judged');
});

test('keep score prefers open eyes, then sharpness', () => {
  const open = media(base({ faces: [face()] }));
  const shut = media(base({ faces: [face({ leftEye: 0.1, rightEye: 0.1 })], sharp: 1200 }));
  assert.ok(keepScore(open) > keepScore(shut));
  assert.ok(keepScore(media(base({ sharp: 900 }))) > keepScore(media(base({ sharp: 40 }))));
});

test('embedding round trip and similarity', () => {
  const v = scene(1);
  const d = decodeEmbedding(enc(v));
  assert.deepEqual(Array.from(d), v);
  assert.ok(cosine(d, decodeEmbedding(enc(jitter(v, 12, 2)))) > 0.95);
  assert.ok(cosine(d, decodeEmbedding(enc(scene(9)))) < 0.6);
  assert.equal(hamming('0000000000000000', '000000000000000f'), 4);
});

test('groups a burst, keeps the best, ignores unrelated and accidental shots', () => {
  const t0 = Date.UTC(2026, 5, 1, 10);
  const v = scene(3);
  const burst = [0, 4, 9, 15].map((s, i) => media(base({ emb: enc(jitter(v, 10, i)), hash: 'aaaa00000000000' + i, sharp: [500, 900, 60, 700][i] }), { taken: t0 + s * 1000, size: 2_000_000 + i }));
  const other = media(base({ emb: enc(scene(8)), hash: 'ffff000000000000' }), { taken: t0 + 20_000 });
  const pocket = media(base({ std: 2, sharp: 1, emb: enc(v) }), { taken: t0 + 25_000 });
  const groups = groupSimilar([...burst, other, pocket]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].ids.sort(), burst.map(m => m.id).sort());
  assert.equal(groups[0].best, burst[1].id, 'sharpest kept');
  assert.equal(groups[0].saving, burst[0].size + burst[2].size + burst[3].size);
  const all = [...burst, other];
  assert.ok(reasons(burst[2], burst[1]).includes('Less sharp'));
  assert.deepEqual(reasons(burst[3], burst[1]), ['Similar shot']);
  void all;
});

test('a long session does not chain into one giant group', () => {
  const t0 = Date.UTC(2026, 5, 2, 10);
  // Slowly drifting scene: each shot close to the previous one, the ends far apart.
  const shots = Array.from({ length: 12 }, (_, i) => {
    const v = scene(1).map((x, k) => Math.round(x * (1 - i / 11) + scene(5)[k] * (i / 11)));
    return media(base({ emb: enc(v), hash: ((i + 1) * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(2) }), { taken: t0 + i * 20_000 });
  });
  const groups = groupSimilar(shots);
  assert.ok(groups.every(g => g.ids.length < 12), `largest ${Math.max(...groups.map(g => g.ids.length))}`);
});

test('exact duplicates are grouped even days apart', () => {
  const a = media(base({ hash: '123456789abcdef0', emb: enc(scene(4)) }), { taken: Date.UTC(2026, 1, 1) });
  const b = media(base({ hash: '123456789abcdef0', emb: enc(scene(4)) }), { taken: Date.UTC(2026, 3, 1), bucket: 'WhatsApp Images', path: 'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/' });
  const g = groupSimilar([a, b]);
  assert.equal(g.length, 1);
});

test('smart albums and search', () => {
  const dog = media(base({ labels: [{ t: 'Dog', c: 0.92 }, { t: 'Grass', c: 0.8 }] }), { taken: Date.UTC(2025, 2, 5) });
  const receipt = media(base({ text: 'TAX INVOICE Woolworths Metro total $42.10 card ending 1234 thank you for shopping' }));
  const shot = media(base(), { bucket: 'Screenshots', path: 'Pictures/Screenshots/' });
  const selfie = media(base({ faces: [face({ w: 0.45 })] }));
  assert.deepEqual(albumsFor(dog).sort(), ['nature', 'pets']);
  assert.deepEqual(albumsFor(receipt), ['documents']);
  assert.deepEqual(albumsFor(shot), ['screenshots']);
  assert.deepEqual(albumsFor(selfie).sort(), ['people', 'selfies']);
  assert.deepEqual(search([dog, receipt, shot], 'dog march').map(m => m.id), [dog.id]);
  assert.deepEqual(search([dog, receipt, shot], 'woolworths').map(m => m.id), [receipt.id]);
});
