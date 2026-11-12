// 全局明暗主题。
//
// 设计约束：
// - iOS 走系统语义色（HIG），安卓走 Material 3 表面 / 主色，两套都提供暗色值。
// - palette / m3 是「实时」对象：读取时返回当前主题的颜色，所以组件里内联的
//   palette.blue、m3.onSurface 在切换主题后自然拿到新值。
// - 样式表用 themedStyles(() => StyleSheet.create({...})) 注册；切换主题时统一
//   重建这些样式对象，再把值写回原来的对象，模块级 `styles` 引用无需改动。
// - 所有需要重绘的界面都挂在 App 下，App 订阅 useScheme() 后整棵树重渲染。

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance, Platform } from 'react-native';

export type Scheme = 'light' | 'dark';

const ios = Platform.OS === 'ios';
const STORAGE_KEY = 'qmszai.theme';

const iosLight = {
  groupedBackground: '#F2F2F7',
  card: '#FFFFFF',
  cardSubtle: '#FBFCFD',
  cardMuted: '#F6F7F9',
  label: '#000000',
  strongLabel: '#15191E',
  secondaryLabel: '#6C6C70',
  subtleLabel: '#8E8E93',
  deepLabel: '#3C3C43',
  tertiaryLabel: '#C7C7CC',
  separator: '#C6C6C8',
  separatorSoft: 'rgba(60,60,67,0.29)',
  fill: '#E5E5EA',
  fillMuted: '#F2F2F7',
  pressedFill: '#E5E5EA',
  inputBackground: '#F2F2F7',
  searchField: 'rgba(118,118,128,0.12)',
  placeholder: '#8E8E93',
  blue: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  destructive: '#B3404A',
  successText: '#157A5B',
  warningText: '#9A6500',
  onAccent: '#FFFFFF',
  solidButton: '#15191E',
  onSolidButton: '#FFFFFF',
  handle: '#D4DAE0',
  backdrop: 'rgba(17,20,24,0.35)',
  overlay: 'rgba(0,0,0,0.32)',
  tintBlue: 'rgba(0,122,255,0.12)',
  tintBlueSoft: 'rgba(0,122,255,0.08)',
  tintGreen: '#E6F4EE',
  tintAmber: '#FCF2DC',
  tintRose: '#FBE9EA',
  heroBackground: '#141A1E',
  heroLabel: '#B9C6CF',
  heroValue: '#FFFFFF',
  heroMuted: '#69737D',
  heroTrack: '#343A42',
  heroAccent: '#58C7A8',
  glassTint: 'rgba(255,255,255,0.55)',
  glassFill: 'rgba(255,255,255,0.5)',
  glassBorder: 'rgba(60,60,67,0.16)',
  tabBarGlass: 'rgba(255,255,255,0.42)',
  tabBarBorder: 'rgba(255,255,255,0.85)',
  tabBarSolid: 'rgba(250,250,252,0.96)',
  tabBarSelection: '#FFFFFF',
  popoverBacking: 'rgba(255,255,255,0.95)',
  captchaOverlay: 'rgba(255,255,255,0.6)',
};

export type Palette = typeof iosLight;

const iosDark: Palette = {
  groupedBackground: '#000000',
  card: '#1C1C1E',
  cardSubtle: '#232325',
  cardMuted: '#1A1A1C',
  label: '#FFFFFF',
  strongLabel: '#F2F2F7',
  secondaryLabel: '#98989F',
  subtleLabel: '#98989F',
  deepLabel: '#D1D1D6',
  tertiaryLabel: '#48484A',
  separator: '#38383A',
  separatorSoft: 'rgba(84,84,88,0.6)',
  fill: '#2C2C2E',
  fillMuted: '#1C1C1E',
  pressedFill: '#2C2C2E',
  inputBackground: '#2C2C2E',
  searchField: 'rgba(118,118,128,0.24)',
  placeholder: '#98989F',
  blue: '#0A84FF',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  destructive: '#FF6961',
  successText: '#32D74B',
  warningText: '#FFD60A',
  onAccent: '#FFFFFF',
  solidButton: '#E3E8EC',
  onSolidButton: '#101418',
  handle: '#48484A',
  backdrop: 'rgba(0,0,0,0.62)',
  overlay: 'rgba(0,0,0,0.32)',
  tintBlue: 'rgba(10,132,255,0.18)',
  tintBlueSoft: 'rgba(10,132,255,0.14)',
  tintGreen: 'rgba(48,209,88,0.16)',
  tintAmber: 'rgba(255,159,10,0.16)',
  tintRose: 'rgba(255,69,58,0.16)',
  heroBackground: '#1C1C1E',
  heroLabel: '#B9C6CF',
  heroValue: '#FFFFFF',
  heroMuted: '#98A3AC',
  heroTrack: '#3A3A3C',
  heroAccent: '#58C7A8',
  glassTint: 'rgba(120,120,128,0.35)',
  glassFill: 'rgba(28,28,30,0.5)',
  glassBorder: 'rgba(255,255,255,0.12)',
  tabBarGlass: 'rgba(28,28,30,0.5)',
  tabBarBorder: 'rgba(255,255,255,0.14)',
  tabBarSolid: 'rgba(28,28,30,0.96)',
  tabBarSelection: '#3A3A3C',
  popoverBacking: '#1C1C1E',
  captchaOverlay: 'rgba(28,28,30,0.6)',
};

