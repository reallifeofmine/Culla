// Thin wrapper over the native module: turns column listings into Media records.
import Culla, { type MediaColumns, type RawAnalysis, type RawFace } from '../../modules/culla-native';
import type { Analysis, Face, Media } from './quality';

export { Culla };

export function toMedia(c: MediaColumns): (Media & { expires: number; name: string })[] {
  const out = new Array(c.id.length);
  for (let i = 0; i < c.id.length; i++) {
    out[i] = {
      id: c.id[i], type: c.video[i] ? 'video' : 'photo', uri: c.uri[i], taken: c.taken[i], size: c.size[i],
      w: c.w[i], h: c.h[i], mime: c.mime[i], bucket: c.bucket[i], path: c.path[i], duration: c.duration[i],
      expires: c.expires[i], name: c.name[i],
    };
  }
  return out;
}

// The native side leaves out empty values, so every optional field is defaulted here.
export function toAnalysis(r: RawAnalysis): Analysis {
  return {
    sharp: r.sharp ?? 0, noise: r.noise ?? 0, lum: r.lum ?? 0, std: r.std ?? 0, clipLow: r.clipLow ?? 0, clipHigh: r.clipHigh ?? 0,
    entropy: r.entropy ?? 0, colour: r.colour ?? 0, hash: r.hash ?? '0000000000000000', emb: r.emb ?? null,
    faces: toFaces(r.faces),
    labels: r.labels ?? [], text: r.text || null, lat: r.lat ?? null, lon: r.lon ?? null, v: r.v ?? 1, iso: r.iso ?? null, exposure: r.exposure ?? null, fv: r.fv ?? 1,
  };
}

export function toFaces(fs: RawFace[] | undefined): Face[] {
  return (fs ?? []).map(f => ({
    x: f.x, y: f.y, w: f.w, h: f.h, leftEye: f.leftEye ?? null, rightEye: f.rightEye ?? null, smile: f.smile ?? null, sharp: f.sharp ?? -1,
    px: f.px, eyeLum: f.eyeLum ?? null, yaw: f.yaw ?? null, pitch: f.pitch ?? null, roll: f.roll ?? null,
  }));
}
