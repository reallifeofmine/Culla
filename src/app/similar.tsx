import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Platform, Pressable, Text, View } from 'react-native';
import { ActionBar } from '../components/ActionBar';
import { Button, Empty } from '../components/ui';
import { bytes, day, time } from '../lib/format';
import { setSimilarSort, sortGroups, trash, useStore } from '../lib/store';
import { type, useTheme } from '../theme';

export default function Similar() {
  const { c } = useTheme();
  const sort = useStore(s => s.similarSort);
  const groups = sortGroups(useStore(s => s.groups), sort);
  const byId = useStore(s => s.byId);
  const [busy, setBusy] = useState(false);
  const extras = groups.flatMap(g => g.ids.filter(id => id !== g.best));
  const saving = groups.reduce((n, g) => n + g.saving, 0);

  const cleanAll = () => {
    const go = async () => { setBusy(true); try { await trash(extras); } finally { setBusy(false); } };
    const msg = `Keep the best photo of each of the ${groups.length} sets and move the other ${extras.length} to the Bin? You can review each set first if you prefer.`;
    if (Platform.OS === 'web') { if (confirm(msg)) go(); return; }
    Alert.alert('Clean up all sets?', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Move to Bin', style: 'destructive', onPress: go }]);
  };

  if (!groups.length) return <Empty icon="checkmark-done" title="No similar shots" body="Nothing to tidy here right now. New bursts show up after the next check." />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={groups} keyExtractor={g => g.id} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', backgroundColor: c.raised, borderRadius: 12, padding: 4 }} accessibilityRole="tablist">
              {([['recent', 'Most recent'], ['saving', 'Biggest saving']] as const).map(([k, label]) => (
                <Pressable key={k} onPress={() => setSimilarSort(k)} accessibilityRole="tab" accessibilityState={{ selected: sort === k }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: sort === k ? c.card : 'transparent' }}>
                  <Text style={[type.body, { color: sort === k ? c.text : c.muted, fontWeight: '700' }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[type.body, { color: c.muted }]}>Each set keeps its best photo (★). Tap a set to zoom in and choose differently.</Text>
          </View>
        }
        renderItem={({ item: g }) => (
          <Pressable onPress={() => router.push({ pathname: '/group/[id]', params: { id: g.id } })} style={({ pressed }) => ({ backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.line, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700', flex: 1 }]}>{day(g.taken)} · {time(g.taken)}</Text>
              <Text style={[type.small, { color: c.accent, fontWeight: '700' }]}>Save {bytes(g.saving)}</Text>
              <Ionicons name="chevron-forward" size={18} color={c.muted} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {g.ids.slice(0, 4).map(id => {
                const m = byId.get(id);
                if (!m) return null;
                const best = id === g.best;
                return (
                  <View key={id} style={{ flex: 1, aspectRatio: 1, borderRadius: 10, overflow: 'hidden', borderWidth: best ? 3 : 0, borderColor: c.accent }}>
                    <Image source={{ uri: m.uri }} style={{ flex: 1, opacity: best ? 1 : 0.6 }} contentFit="cover" recyclingKey={id} />
                    {best ? <View style={{ position: 'absolute', top: 4, left: 4, backgroundColor: c.accent, borderRadius: 8, paddingHorizontal: 5 }}><Text style={{ color: c.accentText, fontSize: 11, fontWeight: '800' }}>★ Keep</Text></View> : null}
                  </View>
                );
              })}
              {g.ids.length > 4 ? <View style={{ justifyContent: 'center', paddingHorizontal: 4 }}><Text style={[type.small, { color: c.muted }]}>+{g.ids.length - 4}</Text></View> : null}
            </View>
          </Pressable>
        )}
      />
      <ActionBar>
        <Button title={`Clean all · ${bytes(saving)}`} icon="sparkles" onPress={cleanAll} busy={busy} style={{ flex: 1 }} />
      </ActionBar>
    </View>
  );
}
