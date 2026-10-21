import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { init } from '../lib/store';
import { useTheme } from '../theme';

export default function RootLayout() {
  const { c, dark } = useTheme();
  useEffect(() => { init().catch(() => {}); }, []);
  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="similar" options={{ title: 'Similar shots' }} />
        <Stack.Screen name="group/[id]" options={{ title: 'Pick what to keep' }} />
        <Stack.Screen name="list/[kind]" options={{ title: '' }} />
        <Stack.Screen name="photo/[id]" options={{ title: '' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit', presentation: 'fullScreenModal' }} />
        <Stack.Screen name="compress" options={{ title: 'Shrink large photos' }} />
      </Stack>
    </>
  );
}
