import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, Text, View } from 'react-native';
import { bytes } from '../lib/format';
import { Culla } from '../lib/native';
import { checkForUpdate, onCheckRequested, type Update } from '../lib/updates';
import { type, useTheme } from '../theme';
import { Button, Progress } from './ui';

type Phase = 'offer' | 'downloading' | 'permission' | 'installing' | 'error' | 'none';

/**
 * Checks for a newer build when the app opens (and when asked from Settings), shows what's new,
 * downloads it inside the app and opens Android's update confirmation.
 */
export function UpdatePrompt() {
  const { c } = useTheme();
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>('none');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const apk = useRef<string | null>(null);
  const manual = useRef(false);

  const check = async (byUser = false) => {
    manual.current = byUser;
    try {
      const u = await checkForUpdate();
      if (u) { setUpdate(u); setPhase('offer'); }
      else if (byUser) { setMessage('You have the latest version.'); setPhase('error'); }
    } catch {
      if (byUser) { setMessage('Couldn’t check for updates. Check your connection.'); setPhase('error'); }
    }
  };

  useEffect(() => { check(); return onCheckRequested(() => check(true)); }, []);

  const install = () => {
    if (!apk.current) return;
    if (!Culla.canInstallUpdates()) { setPhase('permission'); return; }
    setPhase('installing');
    Culla.installUpdate(apk.current);
  };

  // Coming back from the "Install unknown apps" setting: carry on if it was allowed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && phase === 'permission' && Culla.canInstallUpdates()) install();
    });
    return () => sub.remove();
  }, [phase]);

  const start = async () => {
    if (!update) return;
    setPhase('downloading'); setProgress(0);
    const sub = Culla.addListener('onUpdateProgress', e => setProgress(e.progress));
    try {
      apk.current = await Culla.downloadUpdate(update.url);
      install();
    } catch (e) {
      setMessage(`The download didn’t finish. ${String((e as Error)?.message ?? '')}`.trim());
      setPhase('error');
    } finally {
      sub.remove();
    }
  };

  if (phase === 'none') return null;
  const close = () => setPhase('none');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 20, maxHeight: '85%', gap: 12 }}>
          {phase === 'error' ? (
            <>
              <Text style={[type.h2, { color: c.text }]}>{message.startsWith('You have') ? 'Up to date' : 'Update'}</Text>
              <Text style={[type.body, { color: c.muted }]}>{message}</Text>
              <Button title="OK" onPress={close} />
            </>
          ) : phase === 'permission' ? (
            <>
              <Text style={[type.h2, { color: c.text }]}>One-time step</Text>
              <Text style={[type.body, { color: c.muted }]}>
                Android needs your OK for Culla to install its own updates. On the next screen, turn on <Text style={{ fontWeight: '700', color: c.text }}>Allow from this source</Text>, then come back — the update continues by itself.
              </Text>
              <Button title="Open setting" icon="settings" onPress={() => Culla.openInstallPermission()} />
              <Button title="Cancel" kind="ghost" onPress={close} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={22} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.h2, { color: c.text }]}>Update available</Text>
                  <Text style={[type.small, { color: c.muted }]}>Build {update?.build} · {bytes(update?.size ?? 0)}</Text>
                </View>
              </View>
              {update?.notes.length ? (
                <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
                  <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>What’s new</Text>
                  {update.notes.map((n, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={[type.body, { color: c.accent }]}>•</Text>
                      <Text style={[type.body, { color: c.text, flex: 1 }]}>{n}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {phase === 'downloading' ? (
                <View style={{ gap: 6 }}>
                  <Progress value={progress} />
                  <Text style={[type.small, { color: c.muted }]}>Downloading… {Math.round(progress * 100)}%</Text>
                </View>
              ) : phase === 'installing' ? (
                <Text style={[type.body, { color: c.muted }]}>Tap <Text style={{ fontWeight: '700', color: c.text }}>Update</Text> on Android’s screen. Culla closes and the new version is ready when you reopen it. Your results and settings are kept.</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title={phase === 'installing' ? 'Close' : 'Later'} kind="secondary" onPress={close} disabled={phase === 'downloading'} style={{ flex: 1 }} />
                {phase === 'installing'
                  ? <Button title="Install" icon="download" onPress={install} style={{ flex: 1.4 }} />
                  : <Button title="Update now" icon="download" busy={phase === 'downloading'} onPress={start} style={{ flex: 1.4 }} />}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
