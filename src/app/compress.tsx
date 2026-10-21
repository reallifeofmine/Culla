import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ActionBar } from '../components/ActionBar';
import { Button, Card, Empty, Progress } from '../components/ui';
import { bytes, day, plural } from '../lib/format';
import { Culla } from '../lib/native';
import { refresh, trash, useStore } from '../lib/store';
import { type, useTheme } from '../theme';

const LEVELS = [
  { key: 'balanced', title: 'Balanced', note: 'Up to 4000 px, high quality. Looks the same on any screen.', maxDim: 4000, quality: 85, est: 0.5 },
  { key: 'small', title: 'Smaller', note: 'Up to 3000 px. Great for phones, social and most prints.', maxDim: 3000, quality: 80, est: 0.32 },
] as const;

export default function Compress() {
  const { c } = useTheme();
  const media = useStore(s => s.media);
  const candidates = useMemo(() => media.filter(m => m.type === 'photo' && /jpe?g/i.test(m.mime) && m.size >= 2.5e6).sort((a, b) => b.size - a.size), [media]);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>(LEVELS[0]);
  const [done, setDone] = useState<{ originals: string[]; before: number; after: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const total = candidates.reduce((n, m) => n + m.size, 0);

  const run = async () => {
    setProgress(0);
    const originals: string[] = [];
    let before = 0, after = 0;
    for (let i = 0; i < candidates.length; i++) {
      const m = candidates[i];
      try {
        const out = await Culla.compress(m.id, level.maxDim, level.quality);
        if (out.size < m.size * 0.9) { originals.push(m.id); before += m.size; after += out.size; }
      } catch { /* skip photos that can't be read */ }
      setProgress((i + 1) / candidates.length);
    }
    setProgress(null);
    setDone({ originals, before, after });
    await refresh();
  };
  const removeOriginals = async () => {
    if (!done) return;
    setBusy(true);
    try { if (await trash(done.originals)) setDone({ ...done, originals: [] }); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 12 }}>
        <Card>
          <Text style={[type.h2, { color: c.text }]}>Smaller copies saved</Text>
          <Text style={[type.body, { color: c.muted, marginTop: 6 }]}>
            {plural(done.originals.length, 'photo')} went from {bytes(done.before)} to {bytes(done.after)}. The copies sit right next to the originals with the same date and location.
          </Text>
        </Card>
        {done.originals.length ? (
          <Card style={{ backgroundColor: c.accentSoft, borderColor: c.accentSoft }}>
            <Text style={[type.body, { color: c.text }]}>Move the originals to the Bin to free {bytes(done.before - done.after)}. They stay recoverable for 30 days.</Text>
            <Button title="Move originals to Bin" icon="trash" kind="danger" busy={busy} onPress={removeOriginals} style={{ marginTop: 10 }} />
          </Card>
        ) : <Text style={[type.body, { color: c.accent }]}>Originals moved to the Bin.</Text>}
      </View>
    );
  }

  if (!candidates.length) return <Empty icon="checkmark-done" title="No large photos" body="Every JPEG photo is already under 2.5 MB." />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={candidates.slice(0, 60)} keyExtractor={m => m.id} numColumns={4} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 12 }}>
            <Text style={[type.body, { color: c.muted }]}>
              {plural(candidates.length, 'photo')} over 2.5 MB use {bytes(total)}. Culla saves a smaller copy of each, then you choose whether to remove the originals.
            </Text>
            {LEVELS.map(l => (
              <Pressable key={l.key} onPress={() => setLevel(l)} style={{ padding: 14, borderRadius: 14, borderWidth: 2, borderColor: level.key === l.key ? c.accent : c.line, backgroundColor: c.card }}>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={[type.body, { color: c.text, fontWeight: '700', flex: 1 }]}>{l.title}</Text>
                  <Text style={[type.body, { color: c.accent, fontWeight: '700' }]}>≈ {bytes(total * (1 - l.est))} saved</Text>
                </View>
                <Text style={[type.small, { color: c.muted }]}>{l.note}</Text>
              </Pressable>
            ))}
            {progress !== null ? <View style={{ gap: 6 }}><Progress value={progress} /><Text style={[type.small, { color: c.muted }]}>Shrinking… {Math.round(progress * 100)}%</Text></View> : null}
          </View>
        }
        renderItem={({ item: m }) => (
          <View style={{ width: '25%', padding: 2 }}>
            <Image source={{ uri: m.uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: 6 }} contentFit="cover" recyclingKey={m.id} />
            <Text style={[type.tiny, { color: c.muted }]}>{bytes(m.size)} · {day(m.taken)}</Text>
          </View>
        )}
      />
      <ActionBar>
        <Button title={progress !== null ? 'Working…' : `Shrink ${plural(candidates.length, 'photo')}`} icon="contract" busy={progress !== null} onPress={run} style={{ flex: 1 }} />
      </ActionBar>
    </View>
  );
}
