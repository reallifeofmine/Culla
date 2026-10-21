import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../../components/ui';
import { type Sensitivity } from '../../lib/quality';
import { rescanAll, setSensitivity, useStore } from '../../lib/store';
import { type, useTheme } from '../../theme';

const RELEASES = 'https://github.com/reallifeofmine/culla/releases/latest';
const LEVELS: { key: Sensitivity; title: string; note: string }[] = [
  { key: 'relaxed', title: 'Relaxed', note: 'Only flags clearly bad photos.' },
  { key: 'normal', title: 'Normal', note: 'Recommended.' },
  { key: 'strict', title: 'Strict', note: 'Also flags slightly soft or grainy photos.' },
];

export default function Settings() {
  const { c } = useTheme();
  const sens = useStore(s => s.sensitivity);
  const analysed = useStore(s => s.analysed);
  const build = Number(Application.nativeBuildVersion ?? 0);
  const [latest, setLatest] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/reallifeofmine/culla/releases/latest')
      .then(r => r.json()).then(j => { const n = Number(String(j.tag_name ?? '').match(/build(\d+)/)?.[1]); if (n) setLatest(n); }).catch(() => {});
  }, []);

  const rescan = () => {
    const go = () => rescanAll();
    if (Platform.OS === 'web') { if (confirm('Check every photo again?')) go(); return; }
    Alert.alert('Check every photo again?', `This re-checks all ${analysed.toLocaleString()} photos. Only needed after an update that improves detection.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Re-check', onPress: go }]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Text style={[type.h2, { color: c.text, marginBottom: 8 }]}>How picky should Culla be?</Text>
        {LEVELS.map(l => (
          <Pressable key={l.key} onPress={() => setSensitivity(l.key)} accessibilityRole="radio" accessibilityState={{ selected: sens === l.key }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: sens === l.key ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center' }}>
              {sens === l.key ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.accent }} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{l.title}</Text>
              <Text style={[type.small, { color: c.muted }]}>{l.note}</Text>
            </View>
          </Pressable>
        ))}
      </Card>
      <Card>
        <Text style={[type.h2, { color: c.text }]}>Privacy</Text>
        <Text style={[type.body, { color: c.muted, marginTop: 6 }]}>Every check runs on this phone. Your photos are never uploaded, and Culla has no account or tracking.</Text>
      </Card>
      <Card>
        <Text style={[type.h2, { color: c.text }]}>App</Text>
        <Text style={[type.body, { color: c.muted, marginTop: 6 }]}>
          Culla {Application.nativeApplicationVersion ?? ''} (build {build || '–'})
          {latest && build && latest > build ? ` · build ${latest} is available` : latest && build ? ' · up to date' : ''}
        </Text>
        {latest && build && latest > build ? <Button title="Get the update" icon="download" onPress={() => Linking.openURL(RELEASES)} style={{ marginTop: 10 }} /> : null}
        <Button title="Re-check all photos" kind="secondary" icon="refresh" onPress={rescan} style={{ marginTop: 10 }} />
      </Card>
    </ScrollView>
  );
}
