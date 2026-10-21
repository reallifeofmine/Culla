// Thin wrapper over the native module: turns column listings into Media records.
import Culla, { type MediaColumns, type RawAnalysis } from '../../modules/culla-native';
import type { Analysis, Media } from './quality';

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

export function toAnalysis(r: RawAnalysis): Analysis {
  return {
    sharp: r.sharp, noise: r.noise, lum: r.lum, std: r.std, clipLow: r.clipLow, clipHigh: r.clipHigh,
    entropy: r.entropy, colour: r.colour, hash: r.hash, emb: r.emb, faces: r.faces, labels: r.labels,
    text: r.text, lat: r.lat, lon: r.lon,
  };
}
