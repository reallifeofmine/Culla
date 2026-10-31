// App state: the gallery listing, saved analyses, the background scan and derived results
// (similar groups, issue lists, albums). Screens subscribe with useStore().
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { Culla, toAnalysis, toFaces, toMedia } from './native';
import type { RawAnalysis, RawFaces } from '../../modules/culla-native';
import { ANALYSIS_VERSION, FACE_VERSION, issueFlags, groupSimilar, albumsFor, type Analysis, type Flag, type Group, type Media, type Sensitivity, type AlbumKey } from './quality';
import { persist } from './persist';

export type Item = Media & { expires: number; name: string };

type State = {
  access: 'full' | 'limited' | 'none' | 'unknown';
  loaded: boolean;
  media: Item[];
  byId: Map<string, Item>;
  analysed: number;
  photos: number;
  scanning: boolean;
  paused: boolean;
  scanError: string | null;
  groups: Group[];
  flagged: Record<Flag, string[]>;
  albums: Record<AlbumKey, string[]>;
  storage: { total: number; free: number } | null;
  sensitivity: Sensitivity;
  similarSort: SimilarSort;
  version: number; // bumps on every change, for memo keys
};

const emptyFlags = (): Record<Flag, string[]> => ({ blurry: [], eyesClosed: [], noisy: [], dark: [], accidental: [] });
const emptyAlbums = (): Record<AlbumKey, string[]> => ({ people: [], selfies: [], pets: [], food: [], documents: [], nature: [], vehicles: [], screenshots: [], whatsapp: [], downloads: [], videos: [] });

let state: State = {
  access: 'unknown', loaded: false, media: [], byId: new Map(), analysed: 0, photos: 0,
  scanning: false, paused: false, scanError: null, groups: [], flagged: emptyFlags(), albums: emptyAlbums(),
  storage: null, sensitivity: 'normal', similarSort: 'recent', version: 0,
};
const listeners = new Set<() => void>();
const emit = () => { state = { ...state, version: state.version + 1 }; listeners.forEach(l => l()); };
const set = (patch: Partial<State>) => { state = { ...state, ...patch }; emit(); };

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => pick(state), () => pick(state));
}
export const getState = () => state;

// ---------- derived results ----------
let deriveTimer: ReturnType<typeof setTimeout> | null = null;
function derive(now = false) {
  if (deriveTimer) clearTimeout(deriveTimer);
  const run = () => {
    deriveTimer = null;
    const f = emptyFlags();
    const al = emptyAlbums();
    for (const m of state.media) {
      for (const k of albumsFor(m)) al[k].push(m.id);
      for (const fl of issueFlags(m, state.sensitivity)) f[fl].push(m.id);
    }
    set({ groups: groupSimilar(state.media, state.sensitivity), flagged: f, albums: al });
  };
  if (now) run(); else deriveTimer = setTimeout(run, 800);
}

// ---------- loading ----------
export async function init() {
  state.sensitivity = ((await persist.getSetting('sensitivity')) as Sensitivity) || 'normal';
  state.similarSort = ((await persist.getSetting('similarSort')) as SimilarSort) || 'recent';
  const access = Culla.getAccess();
  set({ access });
  if (access !== 'none') await load();
}

export async function requestAccess() {
  const access = await Culla.requestAccess();
  set({ access });
  if (access !== 'none') await load();
  return access;
}

// Analyses live in memory after the first load; returning to the app only re-reads the listing.
let saved: Map<string, Analysis> | null = null;

export async function load() {
  const [cols, storage] = await Promise.all([Culla.listMedia(false), Culla.storage().catch(() => null)]);
  if (!saved) saved = await persist.loadAll();
  const media = toMedia(cols);
  const byId = new Map<string, Item>();
  let analysed = 0, photos = 0;
  for (const m of media) {
    byId.set(m.id, m);
    if (m.type === 'photo') {
      photos++;
      const a = saved!.get(m.id);
      if (a) { m.a = a; if ((a.v ?? 1) >= ANALYSIS_VERSION) analysed++; }
    }
  }
  // Forget analyses of photos that no longer exist.
  const gone = [...saved.keys()].filter(id => !byId.has(id));
  if (gone.length) { gone.forEach(id => saved!.delete(id)); persist.remove(gone).catch(() => {}); }
  set({ media, byId, analysed, photos, loaded: true, storage });
  derive(true);
  startScan();
}

// ---------- scanning ----------
const BATCH = 6;
let scanToken = 0;

