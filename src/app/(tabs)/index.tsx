import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Card, Empty, Progress, type IconName } from '../../components/ui';
import { bytes, plural } from '../../lib/format';
import { pauseScan, requestAccess, resumeScan, sizeOf, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

type Row = { key: string; icon: IconName; title: string; count: number; size: number; tone: 'accent' | 'danger' | 'warn' | 'muted'; go: () => void; hint?: string };

export default function Clean() {
  const { c } = useTheme();
  const s = useStore(x => x);

  const rows = useMemo<Row[]>(() => {
    if (!s.loaded) return [];
    const groupPhotos = s.groups.reduce((n, g) => n + g.ids.length - 1, 0);
    const groupSaving = s.groups.reduce((n, g) => n + g.saving, 0);
    const list = (kind: string) => () => router.push({ pathname: '/list/[kind]', params: { kind } });
    const bigVideos = s.media.filter(m => m.type === 'video' && m.size >= 100e6).map(m => m.id);
    const bigPhotos = s.media.filter(m => m.type === 'photo' && /jpe?g/i.test(m.mime) && m.size >= 2.5e6).map(m => m.id);
    return [
      { key: 'similar', icon: 'copy', title: 'Similar shots', count: groupPhotos, size: groupSaving, tone: 'accent', go: () => router.push('/similar'), hint: `${plural(s.groups.length, 'set')} — keep the best of each` },
      { key: 'accidental', icon: 'hand-left', title: 'Accidental shots', count: s.flagged.accidental.length, size: sizeOf(s.flagged.accidental), tone: 'danger', go: list('accidental'), hint: 'Pocket shots, black frames, fingers' },
      { key: 'blurry', icon: 'water', title: 'Blurry', count: s.flagged.blurry.length, size: sizeOf(s.flagged.blurry), tone: 'warn', go: list('blurry') },
      { key: 'eyesClosed', icon: 'eye-off', title: 'Eyes closed', count: s.flagged.eyesClosed.length, size: sizeOf(s.flagged.eyesClosed), tone: 'warn', go: list('eyesClosed') },
      { key: 'noisy', icon: 'grid', title: 'Grainy or too dark', count: new Set([...s.flagged.noisy, ...s.flagged.dark, ...s.flagged.bright]).size, size: sizeOf([...new Set([...s.flagged.noisy, ...s.flagged.dark, ...s.flagged.bright])]), tone: 'warn', go: list('exposure') },
      { key: 'screenshots', icon: 'phone-portrait', title: 'Screenshots', count: s.albums.screenshots.length, size: sizeOf(s.albums.screenshots), tone: 'muted', go: list('screenshots') },
      { key: 'whatsapp', icon: 'logo-whatsapp', title: 'WhatsApp images', count: s.albums.whatsapp.length, size: sizeOf(s.albums.whatsapp), tone: 'muted', go: list('whatsapp') },
      { key: 'videos', icon: 'videocam', title: 'Large videos', count: bigVideos.length, size: sizeOf(bigVideos), tone: 'muted', go: list('largeVideos'), hint: 'Over 100 MB each' },
      { key: 'compress', icon: 'contract', title: 'Shrink large photos', count: bigPhotos.length, size: Math.round(sizeOf(bigPhotos) * 0.5), tone: 'accent', go: () => router.push('/compress'), hint: 'Save about half the space, keep the look' },
    ];
  }, [s.version, s.loaded]);

  if (s.access === 'none') {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 40 }}>
        <Empty icon="images" title="Let’s tidy your photos" body="Culla finds similar shots, blurry and accidental photos, and helps you free up space. It looks at your photos on this phone only — nothing is uploaded.">
          <Button title="Allow access to photos" icon="lock-open" onPress={() => requestAccess()} style={{ alignSelf: 'stretch', marginTop: 12 }} />
          <Text style={[type.small, { color: c.muted, textAlign: 'center', marginTop: 8 }]}>Choose “Allow all” so Culla can check your whole gallery.</Text>
        </Empty>
      </ScrollView>
    );
  }

  const potential = rows.filter(r => r.key !== 'compress' && r.key !== 'screenshots' && r.key !== 'whatsapp' && r.key !== 'videos').reduce((n, r) => n + r.size, 0);
  const used = s.storage ? s.storage.total - s.storage.free : 0;
  const mediaSize = s.media.reduce((n, m) => n + m.size, 0);
  const progress = s.photos ? s.analysed / s.photos : 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      {s.access === 'limited' ? (
        <Card style={{ backgroundColor: c.warnSoft, borderColor: c.warnSoft }}>
          <Text style={[type.body, { color: c.text }]}>Culla can only see the photos you picked. To check your whole gallery, allow access to all photos.</Text>
          <Button title="Allow all photos" kind="secondary" onPress={() => requestAccess()} style={{ marginTop: 10 }} />
        </Card>
      ) : null}

      <Card>
        <Text style={[type.small, { color: c.muted }]}>You could free up</Text>
        <Text style={{ fontSize: 40, fontWeight: '800', color: c.accent, letterSpacing: -1 }}>{bytes(potential)}</Text>
        {s.storage ? (
          <>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: c.raised, flexDirection: 'row', overflow: 'hidden', marginTop: 8 }}>
              <View style={{ width: `${(Math.max(0, used - mediaSize) / s.storage.total) * 100}%`, backgroundColor: c.muted, opacity: 0.5 }} />
              <View style={{ width: `${(Math.max(0, mediaSize - potential) / s.storage.total) * 100}%`, backgroundColor: c.accent, opacity: 0.55 }} />
              <View style={{ width: `${(potential / s.storage.total) * 100}%`, backgroundColor: c.accent }} />
            </View>
            <Text style={[type.small, { color: c.muted, marginTop: 8 }]}>
              Photos & videos use {bytes(mediaSize)} · {bytes(s.storage.free)} free of {bytes(s.storage.total)}
            </Text>
          </>
        ) : null}
      </Card>

      {s.loaded && (s.scanning || s.analysed < s.photos) ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <Ionicons name={s.scanning ? 'scan' : 'pause-circle'} size={22} color={c.accent} />
            <Text style={[type.body, { color: c.text, fontWeight: '700', flex: 1 }]}>
              {s.scanning ? 'Checking your photos…' : 'Check paused'}
            </Text>
            <Text style={[type.small, { color: c.muted }]}>{s.analysed.toLocaleString()} / {s.photos.toLocaleString()}</Text>
          </View>
          <Progress value={progress} />
          <Text style={[type.small, { color: c.muted, marginTop: 8 }]}>
            Newest first, so recent photos are ready soon. Keep Culla open — it’s quickest while charging. Results update as it goes.
          </Text>
          {s.scanError ? <Text style={[type.small, { color: c.danger, marginTop: 6 }]}>{s.scanError}</Text> : null}
          <Button title={s.scanning ? 'Pause' : 'Continue'} kind="secondary" icon={s.scanning ? 'pause' : 'play'} onPress={() => (s.scanning ? pauseScan() : resumeScan())} style={{ marginTop: 10 }} />
        </Card>
      ) : null}

      {rows.map(r => (
        <Card key={r.key} onPress={r.count ? r.go : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: r.count ? 1 : 0.55 }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: { accent: c.accentSoft, danger: c.dangerSoft, warn: c.warnSoft, muted: c.raised }[r.tone] }}>
            <Ionicons name={r.icon} size={22} color={{ accent: c.accent, danger: c.danger, warn: c.warn, muted: c.muted }[r.tone]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{r.title}</Text>
            <Text style={[type.small, { color: c.muted }]} numberOfLines={1}>{r.count ? r.hint ?? plural(r.count, 'item') : 'Nothing found'}</Text>
          </View>
          {r.count ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{r.count.toLocaleString()}</Text>
              <Text style={[type.tiny, { color: c.muted }]}>{bytes(r.size)}</Text>
            </View>
          ) : null}
          {r.count ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null}
        </Card>
      ))}
    </ScrollView>
  );
}
