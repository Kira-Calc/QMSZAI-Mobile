import NativeSegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { AppIcon } from './components/AppIcon';
import {
  Children,
  Fragment,
  useEffect,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { elevation, m3, ripple, shape, type } from './material';

// Upstream legacy NativeMethods constructor typing is incompatible with React 19.
const SegmentedControl = NativeSegmentedControl as unknown as ComponentType<SegmentedControlProps>;

const ios = Platform.OS === 'ios';

// 列表内容因筛选、模式切换而增删时，让行淡入淡出，而不是瞬间替换。
export function animateContentChange() {
  LayoutAnimation.configureNext(
    LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
  );
}

export const palette = ios
  ? {
      groupedBackground: '#F2F2F7',
      card: '#FFFFFF',
      label: '#000000',
      secondaryLabel: '#6C6C70',
      tertiaryLabel: '#C7C7CC',
      separator: '#C6C6C8',
      fill: '#E5E5EA',
      blue: '#007AFF',
      green: '#34C759',
      orange: '#FF9500',
      red: '#FF3B30',
    }
  : {
      groupedBackground: m3.surface,
      card: m3.surfaceContainerLowest,
      label: m3.onSurface,
      secondaryLabel: m3.onSurfaceVariant,
      tertiaryLabel: m3.outline,
      separator: m3.outlineVariant,
      fill: m3.surfaceContainer,
      blue: m3.primary,
      green: m3.success,
      orange: m3.warning,
      red: m3.error,
    };

export const toneColor = {
  neutral: palette.secondaryLabel,
  info: palette.blue,
  success: palette.green,
  warning: palette.orange,
  danger: palette.red,
} as const;

export type Tone = keyof typeof toneColor;

const glassSupported =
  Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

function useGlassEnabled() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

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

  return glassSupported && !reduceTransparency;
}

export function GlassSurface({
  children,
  style,
  radius = 20,
  interactive = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  interactive?: boolean;
}) {
  const enabled = useGlassEnabled();

  if (enabled) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor="rgba(255,255,255,0.55)"
        isInteractive={interactive}
        style={[{ borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.5)' }, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.glassFallback,
        { borderRadius: radius, backgroundColor: palette.card },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function GlassIconButton({
  icon,
  fallback = '•',
  label,
  onPress,
  size = 40,
  tint = palette.blue,
  style,
}: {
  icon: ComponentProps<typeof SymbolView>['name'];
  fallback?: string;
  label: string;
  onPress: () => void;
  size?: number;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2 },
        pressed ? styles.glassPressed : null,
        style,
      ]}
    >
      <GlassSurface radius={size / 2} interactive style={styles.glassIconFill}>
        <AppIcon name={icon} size={Math.round(size * 0.44)} color={tint} />
      </GlassSurface>
    </Pressable>
  );
}

export function GlassPillButton({
  icon,
  fallback = '‹',
  label,
  onPress,
  tint = palette.blue,
  style,
  children,
}: {
  icon?: ComponentProps<typeof SymbolView>['name'];
  fallback?: string;
  label: string;
  onPress: () => void;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.glassPillWrap,
        pressed ? styles.glassPressed : null,
        style,
      ]}
    >
      <GlassSurface radius={18} interactive style={styles.glassPillFill}>
        {icon ? <AppIcon name={icon} size={15} color={tint} /> : null}
        <Text style={[styles.glassPillLabel, { color: tint }]}>{label}</Text>
        {children}
      </GlassSurface>
    </Pressable>
  );
}

