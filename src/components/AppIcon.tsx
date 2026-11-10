import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { Platform } from 'react-native';
import type { ComponentProps } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type SymbolName = ComponentProps<typeof SymbolView>['name'];
type IoniconName = ComponentProps<typeof Ionicons>['name'];

// iOS 用 SF Symbols；安卓用 Ionicons 的同义图标，避免退化成 Unicode 占位符号。
const androidIcons: Record<string, IoniconName> = {
  'arrow.triangle.merge': 'git-merge-outline',
  'arrow.up': 'arrow-up',
  'arrow.up.right': 'arrow-up-outline',
  bell: 'notifications-outline',
  'bubble.left.and.bubble.right': 'chatbubbles-outline',
  'chart.bar': 'stats-chart-outline',
  checkmark: 'checkmark',
  'chevron.left': 'chevron-back',
  'chevron.right': 'chevron-forward',
  'chevron.up.chevron.down': 'chevron-expand-outline',
  'clock.arrow.circlepath': 'time-outline',
  creditcard: 'card-outline',
  'doc.text.magnifyingglass': 'document-text-outline',
  key: 'key-outline',
  magnifyingglass: 'search-outline',
  'person.crop.circle': 'person-circle-outline',
  'person.crop.square': 'person-outline',
  plus: 'add',
  'plus.bubble': 'add-circle-outline',
  sparkles: 'sparkles-outline',
  'square.and.pencil': 'create-outline',
  'square.grid.2x2': 'grid-outline',
  'square.stack.3d.up': 'layers-outline',
  'text.bubble': 'chatbubble-ellipses-outline',
  trash: 'trash-outline',
  tray: 'file-tray-outline',
  xmark: 'close',
};

export function AppIcon({
  name,
  size = 20,
  color = '#007AFF',
  style,
}: {
  name: SymbolName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={name} tintColor={color} style={[{ width: size, height: size }, style]} />;
  }

  const glyph = androidIcons[name as string];

  return (
    <Ionicons
      name={glyph ?? 'ellipse-outline'}
      size={size}
      color={color}
      style={style as StyleProp<never>}
    />
  );
}
