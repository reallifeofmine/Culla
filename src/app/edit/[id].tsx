import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { ActionBar } from '../../components/ActionBar';
import { Button, Empty } from '../../components/ui';
import { Culla } from '../../lib/native';
import { refresh, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

type Adjust = 'brightness' | 'contrast' | 'saturation' | 'warmth';
const ADJUST: { key: Adjust; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'brightness', label: 'Light', icon: 'sunny' },
  { key: 'contrast', label: 'Contrast', icon: 'contrast' },
  { key: 'saturation', label: 'Colour', icon: 'color-palette' },
  { key: 'warmth', label: 'Warmth', icon: 'thermometer' },
];
const ASPECTS: { label: string; r: number | null }[] = [{ label: 'Free', r: null }, { label: 'Square', r: 1 }, { label: '4:5', r: 4 / 5 }, { label: '3:2', r: 3 / 2 }, { label: '16:9', r: 16 / 9 }];
type Crop = { x: number; y: number; w: number; h: number };

/** Horizontal slider (-1..1) built on PanResponder. */
function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { c } = useTheme();
  const width = useRef(1);
  const set = (x: number) => onChange(Math.round(Math.max(-1, Math.min(1, (x / width.current) * 2 - 1)) * 20) / 20);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => set(e.nativeEvent.locationX), onPanResponderMove: e => set(e.nativeEvent.locationX),
  })).current;
  const pos = ((value + 1) / 2) * 100;
  return (
    <View {...pan.panHandlers} onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; }} style={{ height: 44, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityValue={{ min: -100, max: 100, now: Math.round(value * 100) }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.raised }} />
      <View style={{ position: 'absolute', left: `${Math.min(50, pos)}%`, width: `${Math.abs(pos - 50)}%`, height: 4, backgroundColor: c.accent }} />
      <View style={{ position: 'absolute', left: '50%', width: 2, height: 14, marginLeft: -1, backgroundColor: c.muted }} />
      <View style={{ position: 'absolute', left: `${pos}%`, marginLeft: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, borderWidth: 3, borderColor: c.card }} />
    </View>
  );
}

