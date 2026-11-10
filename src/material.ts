// Material 3 (Material You) 设计令牌：仅用于安卓端，iOS 继续走 HIG / SF 样式。
// 取色为中性偏冷的浅色方案，主色为正统蓝（与 iOS 系统蓝同族的 Google Blue），克制且贴近 iOS 观感。

import { Platform } from 'react-native';

export const m3 = {
  // 表面层级：surface → surfaceContainerLowest 表示由低到高的“海拔”
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
} as const;

// M3 形状尺度：extra small 4 / small 8 / medium 12 / large 16 / extra large 28
export const shape = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 999,
} as const;

// M3 字体尺度（Roboto / 系统默认字体）
export const type = {
  headlineSmall: { fontSize: 28, lineHeight: 36, fontWeight: '600' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  bodyLarge: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMedium: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const },
} as const;

// M3 海拔：浅色主题下用极淡的阴影 + 色调表面表达层级
export const elevation = {
  level1: {
    shadowColor: '#0B1D28',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  level2: {
    shadowColor: '#0B1D28',
    shadowOpacity: 0.09,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

// M3 水波纹：安卓特有的触摸反馈。
// 只用于矩形行（分组列表行、tab 内的整行）；圆角宿主不要用，见 pressedSurface / pressedDim。
export const ripple = (color: string = 'rgba(26,115,232,0.12)') => ({
  color,
  borderless: false,
  foreground: false,
});

const isIOS = Platform.OS === 'ios';

// 卡片表面：安卓用 M3 的 28dp 大圆角 + 1 级海拔；iOS 返回空对象，沿用原有样式。
// iOS 保留原 12pt 连续圆角（M3 改造前各页卡片就是 12）；安卓用 28dp + 1 级海拔。
export const cardSurface = isIOS
  ? { borderRadius: 12, borderCurve: 'continuous' as const }
  : { borderRadius: shape.xl, ...elevation.level1 };

// 紧凑磁贴：16dp 圆角 + 1 级海拔，用于栅格内的小块。
export const tileSurface = isIOS ? {} : { borderRadius: shape.lg, ...elevation.level1 };

// 轻阴影：气泡、输入条等需要脱离底色但仍很克制的表面；iOS 不加。
export const softShadow = isIOS ? {} : elevation.level1;

// 平铺表面：无阴影，仅用 surfaceContainer 区分层级。
export const flatSurface = isIOS ? {} : { borderRadius: shape.xl, backgroundColor: m3.surfaceContainerLow };

// 圆角宿主的按压反馈。
// RN 的 android_ripple 遮罩恒为矩形（ReactDrawableHelper 只给 ColorDrawable 蒙版），
// 在圆角卡片 / 胶囊按钮上会画出方块；而且 overflow: 'hidden' 只裁剪子视图、裁不到自身背景，
// 所以圆角面改用 M3 状态层：白色面压深一档（pressedSurface），彩色面整体压暗（pressedDim）。
export const pressedSurface = isIOS ? {} : { backgroundColor: m3.surfaceContainer };
export const pressedDim = isIOS ? {} : { opacity: 0.8 };
