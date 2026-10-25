import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flags, issueFlags, isScreenshot, keepScore, groupSimilar, decodeEmbedding, cosine, hamming, albumsFor, search, reasons, type Analysis, type Media, type Face } from '../src/lib/quality.ts';

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
  assert.deepEqual(flags(base({ v: 3, iso: 3200, noise: 3.2, lum: 60, sharp: 1600 })), ['noisy']); // night shot
  assert.deepEqual(flags(base({ lum: 0.3 * 0 + 134.6, std: 0.5, sharp: 0.3 })), ['accidental']); // finger over lens
  assert.deepEqual(flags(base({ lum: 12.9, std: 5, sharp: 0.2, clipLow: 0.81 })), ['accidental']); // pocket
  assert.deepEqual(flags(base({ lum: 24, std: 22, clipLow: 0.7, sharp: 120 })), ['dark']);
});

test('faces: closed eyes flagged, blur judged on the face not the background', () => {
  assert.deepEqual(flags(base({ faces: [face({ leftEye: 0.02, rightEye: 0.04 })] })), ['eyesClosed']);
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

test('different shapes never group (screenshot vs camera photo)', () => {
  const t0 = Date.UTC(2026, 5, 3, 10);
  const v = scene(6);
  const photo = media(base({ emb: enc(v), hash: 'abcdabcdabcdabcd' }), { taken: t0 });
  const shot = media(base({ emb: enc(jitter(v, 4, 1)), hash: '1234123412341234' }), { taken: t0 + 5000, w: 1080, h: 2340, bucket: 'Screenshots' });
  assert.equal(groupSimilar([photo, shot]).length, 0);
});

test('a blurred frame in the middle of a burst does not split it', () => {
  // Explicit geometry from the emulator run: the blurred frame still resembles the first shot
  // (0.76) but not the shot after it (~0.46), which does resemble the first two (0.91).
  const t0 = Date.UTC(2026, 5, 4, 10);
  const vec = (a: number, b: number, c: number) => { const v = new Array(64).fill(0); v[0] = a; v[1] = b; v[2] = c; return v; };
  const embs = [vec(100, 0, 0), vec(100, 0, 5), vec(100, 85, 0), vec(100, -40, 20)];
  const shots = embs.map((e, i) => media(base({ emb: enc(e), hash: ((i + 7) * 2654435761 >>> 0).toString(16).padStart(8, '0').repeat(2), sharp: i === 2 ? 9 : 600 }), { taken: t0 + i * 3000 }));
  const c = (x: number, y: number) => cosine(decodeEmbedding(enc(embs[x])), decodeEmbedding(enc(embs[y])));
  assert.ok(c(0, 2) > 0.72 && c(2, 3) < 0.72 && c(0, 3) > 0.9, 'fixture geometry');
  const g = groupSimilar(shots);
  assert.equal(g.length, 1);
  assert.equal(g[0].ids.length, 4);
});

// Cases from real photos the user reviewed.
test('woman by the ocean: small distant face, sharp photo → not blurry', () => {
  const far = face({ w: 0.08, px: 62, sharp: -1 });
  assert.deepEqual(flags(base({ v: 2, sharp: 520, faces: [far] })), []);
  // Older analyses (enlarged face crop, no px) must not be judged on that face either.
  assert.deepEqual(flags(base({ sharp: 520, faces: [face({ w: 0.08, sharp: 9 })] })), []);
});

test('close-up selfie: soft face and both eyes shut → blurry and eyes closed', () => {
  assert.deepEqual(flags(base({ v: 2, sharp: 18, faces: [face({ w: 0.75, px: 540, sharp: 11, leftEye: 0.03, rightEye: 0.06 })] })).sort(), ['blurry', 'eyesClosed']);
});

test('man in sunglasses among textured rocks → no flags', () => {
  const shades = face({ w: 0.08, px: 61, sharp: -1, leftEye: 0.01, rightEye: 0.02, eyeLum: 0.3 });
  assert.deepEqual(flags(base({ v: 2, sharp: 900, noise: 0.8, lum: 150, faces: [shades] })), []);
  // Even a big face with sunglasses is not "eyes closed".
  assert.deepEqual(flags(base({ v: 2, faces: [face({ px: 300, leftEye: 0.01, rightEye: 0.01, eyeLum: 0.35 })] })), []);
  // Bright, textured scene: texture is not grain.
  assert.deepEqual(flags(base({ v: 2, noise: 3.4, lum: 160 })), []);
});

test('eyes closed needs both eyes clearly shut on a face big enough to judge', () => {
  assert.deepEqual(flags(base({ faces: [face({ px: 300, leftEye: 0.3, rightEye: 0.25 })] })), [], 'small eyes');
  assert.deepEqual(flags(base({ faces: [face({ px: 300, leftEye: 0.02, rightEye: 0.9 })] })), [], 'one eye / wink');
  assert.deepEqual(flags(base({ faces: [face({ px: 80, leftEye: 0.01, rightEye: 0.01 })] })), [], 'face too small');
  assert.deepEqual(flags(base({ faces: [face({ px: 300, leftEye: 0.02, rightEye: 0.03, eyeLum: 0.95 })] })), ['eyesClosed']);
});

test('noise is a low-light problem: daylight texture never counts', () => {
  // Ferns, forest, grass, rock: textured at full resolution but shot at low ISO in daylight.
  for (const lum of [70, 100, 140]) assert.deepEqual(flags(base({ v: 3, iso: 50, noise: 6, lum })), [], `ISO 50, lum ${lum}`);
  // Older analyses without ISO: bright scenes are not judged for noise.
  assert.deepEqual(flags(base({ v: 2, noise: 6, lum: 100 })), []);
  // Night and dim indoor shots with visible noise in smooth areas.
  assert.deepEqual(flags(base({ v: 3, iso: 1600, noise: 2.6, lum: 45 })), ['noisy']);
  assert.deepEqual(flags(base({ v: 3, iso: 1600, noise: 1.2, lum: 45 })), [], 'clean night-mode shot');
  // No camera info: only a genuinely dark, clearly noisy scene.
  assert.deepEqual(flags(base({ v: 3, noise: 3.5, lum: 50 })), ['noisy']);
  assert.deepEqual(flags(base({ v: 3, noise: 3.5, lum: 120 })), []);
});

test('washed out: screenshots and white backgrounds are never flagged', () => {
  const white = { lum: 240, std: 30, clipHigh: 0.7, sharp: 900 };
  // Screenshots: in the Screenshots folder, or saved elsewhere with a phone-screen shape and no camera info.
  const inFolder = media(base({ v: 3, ...white }), { bucket: 'Screenshots', path: 'Pictures/Screenshots/', w: 1080, h: 2400 });
  const saved = media(base({ v: 3, ...white }), { bucket: 'Download', path: 'Download/', w: 1080, h: 2340 });
  for (const m of [inFolder, saved]) {
    assert.ok(isScreenshot(m));
    assert.deepEqual(issueFlags(m), []);
    assert.ok(albumsFor(m).includes('screenshots'));
  }
  // A dark-mode screenshot is not a pocket shot either.
  assert.deepEqual(issueFlags(media(base({ v: 3, lum: 14, std: 6, sharp: 0.4, clipLow: 0.85 }), { bucket: 'Screenshots', w: 1080, h: 2400 })), []);
  // Saved images (no camera info, outside the camera folder) are not judged.
  assert.deepEqual(issueFlags(media(base({ v: 3, ...white }), { bucket: 'WhatsApp Images', path: 'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/', w: 1600, h: 1200 })), []);
  // Camera photo of a document or whiteboard: readable text, so not washed out.
  assert.deepEqual(issueFlags(media(base({ v: 3, iso: 50, ...white, text: 'Meeting notes: agenda for Thursday budget review and actions' }))), []);
  // Bright but with real detail (white wall, snow, product on white): spread too wide.
  assert.deepEqual(issueFlags(media(base({ v: 3, iso: 50, lum: 232, std: 55, clipHigh: 0.55 }))), []);
  // Genuinely blown-out camera photo.
  assert.deepEqual(issueFlags(media(base({ v: 3, iso: 50, ...white }))), ['bright']);
  // A camera photo is still a camera photo even at a screen-like size, because it has ISO.
  assert.deepEqual(issueFlags(media(base({ v: 3, iso: 50, ...white }), { w: 1080, h: 2340 })), ['bright']);
});
