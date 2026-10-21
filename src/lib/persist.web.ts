// Browser preview: keep everything in memory.
import type { Analysis } from './quality';

const rows = new Map<string, Analysis>();
const settings = new Map<string, string>();

export const persist = {
  async loadAll() { return new Map(rows); },
  async save(items: [string, Analysis][]) { for (const [id, a] of items) rows.set(id, a); },
  async remove(ids: string[]) { ids.forEach(id => rows.delete(id)); },
  async clear() { rows.clear(); },
  async getSetting(key: string) { return settings.get(key) ?? null; },
  async setSetting(key: string, value: string) { settings.set(key, value); },
};
