// Browser preview of the native module: a simulated gallery with bursts, blurry shots,
// closed eyes, pocket shots, screenshots, WhatsApp copies and large videos. Used for
// UI development and automated screenshots; the real module runs on Android.
import { registerWebModule, NativeModule } from 'expo';
import type { Access, EditParams, MediaColumns, RawAnalysis, Saved } from './CullaNative.types';

type Fake = { id: string; video: boolean; taken: number; size: number; w: number; h: number; bucket: string; path: string; duration: number; scene: number; shot: number; kind: string; a: Omit<RawAnalysis, 'id'> };

const HOUR = 3600_000;
const now = Date.UTC(2026, 9, 20, 9);
const enc = (v: number[]) => btoa(String.fromCharCode(...v.map(x => (x + 256) % 256)));
// Seeded pseudo-random vectors, so different scenes really are unrelated.
const sceneVec = (seed: number) => {
  let t = seed * 0x9e3779b9;
  return Array.from({ length: 64 }, () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return Math.round((((r ^ (r >>> 14)) >>> 0) / 4294967296 - 0.5) * 220);
  });
};
const jitter = (v: number[], s: number) => v.map((x, i) => Math.max(-127, Math.min(127, x + Math.round(Math.sin(s * 13 + i) * 9))));
const hash = (n: number) => ((n * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(2);

const PALETTES = [['#0ea5e9', '#f59e0b'], ['#10b981', '#1e3a8a'], ['#f43f5e', '#fde68a'], ['#8b5cf6', '#22d3ee'], ['#f97316', '#0f766e'], ['#64748b', '#e2e8f0'], ['#84cc16', '#7c2d12'], ['#ec4899', '#1e293b']];

function svg(f: Fake): string {
  const [a, b] = PALETTES[f.scene % PALETTES.length];
  const dx = (f.shot * 7) % 30;
  let body = `<rect width="400" height="300" fill="${a}"/><circle cx="${120 + dx}" cy="140" r="70" fill="${b}"/><rect x="${220 - dx}" y="170" width="140" height="90" rx="12" fill="#ffffff" opacity=".35"/>`;
  if (f.kind === 'face' || f.kind === 'eyes') {
    const closed = f.kind === 'eyes';
    body += `<circle cx="${200 + dx}" cy="130" r="60" fill="#fcd9b6"/><circle cx="${180 + dx}" cy="120" r="${closed ? 1 : 7}" fill="#222"/><circle cx="${220 + dx}" cy="120" r="${closed ? 1 : 7}" fill="#222"/>` +
      (closed ? `<path d="M${172 + dx} 120h16M${212 + dx} 120h16" stroke="#222" stroke-width="3"/>` : '') + `<path d="M${180 + dx} 150q20 18 40 0" stroke="#a33" stroke-width="4" fill="none"/>`;
  }
  if (f.kind === 'pocket') body = `<rect width="400" height="300" fill="#0b0b0b"/><ellipse cx="320" cy="60" rx="90" ry="50" fill="#2a1f1a"/>`;
  if (f.kind === 'shot') body = `<rect width="300" height="600" fill="#f8fafc"/><rect y="0" width="300" height="56" fill="${a}"/>${[90, 130, 170, 210, 250, 290].map(y => `<rect x="20" y="${y}" width="${200 + (y % 60)}" height="14" rx="7" fill="#cbd5e1"/>`).join('')}`;
  if (f.kind === 'receipt') body = `<rect width="300" height="400" fill="#fffef5"/>${[40, 70, 100, 130, 160, 190, 230, 270].map(y => `<rect x="30" y="${y}" width="${150 + (y % 90)}" height="10" fill="#555"/>`).join('')}`;
  const blur = f.kind === 'blurry' ? `<filter id="b"><feGaussianBlur stdDeviation="9"/></filter>` : '';
  const vw = f.kind === 'shot' ? '0 0 300 600' : f.kind === 'receipt' ? '0 0 300 400' : '0 0 400 300';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vw}">${blur}<g ${blur ? 'filter="url(#b)"' : ''}>${body}</g></svg>`);
}

function build(): Fake[] {
  const out: Fake[] = [];
  let id = 1000;
  const add = (o: Partial<Fake> & { scene: number; kind: string; taken: number }, a: Partial<RawAnalysis> = {}) => {
    const shot = out.length;
    const v = o.kind === 'pocket' ? sceneVec(999 + shot) : jitter(sceneVec(o.scene), shot);
    out.push({
      id: String(id++), video: false, size: 3_200_000 + (shot % 7) * 410_000, w: 4000, h: 3000, bucket: 'Camera', path: 'DCIM/Camera/', duration: 0, shot, ...o,
      a: {
        sharp: 700 + (shot % 5) * 90, noise: 2.5, lum: 118, std: 58, clipLow: 0.03, clipHigh: 0.01, entropy: 7.3, colour: 55,
        hash: hash(shot + 1), emb: enc(v), faces: [], labels: [], text: null, lat: null, lon: null, ...a,
      },
    } as Fake);
  };
  const face = (eyes: number, sharp = 300) => [{ x: 0.35, y: 0.2, w: 0.3, h: 0.4, leftEye: eyes, rightEye: eyes, smile: 0.7, sharp }];
  // Bursts of similar shots over the last few weeks.
  const bursts: [number, string[], string][] = [
    [1, ['plain', 'plain', 'blurry', 'plain', 'plain'], 'Beach'],
    [2, ['face', 'eyes', 'face', 'face'], ''],
    [3, ['plain', 'plain', 'plain'], 'Food'],
    [4, ['face', 'face', 'eyes', 'blurry', 'face', 'face'], ''],
    [5, ['plain', 'plain'], 'Dog'],
    [6, ['plain', 'blurry', 'plain', 'plain'], 'Mountain'],
    [7, ['face', 'eyes', 'face'], ''],
  ];
  bursts.forEach(([scene, kinds, label], bi) => {
    const t0 = now - (bi * 3 + 1) * 24 * HOUR;
    kinds.forEach((k, i) => add({ scene, kind: k, taken: t0 + i * 4000 }, {
      sharp: k === 'blurry' ? 14 : 500 + ((i * 37) % 400),
      faces: k === 'face' ? face(0.9, 280 + i * 20) : k === 'eyes' ? face(0.06) : [],
      labels: label ? [{ t: label, c: 0.9 }, ...(label === 'Dog' ? [{ t: 'Pet', c: 0.8 }] : [])] : k === 'face' || k === 'eyes' ? [{ t: 'Smile', c: 0.8 }] : [],
    }));
  });
  // Single good photos.
  for (let i = 0; i < 40; i++) add({ scene: 20 + i, kind: i % 6 === 0 ? 'face' : 'plain', taken: now - (i * 19 + 2) * HOUR }, {
    sharp: 400 + (i * 53) % 900, faces: i % 6 === 0 ? face(0.85) : [], labels: [{ t: ['Sky', 'Plant', 'Flower', 'Car', 'Cake', 'Building'][i % 6], c: 0.82 }],
  });
  // Problems on their own.
  for (let i = 0; i < 6; i++) add({ scene: 80 + i, kind: 'pocket', taken: now - (i * 31 + 5) * HOUR, size: 1_100_000 }, { sharp: 0.4, lum: 9, std: 3, clipLow: 0.9, entropy: 1.8, colour: 2 });
  for (let i = 0; i < 4; i++) add({ scene: 90 + i, kind: 'blurry', taken: now - (i * 41 + 9) * HOUR }, { sharp: 11 + i });
  for (let i = 0; i < 3; i++) add({ scene: 95 + i, kind: 'plain', taken: now - (i * 50 + 3) * HOUR }, { noise: 9.5 + i, lum: 52 });
  // Screenshots, WhatsApp copies, receipts.
  for (let i = 0; i < 14; i++) add({ scene: 110 + i, kind: 'shot', taken: now - (i * 13 + 1) * HOUR, bucket: 'Screenshots', path: 'Pictures/Screenshots/', size: 650_000 + i * 40_000, w: 1080, h: 2340 }, { text: 'Settings Wi-Fi Bluetooth Display Battery ' + i });
  for (let i = 0; i < 2; i++) add({ scene: 140 + i, kind: 'receipt', taken: now - (i * 60 + 7) * HOUR, w: 3000, h: 4000 }, { labels: [{ t: 'Paper', c: 0.9 }], text: 'TAX INVOICE Woolworths Metro Sydney total $42.10 card ending 1234 thank you' });
  const first = out[0];
  out.push({ ...first, id: String(id++), bucket: 'WhatsApp Images', path: 'Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/', taken: first.taken + 6 * 24 * HOUR, size: 310_000, w: 1600, h: 1200, a: { ...first.a, sharp: 260 } });
  // Videos.
  for (let i = 0; i < 6; i++) out.push({ id: String(id++), video: true, taken: now - (i * 90 + 4) * HOUR, size: [1.9e9, 640e6, 420e6, 88e6, 51e6, 12e6][i], w: 3840, h: 2160, bucket: 'Camera', path: 'DCIM/Camera/', duration: [612e3, 205e3, 140e3, 31e3, 20e3, 6e3][i], scene: 150 + i, shot: 0, kind: 'plain', a: null as never });
  return out.sort((a, b) => b.taken - a.taken);
}

class CullaNativeModule extends NativeModule<{ onUpdateProgress: (e: { progress: number }) => void }> {
  private items = build();
  private bin: Fake[] = [];
  private access: Access = 'none';

  getAccess(): Access { return this.access; }
  async requestAccess(): Promise<Access> { this.access = 'full'; return this.access; }

  private cols(list: Fake[]): MediaColumns {
    return {
      id: list.map(f => f.id), video: list.map(f => f.video), uri: list.map(f => svg(f)), taken: list.map(f => f.taken),
      size: list.map(f => f.size), w: list.map(f => f.w), h: list.map(f => f.h), mime: list.map(f => (f.video ? 'video/mp4' : 'image/jpeg')),
      bucket: list.map(f => f.bucket), path: list.map(f => f.path), duration: list.map(f => f.duration),
      expires: list.map(() => now + 30 * 24 * HOUR), name: list.map(f => `IMG_${f.id}.jpg`),
    };
  }

  async listMedia(trashed: boolean) { return this.cols(trashed ? this.bin : this.items); }

  async analyze(ids: string[]): Promise<string> {
    await new Promise(r => setTimeout(r, 40));
    return JSON.stringify(ids.map(id => ({ id, ...this.items.find(f => f.id === id)!.a })));
  }

  async analyzeFaces(ids: string[]): Promise<string> {
    await new Promise(r => setTimeout(r, 40));
    return JSON.stringify(ids.map(id => ({ id, faces: this.items.find(f => f.id === id)!.a.faces.map(f => ({ ...f, yaw: 4, pitch: 2, roll: 0 })), fv: 2 })));
  }

  async readText() { return null; }

  async trash(ids: string[]) {
    if (!confirm(`Allow Culla to move ${ids.length} items to trash?`)) return false;
    this.bin.push(...this.items.filter(f => ids.includes(f.id)));
    this.items = this.items.filter(f => !ids.includes(f.id));
    return true;
  }

  async restore(ids: string[]) {
    this.items.push(...this.bin.filter(f => ids.includes(f.id)));
    this.bin = this.bin.filter(f => !ids.includes(f.id));
    return true;
  }

  async deleteForever(ids: string[]) {
    if (!confirm(`Allow Culla to permanently delete ${ids.length} items?`)) return false;
    this.bin = this.bin.filter(f => !ids.includes(f.id));
    return true;
  }

  private copy(id: string, factor: number, suffix: string): Saved {
    const f = this.items.find(x => x.id === id)!;
    const c: Fake = { ...f, id: f.id + suffix, size: Math.round(f.size * factor), shot: f.shot + 1 };
    this.items.push(c);
    return { id: c.id, uri: svg(c), size: c.size, w: c.w, h: c.h };
  }

  async compress(id: string) { await new Promise(r => setTimeout(r, 150)); return this.copy(id, 0.42, 'c'); }
  async autoParams() { return { brightness: 0.12, contrast: 0.2, saturation: 0.1, warmth: 0 }; }
  async saveEdit(id: string, _e: EditParams) { return this.copy(id, 0.9, 'e'); }
  async downloadUpdate(_url: string) {
    for (let i = 1; i <= 10; i++) { await new Promise(r => setTimeout(r, 60)); this.emit('onUpdateProgress', { progress: i / 10 }); }
    return '/cache/updates/culla-update.apk';
  }
  canInstallUpdates() { return true; }
  openInstallPermission() {}
  installUpdate(path: string) { (globalThis as any).__installed = path; }
  async storage() {
    const used = this.items.reduce((s, f) => s + f.size, 0);
    return { total: 128e9, free: 128e9 - 96e9 - used };
  }
}

export default registerWebModule(CullaNativeModule, 'CullaNativeModule');