export function startScan() {
  if (state.scanning || state.access === 'none') return;
  // New photos and ones measured by an older version (they keep their old results meanwhile).
  const todo = state.media.filter(m => m.type === 'photo' && (!m.a || (m.a.v ?? 1) < ANALYSIS_VERSION)).sort((a, b) => b.taken - a.taken);
  if (!todo.length) { startFaceCheck(); return; }
  const token = ++scanToken;
  set({ scanning: true, paused: false, scanError: null });
  (async () => {
    // A photo that can't be read is skipped; only repeated whole-batch failures stop the check.
    let failedBatches = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      if (token !== scanToken || state.paused) break;
      const batch = todo.slice(i, i + BATCH).filter(m => state.byId.has(m.id));
      if (!batch.length) continue;
      try {
        const res: RawAnalysis[] = JSON.parse(await Culla.analyze(batch.map(m => m.id), batch.map(m => /screenshot/i.test(m.path + m.bucket))));
        const ok: [string, Analysis][] = [];
        let firstError: string | null = null;
        for (const r of res) {
          const m = state.byId.get(r.id);
          if (r.error) { firstError ??= r.error; console.error('Culla analyze', r.id, r.error); continue; }
          if (!m) continue;
          m.a = toAnalysis(r);
          saved?.set(r.id, m.a);
          ok.push([r.id, m.a]);
        }
        await persist.save(ok);
        state.analysed += ok.length;
        failedBatches = ok.length ? 0 : failedBatches + 1;
        if (!ok.length && firstError) state.scanError = `Some photos couldn’t be checked. Please send a screenshot of this. (${firstError.slice(0, 400)})`;
        if (state.scanError && ok.length) state.scanError = null;
        emit();
        derive();
      } catch (e) {
        console.error('Culla analyze batch', e);
        failedBatches++;
        if (failedBatches >= 5) {
          set({ scanError: `Culla couldn’t check your photos. Please send a screenshot of this. (${String((e as Error)?.message ?? e).slice(0, 600)})` });
          break;
        }
      }
    }
    if (token === scanToken) set({ scanning: false });
    derive(true);
    if (token === scanToken && !state.paused) startFaceCheck();
  })();
}

/**
 * Faces-only re-check of photos in similar sets measured by an older face check, so the best
 * pick knows which way people face. Runs quietly after the main check; results improve as it goes.
 */
let faceChecking = false;
function startFaceCheck() {
  if (faceChecking || state.scanning || state.paused) return;
  const inSets = new Set(state.groups.flatMap(g => g.ids));
  const todo = [...inSets].map(id => state.byId.get(id)).filter(m => m?.a && (m.a.fv ?? 1) < FACE_VERSION) as Item[];
  if (!todo.length) return;
  const token = scanToken;
  faceChecking = true;
  (async () => {
    let failures = 0;
    for (let i = 0; i < todo.length && failures < 5; i += BATCH) {
      if (token !== scanToken || state.paused) break;
      const batch = todo.slice(i, i + BATCH).filter(m => state.byId.has(m.id) && m.a);
      if (!batch.length) continue;
      try {
        const res: RawFaces[] = JSON.parse(await Culla.analyzeFaces(batch.map(m => m.id)));
        const ok: [string, Analysis][] = [];
        for (const r of res) {
          const m = state.byId.get(r.id);
          if (r.error || !m?.a) { if (r.error) console.error('Culla faces', r.id, r.error); continue; }
          m.a = { ...m.a, faces: toFaces(r.faces), fv: r.fv ?? FACE_VERSION };
          saved?.set(r.id, m.a);
          ok.push([r.id, m.a]);
        }
        await persist.save(ok);
        failures = ok.length ? 0 : failures + 1;
        derive();
      } catch (e) {
        console.error('Culla faces batch', e);
        failures++;
      }
    }
    faceChecking = false;
    derive(true);
  })();
}

export function pauseScan() { set({ paused: true, scanning: false }); scanToken++; }
export function resumeScan() { set({ paused: false }); startScan(); }

export async function rescanAll() {
  scanToken++;
  await persist.clear();
  saved?.clear();
  for (const m of state.media) m.a = undefined;
  set({ analysed: 0, scanning: false });
  derive(true);
  startScan();
}

export type SimilarSort = 'recent' | 'saving';

/** Similar sets in the order the user chose (newest first, or most space saved first). */
export function sortGroups(groups: Group[], sort: SimilarSort): Group[] {
  return sort === 'saving' ? [...groups].sort((a, b) => b.saving - a.saving) : groups;
}

export async function setSimilarSort(sort: SimilarSort) {
  set({ similarSort: sort });
  await persist.setSetting('similarSort', sort);
}

export async function setSensitivity(s: Sensitivity) {
  await persist.setSetting('sensitivity', s);
  set({ sensitivity: s });
  derive(true);
}

// ---------- changes ----------
/** Moves items to the phone's bin after Android's own confirmation. Returns whether it happened. */
export async function trash(ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const ok = await Culla.trash(ids);
  if (ok) forget(ids);
  return ok;
}

export function forget(ids: string[]) {
  const drop = new Set(ids);
  const analysedGone = ids.filter(id => state.byId.get(id)?.a).length;
  const media = state.media.filter(m => !drop.has(m.id));
  for (const id of ids) { state.byId.delete(id); saved?.delete(id); }
  set({ media, photos: media.filter(m => m.type === 'photo').length, analysed: Math.max(0, state.analysed - analysedGone) });
  persist.remove(ids).catch(() => {});
  derive(true);
  Culla.storage().then(storage => set({ storage })).catch(() => {});
}

/** Re-reads the gallery (after saving edits or compressed copies) without losing analyses. */
export async function refresh() {
  if (state.access === 'none') return;
  await load();
}

export const sizeOf = (ids: string[]) => ids.reduce((s, id) => s + (state.byId.get(id)?.size ?? 0), 0);

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', s => {
    if (s === 'active' && state.loaded) refresh().catch(() => {});
  });
}
