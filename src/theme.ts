import { useColorScheme } from 'react-native';

const shared = { radius: 16, space: 16 };

export const palettes = {
  light: {
    bg: '#F4F7F6', card: '#FFFFFF', raised: '#EEF3F1', text: '#0F1A16', muted: '#5B6964', line: '#DCE4E1',
    accent: '#0B8F63', accentText: '#FFFFFF', accentSoft: '#DDF3EA', danger: '#D43A3A', dangerSoft: '#FBE3E3', warn: '#B7791F', warnSoft: '#FDF1DC',
    overlay: 'rgba(0,0,0,0.45)',
  },
  dark: {
    bg: '#0C1311', card: '#151F1C', raised: '#1D2925', text: '#EDF3F1', muted: '#98A7A1', line: '#26332F',
    accent: '#3DDC97', accentText: '#05140E', accentSoft: '#173A2D', danger: '#FF6B6B', dangerSoft: '#3A1E1E', warn: '#F6C453', warnSoft: '#3A2F17',
    overlay: 'rgba(0,0,0,0.6)',
  },
};

export type Colors = typeof palettes.light;

export function useTheme() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? palettes.dark : palettes.light;
  return { c, ...shared, dark: scheme === 'dark' };
}

export const type = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 19 },
  tiny: { fontSize: 12, lineHeight: 16 },
};
