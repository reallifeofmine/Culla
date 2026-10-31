import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Button, Empty, Pill } from '../../components/ui';
import { bytes, day, time } from '../../lib/format';
import { bestReasons, rankSet, reasons } from '../../lib/quality';
import { sortGroups, trash, useStore } from '../../lib/store';
import { ZoomViewer } from '../../components/ZoomViewer';
import { type, useTheme } from '../../theme';

export default function GroupReview() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const groups = sortGroups(useStore(s => s.groups), useStore(s => s.similarSort));
  const byId = useStore(s => s.byId);
  const sens = useStore(s => s.sensitivity);
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const index = groups.findIndex(g => g.id === id);
  const g = groups[index];
  // Everything except the best starts ticked for deletion. The user can pick a different best.
  const [bestId, setBestId] = useState<string>('');
  const [viewing, setViewing] = useState<string>('');
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!g) return;
    setBestId(g.best); setViewing(g.best); setRemove(new Set(g.ids.filter(x => x !== g.best)));
  }, [g?.id]);
  useEffect(() => { if (g) nav.setOptions({ title: `Set ${index + 1} of ${groups.length}` }); }, [index, groups.length]);

  // The suggested pick first, then the rest from best to worst.
  const { items, scores } = useMemo(() => {
    if (!g) return { items: [], scores: new Map<string, number>() };
    const ms = g.ids.map(x => byId.get(x)).filter(Boolean) as NonNullable<ReturnType<typeof byId.get>>[];
    const { scores } = rankSet(ms);
    return { items: ms.sort((a, b) => (a.id === g.best ? -1 : b.id === g.best ? 1 : scores.get(b.id)! - scores.get(a.id)!)), scores };
  }, [g, byId]);
  if (!g) return <Empty icon="checkmark-done" title="All done" body="This set has been cleaned up."><Button title="Back to sets" onPress={() => router.back()} /></Empty>;

  const best = byId.get(bestId) ?? byId.get(g.best)!;
  const hero = byId.get(viewing) ?? best;
  const heroGone = remove.has(hero.id);
  const saving = items.filter(m => remove.has(m.id)).reduce((n, m) => n + m.size, 0);
  const toggle = (x: string) => setRemove(prev => { const n = new Set(prev); n.has(x) ? n.delete(x) : n.add(x); return n; });
  // The old best is let go unless chosen again; photos the user chose to keep stay kept.
  const pickBest = (x: string) => {
    setRemove(prev => { const n = new Set(prev); n.delete(x); if (bestId && bestId !== x) n.add(bestId); return n; });
    setBestId(x); setViewing(x);
  };
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
        <Pressable onPress={() => setZoomAt(items.findIndex(m => m.id === hero.id))} accessibilityLabel="Zoom in on this photo"
          style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: c.raised }}>
          <Image source={{ uri: hero.uri }} style={{ width: '100%', aspectRatio: hero.w && hero.h ? Math.max(0.75, Math.min(1.6, hero.w / hero.h)) : 4 / 3 }} contentFit="contain" />
          <View style={{ position: 'absolute', top: 10, left: 10 }}>
            <Pill label={hero.id === best.id ? ['★ Best of this set', ...(best.id === g.best ? bestReasons(best, items) : [])].join(' · ') : heroGone ? 'Will be deleted' : 'Keeping'} tone={hero.id === best.id ? 'good' : heroGone ? 'bad' : 'neutral'} />
          </View>
          <View style={{ position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.overlay, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="expand" size={14} color="#fff" /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Tap to zoom</Text>
          </View>
        </Pressable>
        {hero.id !== best.id ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Make best" icon="star" onPress={() => pickBest(hero.id)} style={{ flex: 1.3 }} />
            <Button title={heroGone ? 'Keep too' : 'Delete'} kind="secondary" icon={heroGone ? 'checkmark' : 'trash'} onPress={() => toggle(hero.id)} style={{ flex: 1 }} />
          </View>
        ) : null}
        <Text style={[type.small, { color: c.muted }]}>{day(g.taken)} · {time(g.taken)} · tap a photo to see it larger, tap its circle to keep or delete</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {items.map(m => {
            const gone = remove.has(m.id);
            const why = m.id === best.id ? ['Best', ...(best.id === g.best ? bestReasons(best, items) : ['your pick'])] : reasons(m, best, sens, items);
            const shown = m.id === hero.id;
            return (
              <Pressable key={m.id} onPress={() => setViewing(m.id)} accessibilityLabel={`Show larger. ${gone ? 'Will be deleted' : 'Keeping'}: ${why.join(', ')}`}
                style={{ width: cell, borderRadius: 12, overflow: 'hidden', borderWidth: 3, borderColor: shown ? c.text : gone ? c.danger : c.accent, backgroundColor: c.raised }}>
                <Image source={{ uri: m.uri }} style={{ width: '100%', aspectRatio: 1, opacity: gone ? 0.5 : 1 }} contentFit="cover" recyclingKey={m.id} />
                <Pressable onPress={() => toggle(m.id)} hitSlop={10} accessibilityLabel={gone ? 'Keep this photo' : 'Delete this photo'}
                  style={{ position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 15, backgroundColor: gone ? c.danger : c.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                  <Ionicons name={gone ? 'trash' : 'checkmark'} size={16} color="#fff" />
                </Pressable>
                <View style={{ padding: 6, gap: 2 }}>
                  <Text style={[type.tiny, { color: gone ? c.danger : c.accent, fontWeight: '800' }]}>{gone ? 'Delete' : m.id === best.id ? '★ Keep' : 'Keep'}</Text>
                  <Text style={[type.tiny, { color: c.muted }]} numberOfLines={2}>{why.join(' · ')} · {Math.round(scores.get(m.id) ?? 0)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {zoomAt !== null ? (
        <ZoomViewer items={items} start={zoomAt} best={best.id} removed={remove}
          onPickBest={x => pickBest(x)} onToggle={toggle} onClose={() => setZoomAt(null)} />
      ) : null}
      <ActionBar>
        <Button title="Skip" kind="secondary" onPress={next} style={{ flex: 0.6 }} />
        <Button title={remove.size ? `Delete ${remove.size} · ${bytes(saving)}` : 'Keep all'} kind={remove.size ? 'danger' : 'primary'} icon={remove.size ? 'trash' : 'checkmark'} busy={busy} onPress={apply} style={{ flex: 1.4 }} />
      </ActionBar>
    </View>
  );
}
