import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Grid, type Badge } from '../../components/Grid';
import { Button, Empty } from '../../components/ui';
import { ZoomViewer } from '../../components/ZoomViewer';
import { bytes, plural } from '../../lib/format';
import { ALBUMS, FLAG_LABEL, issueFlags, search, type AlbumKey, type Flag } from '../../lib/quality';
import { trash, useStore, type Item } from '../../lib/store';
import { type, useTheme } from '../../theme';

const INFO: Record<string, { title: string; note: string; preselect: boolean }> = {
  accidental: { title: 'Accidental shots', note: 'Black frames, pocket shots and photos of fingers. Almost always safe to delete.', preselect: true },
  blurry: { title: 'Blurry', note: 'Out of focus or shaken. Check before deleting — some may be the only photo of a moment.', preselect: false },
  eyesClosed: { title: 'Eyes closed', note: 'Someone blinked. If it’s part of a set, the set view already picks a better one.', preselect: false },
  exposure: { title: 'Noisy or too dark', note: 'Low-light photos with visible noise (night and dim indoor shots), and photos too dark or washed out to see.', preselect: false },
  screenshots: { title: 'Screenshots', note: 'Often only needed for a day. Oldest first.', preselect: false },
  whatsapp: { title: 'WhatsApp images', note: 'Photos saved from chats. Oldest first.', preselect: false },
  largeVideos: { title: 'Large videos', note: 'Videos over 100 MB, largest first.', preselect: false },
};

export default function List() {
  const { c } = useTheme();
  const { kind, q } = useLocalSearchParams<{ kind: string; q?: string }>();
  const s = useStore(x => x);
  const nav = useNavigation();
  const album = ALBUMS.find(a => a.key === kind);
  const info = INFO[kind] ?? { title: kind === 'search' ? `“${q}”` : album?.title ?? '', note: '', preselect: false };
  useEffect(() => { nav.setOptions({ title: info.title }); }, [info.title]);

  const items = useMemo<Item[]>(() => {
    const pick = (ids: string[]) => ids.map(id => s.byId.get(id)).filter(Boolean) as Item[];
    switch (kind) {
      case 'accidental': case 'blurry': case 'eyesClosed': return pick(s.flagged[kind as Flag]);
      case 'exposure': return pick([...new Set([...s.flagged.noisy, ...s.flagged.dark])]);
      case 'screenshots': case 'whatsapp': return pick(s.albums[kind]).sort((a, b) => a.taken - b.taken);
      case 'largeVideos': return s.media.filter(m => m.type === 'video' && m.size >= 100e6).sort((a, b) => b.size - a.size);
      case 'search': return search(s.media, q ?? '') as Item[];
      default: return album ? pick(s.albums[kind as AlbumKey]) : [];
    }
  }, [kind, q, s.version]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [viewAt, setViewAt] = useState<number | null>(null);
  useEffect(() => {
    if (info.preselect) { setSelected(new Set(items.map(m => m.id))); setSelecting(true); }
  }, [kind, items.length]);

  const toggle = (id: string) => { setSelecting(true); setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const allOn = selected.size === items.length && items.length > 0;
  const size = items.filter(m => selected.has(m.id)).reduce((n, m) => n + m.size, 0);
  const badges = (m: Item): Badge[] | undefined => {
    if (m.type === 'video') return [{ label: bytes(m.size) }];
    if (kind === 'exposure' || kind === 'search' || album) {
      const f = issueFlags(m, s.sensitivity);
      return f.length ? f.map(x => ({ label: FLAG_LABEL[x], tone: 'warn' as const })) : undefined;
    }
    return undefined;
  };

  if (!items.length) return <Empty icon="checkmark-done" title="Nothing here" body={kind === 'search' ? 'Try another word, like “beach”, “receipt” or a month.' : 'All clear.'} />;

  const del = async () => {
    setBusy(true);
    try { if (await trash([...selected])) { setSelected(new Set()); setSelecting(false); } } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <Grid items={items} selected={selected} selecting={selecting} onToggle={toggle} badges={badges}
        onOpen={id => setViewAt(items.findIndex(m => m.id === id))}
        header={
          <View style={{ padding: 16, gap: 10 }}>
            {info.note ? <Text style={[type.body, { color: c.muted }]}>{info.note}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700', flex: 1 }]}>{plural(items.length, 'item')} · {bytes(items.reduce((n, m) => n + m.size, 0))}</Text>
              <Pressable onPress={() => { setSelecting(true); setSelected(allOn ? new Set() : new Set(items.map(m => m.id))); }} hitSlop={10}>
                <Text style={[type.body, { color: c.accent, fontWeight: '700' }]}>{allOn ? 'Select none' : 'Select all'}</Text>
              </Pressable>
            </View>
            <Text style={[type.small, { color: c.muted }]}>Tap a photo to zoom and swipe through. Tap its circle to select it.</Text>
          </View>
        } />
      {viewAt !== null ? (
        <ZoomViewer items={items} start={viewAt} removed={selected} onToggle={toggle}
          onDetails={id => { setViewAt(null); router.push({ pathname: '/photo/[id]', params: { id } }); }}
          onClose={() => setViewAt(null)} />
      ) : null}
      {selected.size ? (
        <ActionBar>
          <Button title={`Delete ${selected.size} · ${bytes(size)}`} kind="danger" icon="trash" busy={busy} onPress={del} style={{ flex: 1 }} />
        </ActionBar>
      ) : null}
    </View>
  );
}
