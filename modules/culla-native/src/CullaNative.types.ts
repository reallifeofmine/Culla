export type Access = 'full' | 'limited' | 'none';

/** Column-oriented listing straight from MediaStore. */
export type MediaColumns = {
  id: string[]; video: boolean[]; uri: string[]; taken: number[]; size: number[]; w: number[]; h: number[];
  mime: string[]; bucket: string[]; path: string[]; duration: number[]; expires: number[]; name: string[];
};

export type RawFace = { x: number; y: number; w: number; h: number; leftEye: number | null; rightEye: number | null; smile: number | null; sharp: number; px?: number; eyeLum?: number | null };

export type RawAnalysis = {
  id: string; error?: string;
  sharp: number; noise: number; lum: number; std: number; clipLow: number; clipHigh: number; entropy: number; colour: number;
  hash: string; emb: string | null; faces: RawFace[]; labels: { t: string; c: number }[]; text: string | null;
  lat: number | null; lon: number | null; v?: number;
};

export type Saved = { id: string; uri: string; size: number; w: number; h: number };

export type EditParams = {
  rotate?: number;
  crop?: { x: number; y: number; w: number; h: number } | null;
  brightness?: number; contrast?: number; saturation?: number; warmth?: number;
};
