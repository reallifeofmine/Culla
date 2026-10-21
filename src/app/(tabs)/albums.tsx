import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Empty } from '../../components/ui';
import { ALBUMS } from '../../lib/quality';
import { useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

export default function Albums() {
  const { c } = useTheme();
  const albums = useStore(s => s.albums);
  const byId = useStore(s => s.byId);
  const analysed = useStore(s => s.analysed);
  const photos = useStore(s => s.photos);
  const [q, setQ] = useState('');
  const { width } = useWindowDimensions();
  const cols = width > 700 ? 4 : 2;
  const list = ALBUMS.filter(a => albums[a.key].length);
  const go = () => { if (q.trim()) router.push({ pathname: '/list/[kind]', params: { kind: 'search', q: q.trim() } }); };

  return (
    <FlatList
      data={list} key={cols} numColumns={cols} keyExtractor={a => a.key}
      contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ padding: 4, gap: 8, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={20} color={c.muted} />
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={go} returnKeyType="search" placeholder="Search: beach, receipt, dog, March…" placeholderTextColor={c.muted}
              style={{ flex: 1, padding: 12, fontSize: 16, color: c.text }} accessibilityLabel="Search photos" />
          </View>
          <Text style={[type.small, { color: c.muted }]}>
            Sorted automatically by what’s in each photo, and the words in documents and screenshots.
            {analysed < photos ? ` Still checking ${(photos - analysed).toLocaleString()} photos.` : ''}
          </Text>
        </View>
      }
      ListEmptyComponent={<Empty icon="albums" title="Albums appear as photos are checked" />}
      renderItem={({ item: a }) => {
        const ids = albums[a.key];
        const cover = byId.get(ids[0]);
        return (
          <Pressable onPress={() => router.push({ pathname: '/list/[kind]', params: { kind: a.key } })} style={{ width: `${100 / cols}%`, padding: 4 }}>
            <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              {cover ? <Image source={{ uri: cover.uri }} style={{ width: '100%', aspectRatio: 1.2 }} contentFit="cover" recyclingKey={cover.id} /> : <View style={{ aspectRatio: 1.2, backgroundColor: c.raised }} />}
              <View style={{ padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={a.icon as any} size={16} color={c.accent} />
                <Text style={[type.body, { color: c.text, fontWeight: '700', flex: 1 }]} numberOfLines={1}>{a.title}</Text>
                <Text style={[type.small, { color: c.muted }]}>{ids.length.toLocaleString()}</Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
