// Photo quality decisions: issue flags, a keep-score, similar-shot grouping and smart albums.
// Pure functions with no imports, so they run in Node tests as well as the app.
// Thresholds were calibrated with the native metrics on images scaled to 512 px (see
// docs/notes.md): sharp photos measure 400–1600, a slight blur 8–30.

export type Face = {
  /** box in 0..1 of the image */
  x: number; y: number; w: number; h: number;
  /** ML Kit probabilities, null when the face is too small or turned away */
  leftEye: number | null; rightEye: number | null; smile: number | null;
  /** Laplacian variance of the face scaled to 160 px wide */
  sharp: number;
};

export type Analysis = {
  sharp: number; noise: number;
  lum: number; std: number; clipLow: number; clipHigh: number; entropy: number; colour: number;
  hash: string;
  /** int8 embedding, base64 */
  emb: string | null;
  faces: Face[];
  labels: { t: string; c: number }[];
  text: string | null;
  lat: number | null; lon: number | null;
};

export type Media = {
  id: string;
  type: 'photo' | 'video';
  uri: string;
  taken: number; // ms
  size: number; // bytes
  w: number; h: number;
  mime: string;
  bucket: string;
  path: string;
  duration: number; // ms
  a?: Analysis | null;
};

export type Flag = 'blurry' | 'eyesClosed' | 'noisy' | 'dark' | 'bright' | 'accidental';
export type Sensitivity = 'relaxed' | 'normal' | 'strict';

export const FLAG_LABEL: Record<Flag, string> = {
  blurry: 'Blurry', eyesClosed: 'Eyes closed', noisy: 'Grainy', dark: 'Too dark', bright: 'Washed out', accidental: 'Accidental',
};

const BLUR = { relaxed: 22, normal: 40, strict: 70 };
const NOISE = { relaxed: 9.5, normal: 7.5, strict: 6 };

/** A face counts for eyes and sharpness checks when it is big enough to judge. */
const judgeable = (f: Face) => f.w >= 0.06 && f.leftEye !== null && f.rightEye !== null;