const androidLight: Palette = {
  groupedBackground: '#F7F9FA',
  card: '#FFFFFF',
  cardSubtle: '#F2F5F7',
  cardMuted: '#F7F9FA',
  label: '#181C1F',
  strongLabel: '#15191E',
  secondaryLabel: '#43494E',
  subtleLabel: '#737A80',
  deepLabel: '#30363D',
  tertiaryLabel: '#C3C9CE',
  separator: '#D2D8DE',
  separatorSoft: '#E3E7EB',
  fill: '#ECF0F3',
  fillMuted: '#F2F5F7',
  pressedFill: '#EEF3FA',
  inputBackground: '#FFFFFF',
  searchField: '#ECF0F3',
  placeholder: '#7A828A',
  blue: '#1A73E8',
  green: '#157A5B',
  orange: '#7A5A00',
  red: '#BA1A1A',
  destructive: '#BA1A1A',
  successText: '#157A5B',
  warningText: '#9A6500',
  onAccent: '#FFFFFF',
  solidButton: '#15191E',
  onSolidButton: '#FFFFFF',
  handle: '#D4DAE0',
  backdrop: 'rgba(17,20,24,0.35)',
  overlay: 'rgba(0,0,0,0.32)',
  tintBlue: '#E9F3FA',
  tintBlueSoft: '#EEF3FA',
  tintGreen: '#E6F4EE',
  tintAmber: '#FCF2DC',
  tintRose: '#FBE9EA',
  heroBackground: '#141A1E',
  heroLabel: '#B9C6CF',
  heroValue: '#FFFFFF',
  heroMuted: '#69737D',
  heroTrack: '#343A42',
  heroAccent: '#58C7A8',
  glassTint: 'rgba(255,255,255,0.55)',
  glassFill: 'rgba(255,255,255,0.5)',
  glassBorder: 'rgba(60,60,67,0.16)',
  tabBarGlass: 'rgba(255,255,255,0.42)',
  tabBarBorder: 'rgba(255,255,255,0.85)',
  tabBarSolid: '#FFFFFF',
  tabBarSelection: '#FFFFFF',
  popoverBacking: '#FFFFFF',
  captchaOverlay: 'rgba(255,255,255,0.6)',
};

const androidDark: Palette = {
  groupedBackground: '#101418',
  card: '#171C20',
  cardSubtle: '#1B2024',
  cardMuted: '#141A1E',
  label: '#E3E8EC',
  strongLabel: '#F0F3F5',
  secondaryLabel: '#BFC6CC',
  subtleLabel: '#98A1A9',
  deepLabel: '#DCE2E7',
  tertiaryLabel: '#6F787F',
  separator: '#39424A',
  separatorSoft: '#2E363D',
  fill: '#21272C',
  fillMuted: '#1B2024',
  pressedFill: '#28313A',
  inputBackground: '#1B2024',
  searchField: '#21272C',
  placeholder: '#9AA3AB',
  blue: '#1A73E8',
  green: '#6BD8B4',
  orange: '#F2C46B',
  red: '#FFB4AB',
  destructive: '#FFB4AB',
  successText: '#6BD8B4',
  warningText: '#F2C46B',
  onAccent: '#FFFFFF',
  solidButton: '#E3E8EC',
  onSolidButton: '#101418',
  handle: '#3A4249',
  backdrop: 'rgba(0,0,0,0.62)',
  overlay: 'rgba(0,0,0,0.32)',
  tintBlue: 'rgba(26,115,232,0.24)',
  tintBlueSoft: 'rgba(26,115,232,0.18)',
  tintGreen: 'rgba(21,122,91,0.28)',
  tintAmber: 'rgba(122,90,0,0.3)',
  tintRose: 'rgba(186,26,26,0.26)',
  heroBackground: '#1A2127',
  heroLabel: '#A9B6C0',
  heroValue: '#FFFFFF',
  heroMuted: '#93A0AA',
  heroTrack: '#333C44',
  heroAccent: '#58C7A8',
  glassTint: 'rgba(255,255,255,0.12)',
  glassFill: 'rgba(40,44,48,0.5)',
  glassBorder: 'rgba(255,255,255,0.12)',
  tabBarGlass: 'rgba(28,33,38,0.5)',
  tabBarBorder: 'rgba(255,255,255,0.12)',
  tabBarSolid: '#171C20',
  tabBarSelection: '#2A3137',
  popoverBacking: '#171C20',
  captchaOverlay: 'rgba(23,28,32,0.6)',
};

