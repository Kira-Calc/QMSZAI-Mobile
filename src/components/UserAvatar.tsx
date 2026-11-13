import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAvatar } from '../avatar';
import { palette } from '../theme';

// 有自定义头像时显示图片，否则回退成昵称首字母（原来的行为）。
export function UserAvatar({
  userId,
  name,
  size = 56,
  style,
}: {
  userId?: number | string;
  name?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const uri = useAvatar(userId);
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || '·';

  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initial, { fontSize: Math.round(size * 0.43) }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initial: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