export function flags(a: Analysis | null | undefined, s: Sensitivity = 'normal'): Flag[] {
  if (!a) return [];
  const out: Flag[] = [];
  const featureless = a.std < 8 && a.sharp < 3;
  const blackFrame = a.lum < 20 && a.std < 10;
  if (featureless || blackFrame) return ['accidental'];
  const faces = a.faces.filter(judgeable);
  // With faces, judge blur on the faces (a soft background is often intentional).
  const blurry = faces.length ? Math.max(...faces.map(f => f.sharp)) < BLUR[s] * 0.6 : a.sharp < BLUR[s];
  if (blurry) out.push('blurry');
  if (faces.some(f => Math.min(f.leftEye!, f.rightEye!) < (s === 'strict' ? 0.35 : 0.2))) out.push('eyesClosed');
  if (a.noise > NOISE[s]) out.push('noisy');
  if (a.lum < 28 && a.clipLow > 0.6) out.push('dark');
  if (a.lum > 225 && a.clipHigh > 0.45) out.push('bright');
  return out;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** 0..100: how good a keeper this photo is. Used to pick the best of a similar set. */
export function keepScore(m: Media): number {
  const a = m.a;
  if (!a) return 0;
  const sharp = clamp((Math.log2(a.sharp + 1) - 3) / 7); // 7 → 0, ~1000 → 1
  const exposure = clamp(1 - Math.abs(a.lum - 120) / 140 - a.clipLow * 0.8 - a.clipHigh * 0.8);
  const noise = clamp(1 - (a.noise - 2) / 10);
  const faces = a.faces.filter(judgeable);
  let score: number;
  if (faces.length) {
    const eyes = faces.reduce((s, f) => s + Math.min(f.leftEye!, f.rightEye!), 0) / faces.length;
    const smile = faces.reduce((s, f) => s + (f.smile ?? 0), 0) / faces.length;
    const faceSharp = clamp((Math.log2(Math.min(...faces.map(f => f.sharp)) + 1) - 3) / 6);
    score = 30 * eyes + 10 * smile + 20 * faceSharp + 15 * sharp + 15 * exposure + 10 * noise;
  } else {
    score = 45 * sharp + 30 * exposure + 15 * noise + 10 * clamp(a.colour / 60);
  }
  // Tie-breaker: more pixels.
  score += clamp((m.w * m.h) / 12e6) * 2;
  return Math.round(score * 10) / 10;
}

// ---------- similarity ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; return t; })();

export function decodeEmbedding(b64: string): Int8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Int8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64_LOOKUP[clean.charCodeAt(i)] << 18) | (B64_LOOKUP[clean.charCodeAt(i + 1)] << 12) |
      ((B64_LOOKUP[clean.charCodeAt(i + 2)] & 63) << 6) | (B64_LOOKUP[clean.charCodeAt(i + 3)] & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function cosine(a: Int8Array, b: Int8Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function hamming(h1: string, h2: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(h1.slice(i, i + 4), 16) ^ parseInt(h2.slice(i, i + 4), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export type Group = { id: string; ids: string[]; best: string; saving: number; taken: number };

type Item = { m: Media; emb: Int8Array | null };

const shape = (m: Media) => (m.w && m.h ? Math.max(m.w, m.h) / Math.min(m.w, m.h) : 0);

function similarEnough(p: Item, q: Item, gapMs: number): boolean {
  // Same moment, same camera: the same shape. Stops a screenshot joining a camera photo.
  const sp = shape(p.m), sq = shape(q.m);
  if (sp && sq && Math.abs(sp - sq) > 0.12) return false;
  const ha = p.m.a!.hash, hb = q.m.a!.hash;
  if (hamming(ha, hb) <= 5) return true; // the same picture, give or take
  if (!p.emb || !q.emb) return false;
  const c = cosine(p.emb, q.emb);
  // Burst-close shots may differ more (people moving); shots further apart must look closer.
  const need = gapMs <= 60_000 ? 0.72 : gapMs <= 10 * 60_000 ? 0.86 : 0.93;
  return c >= need;
}

/**
 * Groups photos of the same moment: taken within 30 minutes of each other and looking alike,
 * plus exact duplicates at any time (copies, re-downloads). Each group keeps its first and
 * latest member close to newcomers, so a long session doesn't drift into one giant group.
 */
export function groupSimilar(media: Media[], sens: Sensitivity = 'normal'): Group[] {
  const items: Item[] = media
    .filter(m => m.type === 'photo' && m.a && !flags(m.a, sens).includes('accidental'))
    .map(m => ({ m, emb: m.a!.emb ? decodeEmbedding(m.a!.emb) : null }));
  return buildGroups(items);
}

function buildGroups(items: Item[]): Group[] {
  items.sort((x, y) => x.m.taken - y.m.taken);
  const WINDOW = 30 * 60_000;
  type Open = { first: Item; last: Item; members: Item[] };
  const open: Open[] = [];
  const all: Open[] = [];
  for (const it of items) {
    while (open.length && it.m.taken - open[0].last.m.taken > WINDOW) open.shift();
    let target: Open | null = null;
    for (let k = open.length - 1; k >= Math.max(0, open.length - 4) && !target; k--) {
      const g = open[k];
      const gap = it.m.taken - g.last.m.taken;
      if (similarEnough(it, g.last, gap) && similarEnough(it, g.first, it.m.taken - g.first.m.taken)) target = g;
    }
    if (target) { target.members.push(it); target.last = it; }
    else { const g = { first: it, last: it, members: [it] }; open.push(g); all.push(g); }
  }
  // Exact duplicates far apart in time (e.g. WhatsApp copies of a camera photo).
  const byHash = new Map<string, Open>();
  for (const g of all) {
    const h = g.first.m.a!.hash;
    const prev = byHash.get(h);
    if (prev && prev !== g && g.members.length === 1 && prev.members.length >= 1) {
      prev.members.push(...g.members); g.members = [];
    } else if (!prev) byHash.set(h, g);
  }
  return all.filter(g => g.members.length > 1).map(g => {
    const ms = g.members.map(i => i.m);
    const best = ms.reduce((b, m) => (keepScore(m) > keepScore(b) ? m : b), ms[0]);
    return {
      id: g.first.m.id,
      ids: ms.map(m => m.id),
      best: best.id,
      saving: ms.filter(m => m !== best).reduce((s, m) => s + m.size, 0),
      taken: g.first.m.taken,
    };
  }).sort((a, b) => b.taken - a.taken);
}

/** Why a photo is suggested for deletion in its group, in plain words. */
export function reasons(m: Media, best: Media, sens: Sensitivity = 'normal'): string[] {
  const out = flags(m.a, sens).map(f => FLAG_LABEL[f]);
  if (!out.length && m.a && best.a) {
    if (m.a.sharp < best.a.sharp * 0.6) out.push('Less sharp');
    const eyes = (x: Analysis) => Math.min(...x.faces.filter(judgeable).map(f => Math.min(f.leftEye!, f.rightEye!)), 1);
    if (eyes(m.a) < eyes(best.a) - 0.3) out.push('Eyes half closed');
    if (!out.length) out.push('Similar shot');
  }
  return out;
}

// ---------- smart albums and search ----------
export type AlbumKey = 'people' | 'selfies' | 'pets' | 'food' | 'documents' | 'nature' | 'vehicles' | 'screenshots' | 'whatsapp' | 'downloads' | 'videos';

export const ALBUMS: { key: AlbumKey; title: string; icon: string }[] = [
  { key: 'people', title: 'People', icon: 'people' },
  { key: 'selfies', title: 'Selfies', icon: 'happy' },
  { key: 'pets', title: 'Pets', icon: 'paw' },
  { key: 'food', title: 'Food', icon: 'restaurant' },
  { key: 'documents', title: 'Documents & receipts', icon: 'document-text' },
  { key: 'nature', title: 'Nature & outdoors', icon: 'leaf' },
  { key: 'vehicles', title: 'Cars & transport', icon: 'car' },
  { key: 'screenshots', title: 'Screenshots', icon: 'phone-portrait' },
  { key: 'whatsapp', title: 'WhatsApp', icon: 'logo-whatsapp' },
  { key: 'downloads', title: 'Downloads', icon: 'download' },
  { key: 'videos', title: 'Videos', icon: 'videocam' },
];

const LABELS: Partial<Record<AlbumKey, string[]>> = {
  pets: ['dog', 'cat', 'pet', 'bird', 'horse', 'rabbit', 'fish', 'hamster'],
  food: ['food', 'cuisine', 'dessert', 'cake', 'pizza', 'bread', 'fruit', 'vegetable', 'cookie', 'meal', 'dish', 'baked goods', 'sushi', 'coffee', 'drink', 'wine', 'cocktail', 'pasta', 'salad', 'burger', 'sandwich', 'ice cream', 'chocolate'],
  documents: ['paper', 'menu', 'receipt', 'poster', 'newspaper', 'document', 'whiteboard', 'handwriting', 'text', 'book', 'business card'],
  nature: ['sky', 'plant', 'flower', 'tree', 'mountain', 'lake', 'beach', 'sunset', 'sea', 'river', 'garden', 'grass', 'waterfall', 'cloud', 'rock', 'snow', 'forest', 'leaf', 'park', 'desert', 'field'],
  vehicles: ['car', 'bicycle', 'motorcycle', 'boat', 'airplane', 'bus', 'train', 'vehicle', 'truck', 'wheel', 'aircraft'],
};

const hasLabel = (a: Analysis, words: string[], min = 0.65) => a.labels.some(l => l.c >= min && words.includes(l.t.toLowerCase()));

export function albumsFor(m: Media): AlbumKey[] {
  const out: AlbumKey[] = [];
  const p = (m.path + '/' + m.bucket).toLowerCase();
  if (m.type === 'video') out.push('videos');
  if (p.includes('screenshot')) out.push('screenshots');
  if (p.includes('whatsapp')) out.push('whatsapp');
  if (p.includes('download')) out.push('downloads');
  const a = m.a;
  if (!a || m.type === 'video') return out;
  const faces = a.faces.filter(f => f.w >= 0.08);
  if (faces.length) out.push('people');
  if (faces.length === 1 && faces[0].w >= 0.3) out.push('selfies');
  for (const k of ['pets', 'food', 'nature', 'vehicles'] as const) if (hasLabel(a, LABELS[k]!)) out.push(k);
  if ((a.text && a.text.replace(/\s+/g, ' ').length >= 60) || hasLabel(a, LABELS.documents!)) out.push('documents');
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Words a photo can be found by: labels, text in the picture, album, folder, month and year. */
export function searchText(m: Media): string {
  const d = new Date(m.taken);
  const parts = [m.bucket, MONTHS[d.getMonth()], String(d.getFullYear()), ...albumsFor(m)];
  if (m.a) {
    parts.push(...m.a.labels.filter(l => l.c >= 0.6).map(l => l.t));
    if (m.a.text) parts.push(m.a.text);
    if (m.a.faces.length) parts.push('people person face');
  }
  if (m.type === 'video') parts.push('video');
  return parts.join(' ').toLowerCase();
}

export function search(media: Media[], query: string): Media[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return media.filter(m => { const t = searchText(m); return terms.every(q => t.includes(q)); });
}