export default function Edit() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useStore(s => s.byId.get(id));
  const [tab, setTab] = useState<'adjust' | 'crop'>('adjust');
  const [active, setActive] = useState<Adjust>('brightness');
  const [vals, setVals] = useState<Record<Adjust, number>>({ brightness: 0, contrast: 0, saturation: 0, warmth: 0 });
  const [rotate, setRotate] = useState(0);
  const [aspect, setAspect] = useState<number | null>(null);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, w: 1, h: 1 });
  const [busy, setBusy] = useState<string | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const turned = rotate % 180 !== 0;
  const ratio = m && m.w && m.h ? (turned ? m.h / m.w : m.w / m.h) : 1;
  // Live values for the drag handlers, which are created once.
  const live = useRef({ crop, aspect, ratio, box: boxSize });
  live.current = { crop, aspect, ratio, box: boxSize };
  const handlers = useMemo(() => {
    const make = (mode: 'move' | 'size') => {
      let start: Crop = live.current.crop;
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { start = live.current.crop; },
        onPanResponderMove: (_e, g) => {
          const { box, aspect: ar, ratio: r } = live.current;
          const dx = g.dx / Math.max(1, box.w), dy = g.dy / Math.max(1, box.h);
          if (mode === 'move') { setCrop({ ...start, x: Math.max(0, Math.min(1 - start.w, start.x + dx)), y: Math.max(0, Math.min(1 - start.h, start.y + dy)) }); return; }
          let w = Math.max(0.15, Math.min(1 - start.x, start.w + dx));
          let h = Math.max(0.15, Math.min(1 - start.y, start.h + dy));
          if (ar) { h = (w * r) / ar; if (start.y + h > 1) { h = 1 - start.y; w = (h * ar) / r; } }
          setCrop({ ...start, w, h });
        },
      }).panHandlers;
    };
    return { move: make('move'), size: make('size') };
  }, []);
  if (!m) return <Empty icon="image" title="Photo not found" />;
  const filter = [
    { brightness: 1 + 0.5 * vals.brightness }, { contrast: 1 + 0.6 * vals.contrast }, { saturate: 1 + vals.saturation },
  ];

  const applyAspect = (r: number | null) => {
    setAspect(r);
    if (!r) { setCrop({ x: 0, y: 0, w: 1, h: 1 }); return; }
    // Largest centred box with the chosen shape.
    const imgRatio = ratio;
    let w = 1, h = 1;
    if (r > imgRatio) h = imgRatio / r; else w = r / imgRatio;
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  const auto = async () => {
    setBusy('auto');
    try { const p = await Culla.autoParams(m.id); setVals({ brightness: p.brightness, contrast: p.contrast, saturation: p.saturation, warmth: p.warmth }); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      const whole = crop.w > 0.999 && crop.h > 0.999;
      await Culla.saveEdit(m.id, { rotate, crop: whole ? null : crop, ...vals });
      await refresh();
      router.back();
    } finally { setBusy(null); }
  };
  const changed = rotate !== 0 || crop.w < 0.999 || crop.h < 0.999 || Object.values(vals).some(v => v !== 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: '100%', aspectRatio: ratio, maxHeight: '100%' }} onLayout={e => setBoxSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {/* When turned sideways the unrotated image is laid out with swapped sides, then rotated into the box. */}
          <Image source={{ uri: m.uri }} contentFit="fill"
            style={{
              position: 'absolute',
              width: turned ? boxSize.h : boxSize.w, height: turned ? boxSize.w : boxSize.h,
              left: turned ? (boxSize.w - boxSize.h) / 2 : 0, top: turned ? (boxSize.h - boxSize.w) / 2 : 0,
              transform: [{ rotate: `${rotate}deg` }], filter,
            }} />
          {vals.warmth ? <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: vals.warmth > 0 ? `rgba(255,140,0,${0.12 * vals.warmth})` : `rgba(0,110,255,${-0.12 * vals.warmth})` }} /> : null}
          {tab === 'crop' ? (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${crop.y * 100}%`, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: `${(crop.y + crop.h) * 100}%`, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: `${crop.x * 100}%`, top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: `${(crop.x + crop.w) * 100}%`, right: 0, top: `${crop.y * 100}%`, height: `${crop.h * 100}%`, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View {...handlers.move} style={{ position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%`, borderWidth: 2, borderColor: '#fff' }}>
                <View {...handlers.size} style={{ position: 'absolute', right: -14, bottom: -14, width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent, borderWidth: 3, borderColor: '#fff' }} />
              </View>
            </>
          ) : null}
        </View>
      </View>

      <View style={{ backgroundColor: c.card, paddingBottom: 96 }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: c.line }}>
          {(['adjust', 'crop'] as const).map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, padding: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: tab === t ? c.accent : 'transparent' }}>
              <Text style={[type.body, { color: tab === t ? c.accent : c.muted, fontWeight: '700' }]}>{t === 'adjust' ? 'Adjust' : 'Crop & rotate'}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'adjust' ? (
          <View style={{ padding: 16, gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable onPress={auto} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accentSoft, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="sparkles" size={18} color={c.accent} /><Text style={{ color: c.accent, fontWeight: '700' }}>{busy === 'auto' ? '…' : 'Auto'}</Text>
              </Pressable>
              {ADJUST.map(a => (
                <Pressable key={a.key} onPress={() => setActive(a.key)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: active === a.key ? c.accent : c.raised, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Ionicons name={a.icon} size={18} color={active === a.key ? c.accentText : c.text} />
                  <Text style={{ color: active === a.key ? c.accentText : c.text, fontWeight: '700' }}>{a.label}{vals[a.key] ? ` ${vals[a.key] > 0 ? '+' : ''}${Math.round(vals[a.key] * 100)}` : ''}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Slider value={vals[active]} onChange={v => setVals(p => ({ ...p, [active]: v }))} />
          </View>
        ) : (
          <View style={{ padding: 16, gap: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable onPress={() => { setRotate(r => (r + 90) % 360); applyAspect(null); }} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: c.raised, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Ionicons name="refresh" size={18} color={c.text} /><Text style={{ color: c.text, fontWeight: '700' }}>Rotate</Text>
              </Pressable>
              {ASPECTS.map(a => (
                <Pressable key={a.label} onPress={() => applyAspect(a.r)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: aspect === a.r ? c.accent : c.raised }}>
                  <Text style={{ color: aspect === a.r ? c.accentText : c.text, fontWeight: '700' }}>{a.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[type.small, { color: c.muted }]}>Drag the box to move it, and the green handle to resize.</Text>
          </View>
        )}
      </View>
      <ActionBar>
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title="Save as copy" icon="checkmark" disabled={!changed} busy={busy === 'save'} onPress={save} style={{ flex: 1.4 }} />
      </ActionBar>
    </View>
  );
}
