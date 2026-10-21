import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const { c } = useTheme();
  // Sit above Android's navigation buttons / gesture bar (the app draws edge to edge).
  const insets = useSafeAreaInsets();
  const icon = (name: React.ComponentProps<typeof Ionicons>['name']) => ({ color, size }: { color: import('react-native').ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false, headerTitleStyle: { fontWeight: '800', fontSize: 22 },
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, height: 64 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom }, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600', paddingBottom: 6 }, sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Clean up', tabBarLabel: 'Clean', tabBarIcon: icon('sparkles') }} />
      <Tabs.Screen name="albums" options={{ title: 'Albums', tabBarIcon: icon('albums') }} />
      <Tabs.Screen name="bin" options={{ title: 'Bin', tabBarIcon: icon('trash') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings') }} />
    </Tabs>
  );
}
