import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Empty } from '../../components/ui';
import { bytes, day, duration, time } from '../../lib/format';
import { Culla } from '../../lib/native';
import { refresh, trash, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

const SPEEDS = [1, 2, 5, 10];
const FRAMES = 8;
/** Shortest clip that can be saved, in seconds. */
const MIN_CLIP = 1;

export default function Video() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const m = useStore(s => s.byId.get(id));
  const nav = useNavigation();
  useEffect(() => { if (m) nav.setOptions({ title: `${day(m.taken)} · ${time(m.taken)}` }); }, [m?.id]);

  const player = useVideoPlayer(m?.uri ?? null, p => { p.timeUpdateEventInterval = 0.25; p.loop = false; });
  const [now, setNow] = useState(0);
  const [length, setLength] = useState((m?.duration ?? 0) / 1000);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frames, setFrames] = useState<VideoThumbnail[]>([]);
  const [trimming, setTrimming] = useState(false);
  const [clip, setClip] = useState<[number, number]>([0, 0]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const clipRef = useRef(clip); clipRef.current = clip;
  const trimRef = useRef(trimming); trimRef.current = trimming;
  // For recovering from a decoder failure: where we were and whether the user wanted it playing.
  const pos = useRef(0);
  const wanted = useRef(false);
  const recoveries = useRef(0);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // While trimming, play the chosen part on repeat.
    if (trimRef.current && currentTime >= clipRef.current[1]) { player.currentTime = clipRef.current[0]; setNow(clipRef.current[0]); return; }
    pos.current = currentTime;
    setNow(currentTime);
  });
  useEventListener(player, 'playingChange', ({ isPlaying }) => setPlaying(isPlaying));
  useEventListener(player, 'statusChange', ({ status, error }) => {
    // A video decoder can fail mid-play (busy phone, many seeks): reload at the same spot and carry on.
    if (status === 'error' && m && recoveries.current < 5) {
      recoveries.current++;
      console.warn('Culla video error, reloading', error?.message);
      const at = pos.current;
      player.replaceAsync(m.uri).then(() => { player.currentTime = at; if (wanted.current) player.play(); }).catch(() => {});
      return;
    }
    if (status === 'error') setNote(`This video can't be played${error?.message ? ` (${error.message.slice(0, 120)})` : ''}.`);
    if (status !== 'readyToPlay') return;
    const d = player.duration || (m?.duration ?? 0) / 1000;
    setLength(d);
    if (!frames.length && d > 0) {
      player.generateThumbnailsAsync(Array.from({ length: FRAMES }, (_, i) => (d * (i + 0.5)) / FRAMES), { maxWidth: 160 })
        .then(setFrames).catch(() => {});
    }
  });

  if (!m) return <Empty icon="videocam" title="This video is gone" body="It was deleted or moved." />;

  const seek = (t: number) => { const v = Math.max(0, Math.min(length, t)); player.currentTime = v; setNow(v); };
  const setRate = (r: number) => {
    setSpeed(r);
    player.playbackRate = r;
    // Sped-up sound is just noise past 2×.
    player.muted = r > 2;
  };
  const toggle = () => {
    if (playing) { wanted.current = false; player.pause(); return; }
    if (now >= length - 0.05) seek(trimming ? clip[0] : 0);
    wanted.current = true;
    player.play();
  };
  const startTrim = () => {
    // A clip wide enough to grab both handles: 15 s, or a sixth of a long video.
    const span = Math.min(length, Math.max(15, length / 6));
    const start = Math.max(0, Math.min(now, length - span));
    setClip([start, Math.min(length, start + Math.max(MIN_CLIP, span))]);
    setTrimming(true); setNote(null);
  };
  const save = async (deleteOriginal: boolean) => {
    setAsking(false); setBusy(true); wanted.current = false; player.pause();
    try {
      const out = await Culla.trimVideo(m.id, Math.round(clip[0] * 1000), Math.round(clip[1] * 1000), m.taken);
      await refresh();
      setTrimming(false);
      if (deleteOriginal && await trash([m.id])) {
        router.replace({ pathname: '/video/[id]', params: { id: out.id } });
        return;
      }
      setNote(`Saved a ${duration(out.duration)} clip to Movies/Culla.${deleteOriginal ? ' The original was kept.' : ''}`);
    } catch (e) {
      setNote(`Couldn't save the clip: ${String((e as Error).message ?? e).slice(0, 200)}`);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Pressable onPress={toggle} accessibilityLabel={playing ? 'Pause' : 'Play'} style={{ width: '100%', aspectRatio: m.w && m.h ? Math.max(0.56, Math.min(1.78, m.w / m.h)) : 16 / 9 }}>
          <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls={false} />
          {!playing ? (
            <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="play-circle" size={76} color="rgba(255,255,255,0.9)" />
            </View>
          ) : null}
          {speed > 1 ? <Text style={{ position: 'absolute', top: 12, right: 12, color: '#fff', fontWeight: '800', fontSize: 16, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 }}>{speed}×</Text> : null}
        </Pressable>

        <View style={{ padding: 16, gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type.small, { color: '#fff', fontVariant: ['tabular-nums'] }]} accessibilityLabel="Position">{duration(now * 1000)}</Text>
            <Text style={[type.small, { color: '#bbb', fontVariant: ['tabular-nums'] }]}>{duration(length * 1000)}</Text>
          </View>
          <Timeline length={length} now={now} frames={frames} trimming={trimming} clip={clip}
            onSeek={seek} onClip={(k, t) => setClip(p => {
              const n: [number, number] = [...p];
              n[k] = k === 0 ? Math.max(0, Math.min(t, p[1] - MIN_CLIP)) : Math.min(length, Math.max(t, p[0] + MIN_CLIP));
              return n;
            })} />

          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 }}>
            <Pressable onPress={() => seek(now - 10)} hitSlop={10} accessibilityLabel="Back 10 seconds"><Ionicons name="play-back" size={30} color="#fff" /></Pressable>
            <Pressable onPress={toggle} hitSlop={10} accessibilityLabel={playing ? 'Pause' : 'Play'}
              style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={playing ? 'pause' : 'play'} size={32} color={c.accentText} />
            </Pressable>
            <Pressable onPress={() => seek(now + 10)} hitSlop={10} accessibilityLabel="Forward 10 seconds"><Ionicons name="play-forward" size={30} color="#fff" /></Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[type.small, { color: '#bbb' }]}>Speed</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {SPEEDS.map(r => (
                <Pressable key={r} onPress={() => setRate(r)} accessibilityRole="button" accessibilityState={{ selected: speed === r }} accessibilityLabel={`Speed ${r}×`}
                  style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: speed === r ? c.accent : 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ color: speed === r ? c.accentText : '#fff', fontSize: 17, fontWeight: '800' }}>{r}×</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {trimming ? (
            <View style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Text style={[type.body, { color: '#fff', fontWeight: '700' }]} accessibilityLabel="Clip range">
                Clip {duration(clip[0] * 1000)} – {duration(clip[1] * 1000)} · {duration((clip[1] - clip[0]) * 1000)}
              </Text>
              {asking ? (
                <View style={{ gap: 8 }}>
                  <Text style={[type.body, { color: '#fff' }]}>Keep the full video too?</Text>
                  <Button title="Save clip, keep full video" icon="cut" onPress={() => save(false)} />
                  <Button title="Save clip, delete full video" kind="danger" icon="trash" onPress={() => save(true)} />
                  <Button title="Back" kind="ghost" onPress={() => setAsking(false)} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={() => setTrimming(false)} disabled={busy} />
                  <Button title="Save clip" icon="cut" style={{ flex: 1.4 }} busy={busy} onPress={() => setAsking(true)} />
                </View>
              )}
              <Text style={[type.small, { color: '#bbb' }]}>Drag the two handles on the bar, or move the playhead and tap Start here / End here. The clip plays on repeat so you can check it.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Start here" kind="secondary" icon="arrow-forward" style={{ flex: 1 }}
                  onPress={() => setClip(p => [Math.max(0, Math.min(now, p[1] - MIN_CLIP)), p[1]])} />
                <Button title="End here" kind="secondary" icon="arrow-back" style={{ flex: 1 }}
                  onPress={() => setClip(p => [p[0], Math.min(length, Math.max(now, p[0] + MIN_CLIP))])} />
              </View>
            </View>
          ) : (
            <Button title="Trim to a short clip" icon="cut" kind="secondary" onPress={startTrim} disabled={length < MIN_CLIP * 2} />
          )}
          {note ? <Text style={[type.small, { color: '#fff' }]}>{note}</Text> : null}
          <Text style={[type.tiny, { color: '#999' }]}>{bytes(m.size)} · {m.w} × {m.h} · {duration(m.duration)}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/** Seek bar over a strip of frames; in trim mode it also has start and end handles. */
function Timeline({ length, now, frames, trimming, clip, onSeek, onClip }: {
  length: number; now: number; frames: VideoThumbnail[]; trimming: boolean; clip: [number, number];
  onSeek: (t: number) => void; onClip: (k: 0 | 1, t: number) => void;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(1);
  const drag = useRef<'seek' | 0 | 1>('seek');
  const at = (e: GestureResponderEvent) => (Math.max(0, Math.min(width, e.nativeEvent.locationX)) / width) * length;
  const x = (t: number) => (length > 0 ? (t / length) * width : 0);
  const begin = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    // Grab the nearest handle when the finger lands near one; otherwise move the playhead.
    drag.current = trimming && Math.min(Math.abs(px - x(clip[0])), Math.abs(px - x(clip[1]))) < 32
      ? (Math.abs(px - x(clip[0])) <= Math.abs(px - x(clip[1])) ? 0 : 1) : 'seek';
    move(e);
  };
  const move = (e: GestureResponderEvent) => {
    const t = at(e);
    if (drag.current === 'seek') onSeek(t);
    else { onClip(drag.current, t); onSeek(t); }
  };
  const H = 56;
  return (
    <View onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width))} accessibilityLabel="Video timeline" accessibilityRole="adjustable"
      accessibilityValue={{ min: 0, max: Math.round(length), now: Math.round(now) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => onSeek(now + (e.nativeEvent.actionName === 'increment' ? 5 : -5))}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderTerminationRequest={() => false}
      onResponderGrant={begin} onResponderMove={move}
      style={{ height: H + 16, justifyContent: 'center' }}>
      <View pointerEvents="none" style={{ height: H, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)' }}>
        {frames.map((f, i) => <Image key={i} source={f} style={{ flex: 1, height: H }} contentFit="cover" />)}
      </View>
      {trimming ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 8, height: H }}>
          <View style={{ position: 'absolute', left: 0, width: x(clip[0]), top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }} />
          <View style={{ position: 'absolute', left: x(clip[1]), right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }} />
          <View style={{ position: 'absolute', left: x(clip[0]), width: Math.max(0, x(clip[1]) - x(clip[0])), top: 0, bottom: 0, borderWidth: 3, borderColor: c.accent, borderRadius: 8 }} />
          {[0, 1].map(k => (
            <View key={k} style={{ position: 'absolute', left: x(clip[k]) - 10, top: -6, bottom: -6, width: 20, borderRadius: 6, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: c.accentText }} />
            </View>
          ))}
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: x(now) - 2, top: 2, height: H + 12, width: 4, borderRadius: 2, backgroundColor: '#fff' }} />
    </View>
  );
}
