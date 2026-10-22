import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '../lib/store';
import { type, useTheme } from '../theme';
import { Button, Pill } from './ui';

const MAX = 5;
const dist = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/** Pinch to zoom (up to 5×), drag to pan while zoomed, double-tap to zoom in or reset. */
function Zoomable({ uri, onSwipe }: { uri: string; onSwipe: (dir: 1 | -1) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const g = useRef({ scale: 1, x: 0, y: 0, startScale: 1, startDist: 0, startX: 0, startY: 0, lastTap: 0, pinching: false });

  const apply = (s: number, x: number, y: number) => {
    const v = g.current;
    v.scale = s; v.x = s === 1 ? 0 : x; v.y = s === 1 ? 0 : y;
    scale.setValue(v.scale); tx.setValue(v.x); ty.setValue(v.y);
  };
  useEffect(() => { apply(1, 0, 0); }, [uri]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => {
      const v = g.current;
      v.startScale = v.scale; v.startX = v.x; v.startY = v.y; v.pinching = false;
      if (e.nativeEvent.touches.length === 2) { v.pinching = true; v.startDist = dist(e); }
    },
    onPanResponderMove: (e, gs) => {
      const v = g.current;
      if (e.nativeEvent.touches.length === 2) {
        if (!v.pinching) { v.pinching = true; v.startDist = dist(e); v.startScale = v.scale; }
        apply(Math.min(MAX, Math.max(1, v.startScale * (dist(e) / v.startDist))), v.x, v.y);
      } else if (v.scale > 1 && !v.pinching) {
        apply(v.scale, v.startX + gs.dx, v.startY + gs.dy);
      }
    },
    onPanResponderRelease: (_e, gs) => {
      const v = g.current;
      const tap = Math.abs(gs.dx) < 8 && Math.abs(gs.dy) < 8 && !v.pinching;
      if (tap) {
        const now = Date.now();
        if (now - v.lastTap < 300) { apply(v.scale > 1 ? 1 : 2.5, 0, 0); v.lastTap = 0; } else v.lastTap = now;
      } else if (v.scale === 1 && !v.pinching && Math.abs(gs.dx) > 60 && Math.abs(gs.dx) > Math.abs(gs.dy)) {
        onSwipe(gs.dx < 0 ? 1 : -1);
      }
      v.pinching = false;
    },
  }), [onSwipe]);

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} {...pan.panHandlers}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
        <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

/** Full-screen look at each photo of a set, with zoom, to pick the keeper. */
export function ZoomViewer({ items, start, best, onPickBest, onClose }: {
  items: Item[]; start: number; best: string; onPickBest: (id: string) => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(start);
  useEffect(() => setI(start), [start]);
  const m = items[Math.min(i, items.length - 1)];
  if (!m) return null;
  const go = (d: 1 | -1) => setI(x => Math.min(items.length - 1, Math.max(0, x + d)));
  const isBest = m.id === best;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={{ padding: 6 }}><Ionicons name="close" size={28} color="#fff" /></Pressable>
          <Text style={[type.body, { color: '#fff', fontWeight: '700', flex: 1 }]}>{i + 1} of {items.length}</Text>
          {isBest ? <Pill label="★ Best" tone="good" /> : null}
        </View>
        <Zoomable uri={m.uri} onSwipe={go} />
        <Text style={[type.small, { color: '#bbb', textAlign: 'center', paddingVertical: 6 }]}>Pinch or double-tap to zoom · swipe for the next photo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={() => go(-1)} disabled={i === 0} accessibilityLabel="Previous photo" style={{ padding: 12, opacity: i === 0 ? 0.3 : 1 }}><Ionicons name="chevron-back" size={28} color="#fff" /></Pressable>
          <Button title={isBest ? 'This is the best' : 'Make this the best'} icon="star" kind={isBest ? 'secondary' : 'primary'} disabled={isBest}
            onPress={() => onPickBest(m.id)} style={{ flex: 1, backgroundColor: isBest ? c.raised : c.accent }} />
          <Pressable onPress={() => go(1)} disabled={i === items.length - 1} accessibilityLabel="Next photo" style={{ padding: 12, opacity: i === items.length - 1 ? 0.3 : 1 }}><Ionicons name="chevron-forward" size={28} color="#fff" /></Pressable>
        </View>
      </View>
    </Modal>
  );
}