const m3Light = {
  surface: '#F7F9FA',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F2F5F7',
  surfaceContainer: '#ECF0F3',
  surfaceContainerHigh: '#E5EAEE',
  surfaceContainerHighest: '#DFE4E9',
  onSurface: '#181C1F',
  onSurfaceVariant: '#43494E',
  outline: '#737A80',
  outlineVariant: '#C3C9CE',
  primary: '#1A73E8',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D3E3FD',
  onPrimaryContainer: '#041E49',
  secondaryContainer: '#DCE7F6',
  onSecondaryContainer: '#101C2B',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  success: '#157A5B',
  successContainer: '#C8F0DF',
  onSuccessContainer: '#00281A',
  warning: '#7A5A00',
  warningContainer: '#FFE08C',
  onWarningContainer: '#261A00',
  scrim: 'rgba(0,0,0,0.32)',
};

export type M3 = typeof m3Light;

const m3Dark: M3 = {
  surface: '#101418',
  surfaceContainerLowest: '#171C20',
  surfaceContainerLow: '#1B2024',
  surfaceContainer: '#21272C',
  surfaceContainerHigh: '#2A3137',
  surfaceContainerHighest: '#343C43',
  onSurface: '#E3E8EC',
  onSurfaceVariant: '#BFC6CC',
  outline: '#8A939B',
  outlineVariant: '#3E474F',
  primary: '#1A73E8',
  onPrimary: '#FFFFFF',
  primaryContainer: '#173A63',
  onPrimaryContainer: '#D3E3FD',
  secondaryContainer: '#243B52',
  onSecondaryContainer: '#D7E6F7',
  error: '#FFB4AB',
  errorContainer: '#5C1412',
  onErrorContainer: '#FFDAD6',
  success: '#6BD8B4',
  successContainer: '#0F3B2E',
  onSuccessContainer: '#B7F2DE',
  warning: '#F2C46B',
  warningContainer: '#3E2E00',
  onWarningContainer: '#FFE08C',
  scrim: 'rgba(0,0,0,0.5)',
};

const palettes = ios
  ? { light: iosLight, dark: iosDark }
  : { light: androidLight, dark: androidDark };

let scheme: Scheme = 'light';
const listeners = new Set<() => void>();
const rebuilders: Array<() => void> = [];

function liveTokens<K extends string>(
  keys: readonly K[],
  read: (key: K) => string,
): Record<K, string> {
  const target = {} as Record<K, string>;
  keys.forEach((key) => {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: false,
      get: () => read(key),
    });
  });
  return target;
}

const paletteKeys = Object.keys(iosLight) as Array<keyof Palette>;
const m3Keys = Object.keys(m3Light) as Array<keyof M3>;

export const palette = liveTokens(paletteKeys, (key) => palettes[scheme][key]);
export const m3 = liveTokens(m3Keys, (key) => (scheme === 'dark' ? m3Dark : m3Light)[key]);

export function getScheme(): Scheme {
  return scheme;
}

export function isDark(): boolean {
  return scheme === 'dark';
}

// 样式表注册：切换主题时重跑工厂，把新样式写回同一个对象，
// 这样模块级 `const styles` 的引用保持稳定，但内容随主题更新。
export function themedStyles<T extends object>(factory: () => T): T {
  const target = {} as T;
  const rebuild = () => {
    const next = factory();
    for (const key of Object.keys(target)) {
      delete (target as Record<string, unknown>)[key];
    }
    Object.assign(target, next);
  };
  rebuild();
  rebuilders.push(rebuild);
  return target;
}

function apply(next: Scheme) {
  if (next === scheme) return;
  scheme = next;
  try {
    Appearance.setColorScheme(next);
  } catch {
    // 某些运行环境（Expo Go / Web）不支持覆盖系统外观，忽略即可。
  }
  rebuilders.forEach((rebuild) => rebuild());
  listeners.forEach((listener) => listener());
}

export function setScheme(next: Scheme, persist = true) {
  apply(next);
  if (persist) {
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }
}

export function toggleScheme() {
  setScheme(scheme === 'dark' ? 'light' : 'dark');
}

// 启动时恢复上次选择；默认跟随浅色，和改动前的观感一致。
export async function initTheme() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') apply(saved);
  } catch {
    // 存储不可用时保持浅色。
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useScheme(): Scheme {
  return useSyncExternalStore(subscribe, getScheme, getScheme);
}
