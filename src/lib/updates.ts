// In-app updates: compare this build with the newest GitHub release and collect "what's new"
// bullet points from every release newer than the one installed.
import * as Application from 'expo-application';
import { Platform } from 'react-native';

const RELEASES = 'https://api.github.com/repos/reallifeofmine/culla/releases?per_page=20';

export type Update = { build: number; url: string; size: number; notes: string[] };

export const currentBuild = () => Number(Application.nativeBuildVersion ?? 0);

const buildOf = (tag: string) => Number(tag.match(/build(\d+)/)?.[1] ?? 0);

import { bullets } from './updates-notes';

export async function checkForUpdate(): Promise<Update | null> {
  // The browser preview has no real build number; only test the flow when asked to.
  const forced = Platform.OS === 'web' && typeof location !== 'undefined' && location.search.includes('updateTest');
  if (Platform.OS === 'web' && !forced) return null;
  const mine = forced ? 1 : currentBuild();
  if (!mine) return null;
  const res = await fetch(RELEASES, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const list: { tag_name: string; body: string | null; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string; size: number }[] }[] = await res.json();
  const newer = list.filter(r => !r.draft && !r.prerelease && buildOf(r.tag_name) > mine).sort((a, b) => buildOf(b.tag_name) - buildOf(a.tag_name));
  const latest = newer[0];
  const apk = latest?.assets.find(a => a.name.endsWith('.apk'));
  if (!latest || !apk) return null;
  const notes = [...new Set(newer.flatMap(r => bullets(r.body ?? '')))];
  return { build: buildOf(latest.tag_name), url: apk.browser_download_url, size: apk.size, notes };
}

// Lets Settings ask the popup to check right now.
const listeners = new Set<() => void>();
export const onCheckRequested = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const requestUpdateCheck = () => listeners.forEach(l => l());
