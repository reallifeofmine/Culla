import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Grid } from '../../components/Grid';
import { Button, Empty } from '../../components/ui';
import { bytes, plural } from '../../lib/format';
import { Culla, toMedia } from '../../lib/native';
import { refresh, useStore, type Item } from '../../lib/store';
import { type, useTheme } from '../../theme';

export default function Bin() {
  const { c } = useTheme();
  const access = useStore(s => s.access);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => {
    if (access === 'none' || access === 'unknown') return;
    Culla.listMedia(true).then(cols => setItems(toMedia(cols).sort((a, b) => a.expires - b.expires))).catch(() => {});
  }, [access]);
  useFocusEffect(load);

  const toggle = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = selected.size ? [...selected] : items.map(m => m.id);
  const size = items.filter(m => ids.includes(m.id)).reduce((n, m) => n + m.size, 0);
  const act = async (what: 'restore' | 'delete') => {
    setBusy(what);
    try {
      const ok = what === 'restore' ? await Culla.restore(ids) : await Culla.deleteForever(ids);
      if (ok) { setSelected(new Set()); load(); if (what === 'restore') await refresh(); }
    } finally { setBusy(null); }
  };

  if (!items.length) return <Empty icon="trash-bin" title="The Bin is empty" body="Photos you delete in Culla wait here for 30 days, so you can change your mind. Empty the Bin to free the space straight away." />;
  const soonest = Math.max(0, Math.ceil((items[0].expires - Date.now()) / 86400000));

  return (
    <View style={{ flex: 1 }}>
      <Grid items={items} selected={selected} selecting onToggle={toggle}
        header={
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{plural(items.length, 'item')} · {bytes(items.reduce((n, m) => n + m.size, 0))}</Text>
            <Text style={[type.small, { color: c.muted }]}>Still using space until deleted. The oldest go automatically in {plural(soonest, 'day')}. Tap to select some, or act on everything.</Text>
          </View>
        } />
      <ActionBar>
        <Button title={selected.size ? `Restore ${selected.size}` : 'Restore all'} kind="secondary" icon="arrow-undo" busy={busy === 'restore'} onPress={() => act('restore')} style={{ flex: 1 }} />
        <Button title={`${selected.size ? 'Delete' : 'Empty'} · ${bytes(size)}`} kind="danger" icon="trash" busy={busy === 'delete'} onPress={() => act('delete')} style={{ flex: 1.2 }} />
      </ActionBar>
    </View>
  );
}
