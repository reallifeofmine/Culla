import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Button, Empty, Pill } from '../../components/ui';
import { bytes, day, time } from '../../lib/format';
import { keepScore, reasons } from '../../lib/quality';
import { trash, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

export default function GroupReview() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groups = useStore(s => s.groups);
  const byId = useStore(s => s.byId);
  const sens = useStore(s => s.sensitivity);
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const index = groups.findIndex(g => g.id === id);
  const g = groups[index];
  // Everything except the best starts ticked for deletion.
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (g) setRemove(new Set(g.ids.filter(x => x !== g.best))); }, [g?.id]);
  useEffect(() => { if (g) nav.setOptions({ title: `Set ${index + 1} of ${groups.length}` }); }, [index, groups.length]);

  // The pick first, then the rest from best to worst.
  const items = useMemo(() => (g
    ? (g.ids.map(x => byId.get(x)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[])
      .sort((a, b) => (a.id === g.best ? -1 : b.id === g.best ? 1 : keepScore(b) - keepScore(a)))
    : []), [g, byId]);
  if (!g) return <Empty icon="checkmark-done" title="All done" body="This set has been cleaned up."><Button title="Back to sets" onPress={() => router.back()} /></Empty>;

  const best = byId.get(g.best)!;
  const keep = items.filter(m => !remove.has(m.id));
  const hero = keep.find(m => m.id === g.best) ?? keep[0] ?? best;
  const saving = items.filter(m => remove.has(m.id)).reduce((n, m) => n + m.size, 0);
  const toggle = (x: string) => setRemove(prev => { const n = new Set(prev); n.has(x) ? n.delete(x) : n.add(x); return n; });
  const next = () => {
    const after = groups[index + 1] ?? groups[index - 1];
    if (after && after.id !== g.id) router.replace({ pathname: '/group/[id]', params: { id: after.id } });
    else router.back();
  };
  const apply = async () => {
    if (!remove.size) { next(); return; }
    setBusy(true);
    try { if (await trash([...remove])) next(); } finally { setBusy(false); }
  };
  const cell = Math.floor((Math.min(width, 900) - 32 - 16) / 3);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 14 }}>
        <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: c.raised }}>
          <Image source={{ uri: hero.uri }} style={{ width: '100%', aspectRatio: hero.w && hero.h ? Math.max(0.75, Math.min(1.6, hero.w / hero.h)) : 4 / 3 }} contentFit="contain" />
          <View style={{ position: 'absolute', top: 10, left: 10 }}><Pill label={hero.id === g.best ? '★ Best of this set' : 'Keeping'} tone="good" /></View>
        </View>
        <Text style={[type.small, { color: c.muted }]}>{day(g.taken)} · {time(g.taken)} · tap a photo to keep it or let it go</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {items.map(m => {
            const gone = remove.has(m.id);
            const why = m.id === g.best ? ['Best'] : reasons(m, best, sens);
            return (
              <Pressable key={m.id} onPress={() => toggle(m.id)} accessibilityLabel={`${gone ? 'Will be deleted' : 'Keeping'}: ${why.join(', ')}`}
                style={{ width: cell, borderRadius: 12, overflow: 'hidden', borderWidth: 3, borderColor: gone ? c.danger : c.accent, backgroundColor: c.raised }}>
                <Image source={{ uri: m.uri }} style={{ width: '100%', aspectRatio: 1, opacity: gone ? 0.5 : 1 }} contentFit="cover" recyclingKey={m.id} />
                <View style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: gone ? c.danger : c.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={gone ? 'trash' : 'checkmark'} size={15} color="#fff" />
                </View>
                <View style={{ padding: 6, gap: 2 }}>
                  <Text style={[type.tiny, { color: gone ? c.danger : c.accent, fontWeight: '800' }]}>{gone ? 'Delete' : m.id === g.best ? '★ Keep' : 'Keep'}</Text>
                  <Text style={[type.tiny, { color: c.muted }]} numberOfLines={1}>{why.join(' · ')} · {Math.round(keepScore(m))}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <ActionBar>
        <Button title="Skip" kind="secondary" onPress={next} style={{ flex: 0.6 }} />
        <Button title={remove.size ? `Delete ${remove.size} · ${bytes(saving)}` : 'Keep all'} kind={remove.size ? 'danger' : 'primary'} icon={remove.size ? 'trash' : 'checkmark'} busy={busy} onPress={apply} style={{ flex: 1.4 }} />
      </ActionBar>
    </View>
  );
}
