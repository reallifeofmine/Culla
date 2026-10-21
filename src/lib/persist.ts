// Saved analyses (SQLite), so a photo is only ever analysed once.
import * as SQLite from 'expo-sqlite';
import type { Analysis } from './quality';

let db: SQLite.SQLiteDatabase | null = null;
async function open() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('culla.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS analysis (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);
  return db;
}

export const persist = {
  async loadAll(): Promise<Map<string, Analysis>> {
    const d = await open();
    const rows = await d.getAllAsync<{ id: string; data: string }>('SELECT id, data FROM analysis');
    const out = new Map<string, Analysis>();
    for (const r of rows) { try { out.set(r.id, JSON.parse(r.data)); } catch { /* skip a corrupt row */ } }
    return out;
  },
  async save(items: [string, Analysis][]) {
    if (!items.length) return;
    const d = await open();
    await d.withTransactionAsync(async () => {
      for (const [id, a] of items) await d.runAsync('INSERT OR REPLACE INTO analysis (id, data) VALUES (?, ?)', id, JSON.stringify(a));
    });
  },
  async remove(ids: string[]) {
    const d = await open();
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await d.runAsync(`DELETE FROM analysis WHERE id IN (${chunk.map(() => '?').join(',')})`, ...chunk);
    }
  },
  async clear() { const d = await open(); await d.runAsync('DELETE FROM analysis'); },
  async getSetting(key: string): Promise<string | null> {
    const d = await open();
    return (await d.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key))?.value ?? null;
  },
  async setSetting(key: string, value: string) {
    const d = await open();
    await d.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
  },
};
