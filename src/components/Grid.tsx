import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { FlatList, Pressable, Text, useWindowDimensions, View, type ListRenderItem } from 'react-native';
import { duration } from '../lib/format';
import type { Item } from '../lib/store';
import { useTheme } from '../theme';
import { Pill } from './ui';

export type Badge = { label: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' };

type CellProps = {
  item: Item; size: number; selected: boolean; selecting: boolean; badges?: Badge[];
  onToggle: (id: string) => void; onOpen: (id: string) => void;
  /** Tap always opens the photo; the corner circle selects it. */
  tapToView?: boolean;
};

const Cell = memo(function Cell({ item, size, selected, selecting, badges, onToggle, onOpen, tapToView }: CellProps) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={() => (tapToView || !selecting ? onOpen(item.id) : onToggle(item.id))}
      onLongPress={() => onToggle(item.id)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${item.type === 'video' ? 'Video' : 'Photo'}${selected ? ', selected' : ''}`}
      style={{ width: size, height: size, padding: 1.5 }}>
      <Image source={{ uri: item.uri }} style={{ flex: 1, borderRadius: 6, backgroundColor: c.raised, opacity: selected ? 0.55 : 1 }} contentFit="cover" recyclingKey={item.id} transition={120} />
      {item.type === 'video' ? (
        <View style={{ position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.overlay, borderRadius: 6, paddingHorizontal: 5 }}>
          <Ionicons name="play" size={10} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{duration(item.duration)}</Text>
        </View>
      ) : null}
      {badges?.length ? (
        <View style={{ position: 'absolute', left: 6, right: 30, bottom: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {badges.slice(0, 2).map(b => <Pill key={b.label} label={b.label} tone={b.tone} />)}
        </View>
      ) : null}
      {tapToView || selecting || selected ? (
        <Pressable onPress={() => onToggle(item.id)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={selected ? 'Selected for deletion' : 'Select for deletion'}
          style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#fff', backgroundColor: selected ? c.danger : 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </Pressable>
      ) : null}
    </Pressable>
  );
});

export function Grid({ items, selected, selecting, onToggle, badges, header, columns, onOpen }: {
  items: Item[]; selected: Set<string>; selecting: boolean; onToggle: (id: string) => void;
  /** Custom open (e.g. the full-screen viewer); tapping then always opens. */
  onOpen?: (id: string) => void;
  badges?: (m: Item) => Badge[] | undefined; header?: React.ReactElement; columns?: number;
}) {
  const { width } = useWindowDimensions();
  const cols = columns ?? (width > 700 ? 5 : 3);
  const size = Math.floor(Math.min(width, 900) / cols);
  const details = useCallback((id: string) => router.push({ pathname: '/photo/[id]', params: { id } }), []);
  const open = onOpen ?? details;
  const render: ListRenderItem<Item> = ({ item }) => (
    <Cell item={item} size={size} selected={selected.has(item.id)} selecting={selecting} badges={badges?.(item)} onToggle={onToggle} onOpen={open} tapToView={!!onOpen} />
  );
  return (
    <FlatList
      data={items} key={cols} numColumns={cols} renderItem={render} keyExtractor={m => m.id}
      extraData={selected} ListHeaderComponent={header} contentContainerStyle={{ paddingBottom: 120, alignSelf: 'center', width: size * cols }}
      initialNumToRender={24} windowSize={7} removeClippedSubviews
    />
  );
}
