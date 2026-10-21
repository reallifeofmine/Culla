import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

/** Bottom bar for the main action on a screen (Delete, Compress...). */
export function ActionBar({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom + 8), backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, flexDirection: 'row', gap: 10 }}>
      {children}
    </View>
  );
}
