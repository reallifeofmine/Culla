import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageProps } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { type, useTheme } from '../theme';

const RETRY_MS = [700, 2000, 5000];

/**
 * A gallery photo that retries when loading fails (the phone may be busy or short of memory)
 * and, if it still can't load, says so instead of leaving a blank tile.
 */
export function Photo({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  const { c } = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setAttempt(0); setFailed(null); }, [uri]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onError = (e: { error: string }) => {
    console.warn('Culla photo', uri, e.error);
    if (attempt < RETRY_MS.length) timer.current = setTimeout(() => setAttempt(a => a + 1), RETRY_MS[attempt]);
    else setFailed(e.error);
  };
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: c.raised }, props.style as object]}>
      <Image {...props} style={{ flex: 1 }} source={{ uri, cacheKey: attempt ? `${uri}#${attempt}` : uri }}
        onError={onError} onLoad={() => setFailed(null)} />
      {failed ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}
          accessibilityLabel="Photo couldn't be loaded">
          <Ionicons name="image-outline" size={22} color={c.muted} />
          <Text style={[type.tiny, { color: c.muted, textAlign: 'center' }]} numberOfLines={3}>Couldn’t load · {failed.slice(0, 80)}</Text>
        </View>
      ) : null}
    </View>
  );
}