export function Segmented({
  values,
  selectedIndex,
  onChange,
  style,
}: {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (ios) {
    return (
      <SegmentedControl
        values={values}
        selectedIndex={selectedIndex}
        onChange={(event) => onChange(event.nativeEvent.selectedSegmentIndex)}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.androidSegmented, style]}>
      {values.map((value, index) => {
        const selected = index === selectedIndex;
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(index)}
            style={[styles.androidSegment, selected ? styles.androidSegmentActive : null]}
          >
            <Text
              style={[
                styles.androidSegmentText,
                selected ? styles.androidSegmentTextActive : null,
              ]}
            >
              {value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Group({
  header,
  footer,
  children,
  style,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children);
  return (
    <View style={[styles.group, style]}>
      {header ? <Text style={styles.groupHeader}>{header}</Text> : null}
      <View style={styles.groupBody}>
        {items.map((child, index) => (
          <Fragment key={index}>
            {child}
            {index < items.length - 1 ? <View style={styles.separator} /> : null}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={styles.groupFooter}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  value,
  onPress,
  chevron,
  destructive,
  icon,
  accessory,
  detail,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  icon?: ComponentProps<typeof SymbolView>['name'];
  accessory?: ReactNode;
  detail?: string;
}) {
  const content = (
    <>
      {icon ? (
        <AppIcon
          name={icon}
          size={24}
          color={destructive ? palette.red : palette.blue}
        />
      ) : null}
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, destructive ? { color: palette.red } : null]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      {accessory}
      {chevron ? (
        ios ? (
          <SymbolView name="chevron.right" tintColor={palette.tertiaryLabel} style={styles.chevron} />
        ) : (
          <AppIcon name="chevron.right" size={16} color={palette.tertiaryLabel} />
        )
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      android_ripple={ios ? undefined : ripple()}
      style={({ pressed }) => [styles.row, pressed && ios ? styles.rowPressed : null]}
    >
      {content}
    </Pressable>
  );
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: Tone }) {
  const color = toneColor[tone];
  return (
    <View style={[styles.badge, ios ? { borderColor: color } : { backgroundColor: `${color}1F` }]}>
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon = 'tray',
}: {
  title: string;
  message: string;
  icon?: ComponentProps<typeof SymbolView>['name'];
}) {
  return (
    <View style={styles.empty}>
      <AppIcon name={icon} size={40} color={palette.tertiaryLabel} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export function Subpage({
  title,
  onBack,
  right,
  children,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  if (!ios) {
    // 安卓走 M3 top app bar：圆形返回按钮 + 左对齐标题。
    return (
      <View style={styles.subpage}>
        <View style={styles.navBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={onBack}
            android_ripple={{ ...ripple(), borderless: true }}
            style={styles.navBackButton}
          >
            <AppIcon name="chevron.left" size={22} color={palette.label} />
          </Pressable>
          <Text style={styles.navTitleAndroid} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.navRight}>{right}</View>
        </View>
        {children}
      </View>
    );
  }

  return (
    <View style={styles.subpage}>
      <View style={styles.navBar}>
        <GlassPillButton
          icon="chevron.left"
          fallback="‹"
          label="返回"
          onPress={onBack}
          style={styles.backButton}
        />
        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.navRight}>{right}</View>
      </View>
      {children}
    </View>
  );
}

export function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.sheetNav}>
      <Text style={styles.sheetNavTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.sheetNavRight}>
        {ios ? (
          <GlassPillButton label="完成" onPress={onClose} />
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.textButton,
              pressed ? styles.textButtonPressed : null,
            ]}
          >
            <Text style={styles.textButtonLabel}>完成</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheetRoot} edges={['top', 'bottom', 'left', 'right']}>
        <SheetHeader title={title} onClose={onClose} />
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {children}
        </ScrollView>
        {footer ? <View style={styles.sheetFooter}>{footer}</View> : null}
      </SafeAreaView>
    </Modal>
  );
}

export function ProgressBar({ percent, tone = 'info' }: { percent: number; tone?: Tone }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${clamped}%`, backgroundColor: toneColor[tone] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  androidSegmented: {
    flexDirection: 'row',
    backgroundColor: palette.fill,
    borderRadius: shape.full,
    padding: 4,
    gap: 2,
  },
  androidSegment: {
    flex: 1,
    minHeight: 40,
    borderRadius: shape.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidSegmentActive: {
    backgroundColor: palette.card,
    ...elevation.level1,
  },
  androidSegmentText: {
    color: palette.secondaryLabel,
    ...type.labelLarge,
  },
  androidSegmentTextActive: {
    color: palette.label,
    ...type.labelLarge,
    fontWeight: '600',
  },
  group: {
    marginTop: ios ? 24 : 20,
  },
  groupHeader: {
    color: palette.secondaryLabel,
    fontSize: ios ? 13 : 12,
    fontWeight: ios ? undefined : '500',
    marginBottom: ios ? 7 : 8,
    marginLeft: ios ? 0 : 4,
  },
  groupBody: {
    backgroundColor: palette.card,
    borderRadius: ios ? 12 : shape.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    ...(ios ? {} : elevation.level1),
  },
  groupFooter: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 7,
    marginHorizontal: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.separator,
    marginLeft: 16,
  },
  row: {
    minHeight: ios ? 47 : 56,
    paddingHorizontal: 16,
    paddingVertical: ios ? 10 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ios ? 10 : 12,
    backgroundColor: palette.card,
  },
  rowPressed: {
    backgroundColor: palette.fill,
  },
  rowIcon: {
    width: 24,
    height: 24,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    color: palette.label,
    fontSize: ios ? 17 : 16,
    fontWeight: ios ? '400' : '500',
    letterSpacing: ios ? undefined : 0.1,
  },
  rowSubtitle: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  rowValue: {
    color: palette.secondaryLabel,
    fontSize: ios ? 17 : 14,
    fontWeight: ios ? undefined : '400',
    textAlign: 'right',
  },
  rowDetail: {
    color: palette.secondaryLabel,
    fontSize: 13,
    textAlign: 'right',
  },
  chevron: {
    width: 12,
    height: 18,
  },
  chevronText: {
    color: palette.tertiaryLabel,
    fontSize: 22,
    fontWeight: '300',
  },
  badge: {
    minWidth: ios ? 52 : 56,
    paddingHorizontal: ios ? 8 : 10,
    paddingVertical: ios ? 3 : 4,
    borderRadius: ios ? 10 : shape.sm,
    borderWidth: ios ? 1 : 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: ios ? 11 : 12,
    fontWeight: ios ? '700' : '500',
    letterSpacing: ios ? undefined : 0.2,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: ios ? 56 : 48,
    gap: ios ? 6 : 8,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    marginBottom: 6,
  },
  emptyTitle: {
    color: palette.label,
    fontSize: ios ? 17 : 16,
    fontWeight: ios ? '600' : '500',
  },
  emptyMessage: {
    color: palette.secondaryLabel,
    fontSize: ios ? 14 : 14,
    lineHeight: ios ? 20 : 20,
    textAlign: 'center',
  },
  subpage: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
  },
  navBar: {
    height: ios ? 52 : 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ios ? 16 : 8,
  },
  navBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  navTitleAndroid: {
    flex: 1,
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  textButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonPressed: {
    backgroundColor: m3.surfaceContainer,
  },
  textButtonLabel: {
    color: palette.blue,
    fontSize: 14,
    fontWeight: '500',
  },
  backButton: {
    minWidth: 78,
    height: 36,
  },
  navTitle: {
    position: 'absolute',
    left: 96,
    right: 96,
    textAlign: 'center',
    color: palette.label,
    fontSize: ios ? 17 : 18,
    fontWeight: '600',
  },
  navRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetRoot: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
  },
  sheetNav: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sheetNavTitle: {
    position: 'absolute',
    left: 96,
    right: 96,
    textAlign: 'center',
    color: palette.label,
    fontSize: ios ? 17 : 18,
    fontWeight: '600',
  },
  sheetNavRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  sheetFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
    backgroundColor: palette.groupedBackground,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.fill,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  glassFallback: {
    borderWidth: ios ? StyleSheet.hairlineWidth : 0,
    borderColor: 'rgba(60,60,67,0.16)',
    ...(ios
      ? {
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }
      : elevation.level1),
  },
  glassPressed: {
    opacity: 0.55,
  },
  glassIconFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassPillWrap: {
    height: ios ? 36 : 40,
  },
  glassPillFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  glassPillIcon: {
    width: 11,
    height: 18,
  },
  glassPillLabel: {
    fontSize: ios ? 15 : 14,
    fontWeight: '600',
  },
});
