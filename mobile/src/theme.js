/**
 * theme.js — the Clario design tokens, mirrored from web/src/index.css and the
 * README's palette so the phone app is visibly the same product.
 *
 *   one warm orange accent · monochrome surfaces · colour only on money
 *   Nunito for UI · Unbounded for display · Geist Mono for figures
 */
import { useColorScheme } from 'react-native';

const shared = {
  radius: { sm: 10, md: 16, lg: 22, pill: 999 },
  space: (n) => n * 4,
  font: {
    ui: 'Nunito_600SemiBold',
    uiRegular: 'Nunito_400Regular',
    uiBold: 'Nunito_700Bold',
    uiHeavy: 'Nunito_800ExtraBold',
    display: 'Unbounded_700Bold',
    mono: 'GeistMono_500Medium',
    monoBold: 'GeistMono_700Bold',
  },
};

export const dark = {
  ...shared,
  scheme: 'dark',
  brand: '#E85002',
  brandFrom: '#F16001',
  brandTo: '#C10801',
  onBrand: '#FFFFFF',
  bg: '#0E0E0E',
  card: '#1C1C1C',
  well: '#141416',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',
  text: '#F9F9F9',
  text2: '#A7A7A7',
  text3: '#646464',
  green: '#4ADE80',
  red: '#F43F5E',
  brandBg: 'rgba(232,80,2,0.14)',
  shadow: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
};

export const light = {
  ...shared,
  scheme: 'light',
  brand: '#D64802',
  brandFrom: '#F16001',
  brandTo: '#C10801',
  onBrand: '#FFFFFF',
  bg: '#F4F2ED',
  card: '#FFFFFF',
  well: '#EEE9E1',
  border: 'rgba(16,18,22,0.08)',
  borderStrong: 'rgba(16,18,22,0.16)',
  text: '#101216',
  text2: '#55575C',
  text3: '#8A8C90',
  green: '#0D7A55',
  red: '#B8443A',
  brandBg: 'rgba(214,72,2,0.10)',
  shadow: { shadowColor: '#101216', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
};

/** Dark is Clario's primary look; light follows the system setting. */
export const useTheme = () => (useColorScheme() === 'light' ? light : dark);
