import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { type, useTheme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const { c, radius } = useTheme();
  const body = <View style={[{ backgroundColor: c.card, borderRadius: radius, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }, style]}>{children}</View>;
  if (!onPress) return body;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>{body}</Pressable>;
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, busy, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  const { c } = useTheme();
  const bg = { primary: c.accent, secondary: c.raised, danger: c.danger, ghost: 'transparent' }[kind];
  const fg = { primary: c.accentText, secondary: c.text, danger: '#fff', ghost: c.accent }[kind];
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 52, borderRadius: 14, paddingHorizontal: 18, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
    </Pressable>
  );
}

export function Progress({ value }: { value: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.raised, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%', backgroundColor: c.accent, borderRadius: 4 }} />
    </View>
  );
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body?: string; children?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={34} color={c.accent} />
      </View>
      <Text style={[type.h2, { color: c.text, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.body, { color: c.muted, textAlign: 'center' }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' }) {
  const { c } = useTheme();
  const bg = { neutral: c.overlay, good: c.accent, bad: c.danger, warn: c.warn }[tone];
  const fg = tone === 'good' ? c.accentText : '#fff';
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}
