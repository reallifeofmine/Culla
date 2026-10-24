import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Item } from '../lib/store';
import { type, useTheme } from '../theme';
import { Button, Pill } from './ui';

const MAX = 5;
const STEPS = [1, 1.6, 2.5, 4];

/**
 * Pinch to zoom (up to 5×), drag to pan while zoomed, double-tap or the +/− buttons to step zoom,
 * swipe at 1× for the next photo. Gestures come from react-native-gesture-handler (reliable on
 * Android, unlike PanResponder); callbacks run on the JS thread and drive Animated values.
 */
function Zoomable({ uri, onSwipe }: { uri: string; onSwipe: (dir: 1 | -1) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const g = useRef({ scale: 1, x: 0, y: 0, startScale: 1, startX: 0, startY: 0 });
  const [level, setLevel] = useState(1);

  const apply = (s: number, x: number, y: number) => {
    const v = g.current;
    v.scale = Math.min(MAX, Math.max(1, s));
    v.x = v.scale === 1 ? 0 : x; v.y = v.scale === 1 ? 0 : y;
    scale.setValue(v.scale); tx.setValue(v.x); ty.setValue(v.y);
  };
  const settle = () => setLevel(g.current.scale);
  useEffect(() => { apply(1, 0, 0); settle(); }, [uri]);

  const pinch = usePinchGesture({
    runOnJS: true,
    onBegin: () => { g.current.startScale = g.current.scale; },
    onUpdate: e => apply(g.current.startScale * e.scale, g.current.x, g.current.y),
    onFinalize: settle,
  });
  const pan = usePanGesture({
    runOnJS: true,
    onBegin: () => { g.current.startX = g.current.x; g.current.startY = g.current.y; },
    onUpdate: e => { if (g.current.scale > 1) apply(g.current.scale, g.current.startX + e.translationX, g.current.startY + e.translationY); },
    onDeactivate: e => {
      if (g.current.scale === 1 && Math.abs(e.translationX) > 60 && Math.abs(e.translationX) > Math.abs(e.translationY)) onSwipe(e.translationX < 0 ? 1 : -1);
    },
  });
  const doubleTap = useTapGesture({
    runOnJS: true,
    numberOfTaps: 2,
    onDeactivate: () => { apply(g.current.scale > 1 ? 1 : 2.5, 0, 0); settle(); },
  });
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);

  const step = (dir: 1 | -1) => {
    const cur = g.current.scale;
    const next = dir > 0 ? STEPS.find(s => s > cur + 0.05) ?? MAX : [...STEPS].reverse().find(s => s < cur - 0.05) ?? 1;
    apply(next, g.current.x, g.current.y); settle();
  };
  const round = { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={{ flex: 1, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
          <Image source={{ uri }} style={{ flex: 1 }} contentFit="contain" />
        </Animated.View>
      </GestureDetector>
      <View style={{ position: 'absolute', right: 12, bottom: 12, gap: 10 }}>
        <Pressable onPress={() => step(1)} disabled={level >= MAX - 0.01} accessibilityLabel="Zoom in" style={[round, { opacity: level >= MAX - 0.01 ? 0.4 : 1 }]}>
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
        <Pressable onPress={() => step(-1)} disabled={level <= 1} accessibilityLabel="Zoom out" style={[round, { opacity: level <= 1 ? 0.4 : 1 }]}>
          <Ionicons name="remove" size={28} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Full-screen viewer with zoom and swipe. In a similar set it also picks the best (pass `best`
 * and `onPickBest`); in other lists it offers Details (edit, shrink) instead.
 */
export function ZoomViewer({ items, start, best, removed, onPickBest, onToggle, onDetails, onClose }: {
  items: Item[]; start: number; best?: string; removed: Set<string>;
  onPickBest?: (id: string) => void; onToggle: (id: string) => void; onDetails?: (id: string) => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(start);
  useEffect(() => setI(start), [start]);
  const m = items[Math.min(i, items.length - 1)];
  if (!m) return null;
  const go = (d: 1 | -1) => setI(x => Math.min(items.length - 1, Math.max(0, x + d)));
  const isBest = m.id === best;
  const gone = removed.has(m.id);
  const keeping = items.filter(x => !removed.has(x.id)).length;
  const sets = !!onPickBest;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Modals are a separate window on Android, so they need their own gesture root. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={12} style={{ padding: 6 }}><Ionicons name="close" size={28} color="#fff" /></Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: '#fff', fontWeight: '700' }]}>{i + 1} of {items.length}</Text>
            <Text style={[type.tiny, { color: '#bbb' }]}>{sets ? `Keeping ${keeping} · deleting ${items.length - keeping}` : `${items.length - keeping} selected to delete`}</Text>
          </View>
          <Pill label={isBest ? '★ Best' : gone ? 'Will be deleted' : 'Keeping'} tone={isBest || !gone ? 'good' : 'bad'} />
        </View>
        <Zoomable uri={m.uri} onSwipe={go} />
        <Text style={[type.small, { color: '#bbb', textAlign: 'center', paddingVertical: 6 }]}>Pinch, double-tap or use + / − to zoom · swipe for the next photo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={() => go(-1)} disabled={i === 0} accessibilityLabel="Previous photo" style={{ padding: 8, opacity: i === 0 ? 0.3 : 1 }}><Ionicons name="chevron-back" size={28} color="#fff" /></Pressable>
          {sets ? (
            <Button title={isBest ? 'Best' : 'Make best'} icon="star" kind={isBest ? 'secondary' : 'primary'} disabled={isBest}
              onPress={() => onPickBest!(m.id)} style={{ flex: 1, paddingHorizontal: 10, backgroundColor: isBest ? c.raised : c.accent }} />
          ) : onDetails ? (
            <Button title="Details" icon="information-circle" kind="secondary" onPress={() => onDetails(m.id)} style={{ flex: 1, paddingHorizontal: 10 }} />
          ) : null}
          {/* The best photo is always kept; any other photo can be kept too or deleted. The label is the action. */}
          <Button title={isBest ? 'Kept' : gone ? 'Keep' : 'Delete'} icon={isBest || gone ? 'checkmark' : 'trash'} disabled={isBest}
            kind={gone ? 'secondary' : 'danger'} onPress={() => onToggle(m.id)}
            style={{ flex: 1, paddingHorizontal: 10 }} />
          <Pressable onPress={() => go(1)} disabled={i === items.length - 1} accessibilityLabel="Next photo" style={{ padding: 8, opacity: i === items.length - 1 ? 0.3 : 1 }}><Ionicons name="chevron-forward" size={28} color="#fff" /></Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
