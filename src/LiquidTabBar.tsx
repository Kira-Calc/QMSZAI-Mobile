import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { AppIcon } from './components/AppIcon';
import { elevation, m3, shape } from './material';
import type { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { palette } from './ui';
import type { TabKey } from './types';

const ios = Platform.OS === 'ios';

export const appTabs: Array<{
  key: TabKey;
  label: string;
  icon: string;
  symbol: ComponentProps<typeof SymbolView>['name'];
}> = [
  { key: 'chat', label: '聊天', icon: '◇', symbol: 'bubble.left.and.bubble.right' },
  { key: 'overview', label: '概览', icon: '⌂', symbol: 'chart.bar' },
  { key: 'models', label: '模型', icon: '▦', symbol: 'square.stack.3d.up' },
  { key: 'tokens', label: '令牌', icon: '◇', symbol: 'key' },
  { key: 'account', label: '账户', icon: '◌', symbol: 'person.crop.circle' },
];

const glassSupported =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

const PADDING = 6;
const ITEM_INSET = 4;

// GlassView 需要参与尺寸/圆角动画，包一层 Animated。
const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

export function LiquidTabBar({
  activeKey,
  minimized,
  onChange,
  onMinimizedChange,
}: {
  activeKey: TabKey;
  minimized: boolean;
  onChange: (key: TabKey) => void;
  onMinimizedChange: (minimized: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = Math.max(
    0,
    appTabs.findIndex((tab) => tab.key === activeKey),
  );
  const itemWidth = barWidth > 0 ? (barWidth - PADDING * 2) / appTabs.length : 0;

  const activeIndexRef = useRef(activeIndex);
  const itemWidthRef = useRef(itemWidth);
  const draggingRef = useRef(false);
  const dragStartIndex = useRef(0);
  const indexAnim = useRef(new Animated.Value(activeIndex)).current;
  const onChangeRef = useRef(onChange);
  const onMinimizedChangeRef = useRef(onMinimizedChange);

  activeIndexRef.current = activeIndex;
  itemWidthRef.current = itemWidth;
  onChangeRef.current = onChange;
  onMinimizedChangeRef.current = onMinimizedChange;

  const springTo = useCallback(
    (index: number) => {
      Animated.spring(indexAnim, {
        toValue: index,
        useNativeDriver: true,
        stiffness: 320,
        damping: 30,
        mass: 0.7,
      }).start();
    },
    [indexAnim],
  );

  useEffect(() => {
    if (!draggingRef.current) {
      springTo(activeIndex);
    }
  }, [activeIndex, springTo]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  // 横向拖动：选中玻璃指示器跟随手指左右移动，并在经过标签时即时切换。
  const horizontalPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => {
        draggingRef.current = true;
        dragStartIndex.current = activeIndexRef.current;
        indexAnim.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const width = itemWidthRef.current;
        if (!width) return;
        const raw = dragStartIndex.current + gesture.dx / width;
        const clamped = Math.max(0, Math.min(appTabs.length - 1, raw));
        indexAnim.setValue(clamped);
        const nearest = Math.round(clamped);
        if (nearest !== activeIndexRef.current) {
          activeIndexRef.current = nearest;
          onChangeRef.current(appTabs[nearest].key);
        }
      },
      onPanResponderRelease: () => {
        draggingRef.current = false;
        springTo(activeIndexRef.current);
      },
      onPanResponderTerminate: () => {
        draggingRef.current = false;
        springTo(activeIndexRef.current);
      },
    }),
  ).current;

  // 纵向拖动：向下收起为圆形玻璃钮，向上重新展开。
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;

  const verticalPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (!minimizedRef.current && gesture.dy > 26) {
          onMinimizedChangeRef.current(true);
        } else if (minimizedRef.current && gesture.dy < -26) {
          onMinimizedChangeRef.current(false);
        }
      },
    }),
  ).current;

  const useGlass = glassSupported && !reduceTransparency;
  const activeTab = appTabs[activeIndex];

  // 完整导航栏 ↔ 圆形玻璃钮的收起/展开动画。宽度和高度只能 JS 驱动，
  // 用同一个进度值驱动尺寸、圆角与两套内容的交叉淡入淡出。
  const miniProgress = useRef(new Animated.Value(minimized ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(miniProgress, {
      toValue: minimized ? 1 : 0,
      duration: 240,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [minimized, miniProgress]);

  const barWidthProgress =
    barWidth > 0
      ? miniProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [barWidth, 60],
          extrapolate: 'clamp',
        })
      : undefined;
  const barHeightProgress = miniProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [64, 60],
    extrapolate: 'clamp',
  });
  const barRadiusProgress = miniProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [ios ? 32 : shape.xl, 30],
    extrapolate: 'clamp',
  });
  const tabsOpacity = miniProgress.interpolate({
    inputRange: [0, 0.45],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const miniOpacity = miniProgress.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // 底部滚动边缘渐隐：让内容在悬浮导航栏下方平滑过渡到页面背景，
  // 避免列表在安全区边界被裁出一道硬边（看起来像被切掉一块）。
  const scrimHeight = insets.bottom + 70;
  const solidFrom = Math.max(
    0.2,
    Math.min(1, 1 - (insets.bottom + 30) / scrimHeight),
  );

  const translateX =
    itemWidth > 0
      ? indexAnim.interpolate({
          inputRange: [0, appTabs.length - 1],
          outputRange: [0, itemWidth * (appTabs.length - 1)],
        })
      : 0;

  // 用外层 dock 的宽度换算导航栏宽度：收起动画会持续改 bar 自身宽度，
  // 若在 bar 上量宽度会把动画中间值写回状态，形成反馈抖动。
  const handleDockLayout = (event: LayoutChangeEvent) => {
    setBarWidth(Math.max(0, event.nativeEvent.layout.width - 32));
  };

  // iOS 沿用系统蓝；安卓用 Material 3 的 primary / onSurfaceVariant
  const activeTint = ios ? '#007AFF' : m3.primary;
  const inactiveTint = ios ? '#5B6470' : m3.onSurfaceVariant;

  const tabItems = appTabs.map((tab) => {
    const selected = activeKey === tab.key;
    return (
      <Pressable
        key={tab.key}
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected }}
        onPress={() => onChange(tab.key)}
        style={({ pressed }) => [
          styles.item,
          pressed ? (ios ? styles.itemPressed : styles.itemPressedAndroid) : null,
        ]}
      >
        <AppIcon
          name={tab.symbol}
          size={24}
          color={selected ? activeTint : inactiveTint}
        />
        <Text style={[styles.label, { color: selected ? activeTint : inactiveTint }]}>
          {tab.label}
        </Text>
      </Pressable>
    );
  });

  const tabsLayer = (
    <Animated.View
      pointerEvents={minimized ? 'none' : 'auto'}
      accessibilityElementsHidden={minimized}
      importantForAccessibility={minimized ? 'no-hide-descendants' : 'auto'}
      style={[styles.tabsLayer, { opacity: tabsOpacity }]}
    >
      {barWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.selection,
            { width: Math.max(0, itemWidth - ITEM_INSET * 2), transform: [{ translateX }] },
          ]}
        >
          {useGlass ? (
            <GlassView
              glassEffectStyle="regular"
              tintColor="rgba(255,255,255,0.85)"
              style={styles.selectionFill}
            />
          ) : (
            <View style={styles.selectionFallback} />
          )}
        </Animated.View>
      ) : null}
      {tabItems}
    </Animated.View>
  );

  const miniLayer = (
    <Animated.View
      pointerEvents={minimized ? 'auto' : 'none'}
      style={[styles.miniLayer, { opacity: miniOpacity }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${activeTab.label}，展开导航栏`}
        accessibilityHint="轻点展开全部导航标签"
        onPress={() => onMinimizedChange(false)}
        style={({ pressed }) => [styles.miniItem, pressed ? styles.itemPressed : null]}
      >
        <AppIcon name={activeTab.symbol} size={24} color={activeTint} />
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.dockRoot} pointerEvents="box-none">
      <View pointerEvents="none" style={[styles.scrim, { height: scrimHeight }]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="tabBarScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={palette.groupedBackground} stopOpacity={0} />
              <Stop
                offset={String(solidFrom * 0.6)}
                stopColor={palette.groupedBackground}
                stopOpacity={0.5}
              />
              <Stop offset={String(solidFrom)} stopColor={palette.groupedBackground} stopOpacity={1} />
              <Stop offset="1" stopColor={palette.groupedBackground} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#tabBarScrim)" />
        </Svg>
      </View>
      <View
        style={[styles.dock, { paddingBottom: insets.bottom + 6 }]}
        pointerEvents="box-none"
        onLayout={handleDockLayout}
        {...verticalPan.panHandlers}
      >
        {useGlass ? (
          <AnimatedGlassView
            glassEffectStyle="regular"
            tintColor="rgba(118,118,128,0.12)"
            isInteractive
            style={[
              styles.bar,
              styles.barGlass,
              {
                width: barWidthProgress,
                height: barHeightProgress,
                borderRadius: barRadiusProgress,
              },
            ]}
            {...horizontalPan.panHandlers}
          >
            {tabsLayer}
            {miniLayer}
          </AnimatedGlassView>
        ) : (
          <Animated.View
            style={[
              styles.bar,
              styles.barFallback,
              {
                width: barWidthProgress,
                height: barHeightProgress,
                borderRadius: barRadiusProgress,
              },
            ]}
            {...horizontalPan.panHandlers}
          >
            {tabsLayer}
            {miniLayer}
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  dock: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    width: '100%',
    height: 64,
    borderRadius: ios ? 32 : shape.xl,
  },
  tabsLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
  },
  miniLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barGlass: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  barFallback: {
    backgroundColor: ios ? 'rgba(250,250,252,0.96)' : m3.surfaceContainerLowest,
    borderWidth: ios ? StyleSheet.hairlineWidth : 0,
    borderColor: 'rgba(60,60,67,0.16)',
    ...(ios
      ? {
          shadowColor: '#000000',
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }
      : elevation.floating),
  },
  selection: {
    position: 'absolute',
    left: PADDING + ITEM_INSET,
    top: 6,
    height: 52,
    borderRadius: 26,
  },
  selectionFill: {
    flex: 1,
    borderRadius: 26,
  },
  selectionFallback: {
    flex: 1,
    borderRadius: ios ? 26 : shape.full,
    backgroundColor: ios ? '#FFFFFF' : m3.primaryContainer,
    shadowColor: '#000000',
    shadowOpacity: ios ? 0.12 : 0,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: ios ? 2 : 0,
  },
  item: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  miniItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemPressed: {
    opacity: 0.6,
  },
  // 安卓按压态：android_ripple 的遮罩恒为矩形，圆角宿主上会画出方块，改用 M3 状态层。
  itemPressedAndroid: {
    backgroundColor: 'rgba(26,115,232,0.10)',
  },
  icon: {
    width: 24,
    height: 24,
  },
  iconText: {
    color: '#5B6470',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: '#5B6470',
    fontSize: ios ? 11 : 12,
    fontWeight: ios ? '600' : '500',
  },
  textActive: {
    color: '#007AFF',
  },
});
