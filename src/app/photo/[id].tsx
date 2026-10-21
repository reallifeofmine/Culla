import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Button, Empty, Pill } from '../../components/ui';
import { bytes, day, duration, time } from '../../lib/format';
import { Culla } from '../../lib/native';
import { albumsFor, ALBUMS, FLAG_LABEL, flags, keepScore } from '../../lib/quality';
import { refresh, trash, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

export default function Photo() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useStore(s => s.byId.get(id));
  const sens = useStore(s => s.sensitivity);
  const nav = useNavigation();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (m) nav.setOptions({ title: `${day(m.taken)} · ${time(m.taken)}` }); }, [m?.id]);
  if (!m) return <Empty icon="image" title="This photo is gone" body="It was deleted or moved." />;

  const a = m.a;
  const f = flags(a, sens);
  const albums = albumsFor(m).map(k => ALBUMS.find(x => x.key === k)!.title);
  const compress = async () => {
    setBusy('compress');
    try {
      const out = await Culla.compress(m.id, 4000, 85);
      setNote(`Saved a smaller copy (${bytes(out.size)}, was ${bytes(m.size)}). Delete the original to free ${bytes(Math.max(0, m.size - out.size))}.`);
      await refresh();
    } catch (e) { setNote(String((e as Error).message ?? e)); } finally { setBusy(null); }
  };
  const del = async () => { setBusy('delete'); try { if (await trash([m.id])) router.back(); } finally { setBusy(null); } };

  const Row = ({ k, v }: { k: string; v: string }) => (
    <View style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Text style={[type.body, { color: c.muted, width: 120 }]}>{k}</Text>
      <Text style={[type.body, { color: c.text, flex: 1 }]}>{v}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={{ backgroundColor: '#000' }}>
          <Image source={{ uri: m.uri }} style={{ width: '100%', aspectRatio: m.w && m.h ? Math.max(0.6, Math.min(1.8, m.w / m.h)) : 1 }} contentFit="contain" />
          {m.type === 'video' ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="play-circle" size={64} color="#fff" /></View> : null}
        </View>
        <View style={{ padding: 16, gap: 10 }}>
          {f.length ? <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{f.map(x => <Pill key={x} label={FLAG_LABEL[x]} tone="warn" />)}</View> : null}
          {note ? <Text style={[type.body, { color: c.accent }]}>{note}</Text> : null}
          <View>
            <Row k="Size" v={`${bytes(m.size)} · ${m.w} × ${m.h}${m.type === 'video' ? ` · ${duration(m.duration)}` : ''}`} />
            <Row k="Folder" v={m.bucket || m.path} />
            {a ? <Row k="Quality" v={`${Math.round(keepScore(m))} / 100 · sharpness ${Math.round(a.sharp)}${a.faces.length ? ` · ${a.faces.length} face${a.faces.length > 1 ? 's' : ''}` : ''}`} /> : null}
            {albums.length ? <Row k="Albums" v={albums.join(', ')} /> : null}
            {a?.labels.length ? <Row k="Contains" v={a.labels.filter(l => l.c >= 0.6).map(l => l.t).join(', ')} /> : null}
            {a?.text ? <Row k="Text" v={a.text.slice(0, 200)} /> : null}
          </View>
        </View>
      </ScrollView>
      <ActionBar>
        {m.type === 'photo' ? <Button title="Edit" kind="secondary" icon="color-wand" onPress={() => router.push({ pathname: '/edit/[id]', params: { id: m.id } })} style={{ flex: 1 }} /> : null}
        {m.type === 'photo' && m.size > 1.5e6 ? <Button title="Shrink" kind="secondary" icon="contract" busy={busy === 'compress'} onPress={compress} style={{ flex: 1 }} /> : null}
        <Button title="Delete" kind="danger" icon="trash" busy={busy === 'delete'} onPress={del} style={{ flex: 1 }} />
      </ActionBar>
    </View>
  );
}
