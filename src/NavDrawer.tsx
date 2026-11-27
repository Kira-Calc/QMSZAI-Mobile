import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SymbolView } from 'expo-symbols';

import { AppIcon } from './components/AppIcon';
import { UserAvatar } from './components/UserAvatar';
import { shape } from './material';
import { palette } from './ui';
import { themedStyles } from './theme';
import { t } from './i18n';
import type { TabKey } from './types';

const ios = Platform.OS === 'ios';

export type DrawerSubpage = 'messages' | 'personal' | 'wallet';

type IconName = ComponentProps<typeof SymbolView>['name'];

type NavItem = {
  key: TabKey;
  label: string;
  icon: IconName;
};

// 主导航：原来底部 5 个标签全部收进侧边栏，把纵向空间还给内容（尤其是聊天）。
function primaryItems(): NavItem[] {
  return [
    { key: 'chat', label: t('聊天'), icon: 'bubble.left.and.bubble.right' },
    { key: 'overview', label: t('概览'), icon: 'chart.bar' },
    { key: 'models', label: t('模型目录'), icon: 'square.stack.3d.up' },
    { key: 'tokens', label: t('API 令牌'), icon: 'key' },
    { key: 'account', label: t('账户中心'), icon: 'person.crop.circle' },
  ];
}

export function NavDrawer({
  visible,
  onClose,
  activeTab,
  onSelectTab,
  onOpenSubpage,
  userName,
  userHandle,
  userId,
  balance,
  unreadMessages = 0,
}: {
  visible: boolean;
  onClose: () => void;
  activeTab: TabKey;
  onSelectTab: (key: TabKey) => void;
  onOpenSubpage: (page: DrawerSubpage) => void;
  userName: string;
  userHandle: string;
  userId?: number;
  balance: string;
  unreadMessages?: number;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(320, width - 56);
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [visible, progress]);

  if (!mounted) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

  const selectTab = (key: TabKey) => {
    onClose();
    onSelectTab(key);
  };

  const openSubpage = (page: DrawerSubpage) => {
    onClose();
    onOpenSubpage(page);
  };

  return (
    <Modal
      visible
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('关闭菜单')}
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              transform: [{ translateX }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.brand}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>{t('阡')}</Text>
              </View>
              <Text style={styles.brandName}>{t('阡陌数智')}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('个人设置')}
              onPress={() => openSubpage('personal')}
              style={({ pressed }) => [styles.account, pressed ? styles.itemPressed : null]}
            >
              <UserAvatar userId={userId} name={userName} size={44} />
              <View style={styles.accountMain}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {userName}
                </Text>
                {userHandle ? (
                  <Text style={styles.accountHandle} numberOfLines={1}>
                    {userHandle}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.balance}>{balance}</Text>
            </Pressable>

            <View style={styles.navGroup}>
              {primaryItems().map((item) => {
                const active = item.key === activeTab;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    onPress={() => selectTab(item.key)}
                    style={({ pressed }) => [
                      styles.item,
                      active ? styles.itemActive : null,
                      pressed ? styles.itemPressed : null,
                    ]}
                  >
                    <AppIcon
                      name={item.icon}
                      size={20}
                      color={active ? palette.blue : palette.secondaryLabel}
                    />
                    <Text style={[styles.itemLabel, active ? styles.itemLabelActive : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.divider} />

            <View style={styles.navGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('消息')}
                onPress={() => openSubpage('messages')}
                style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
              >
                <AppIcon name="bell" size={20} color={palette.secondaryLabel} />
                <Text style={styles.itemLabel}>{t('消息')}</Text>
                {unreadMessages > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('钱包')}
                onPress={() => openSubpage('wallet')}
                style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
              >
                <AppIcon name="creditcard" size={20} color={palette.secondaryLabel} />
                <Text style={styles.itemLabel}>{t('钱包')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    backgroundColor: palette.overlay,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.groupedBackground,
    borderTopRightRadius: shape.xl,
    borderBottomRightRadius: shape.xl,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: ios ? 0.18 : 0,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 16,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: ios ? 9 : shape.sm,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  brandName: {
    color: palette.label,
    fontSize: 17,
    fontWeight: '600',
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: shape.lg,
    backgroundColor: palette.card,
    marginBottom: 12,
  },
  accountMain: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  accountHandle: {
    color: palette.subtleLabel,
    fontSize: 13,
  },
  balance: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  navGroup: {
    gap: 2,
  },
  item: {
    minHeight: ios ? 46 : 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  itemActive: {
    backgroundColor: palette.tintBlue,
  },
  itemPressed: {
    backgroundColor: palette.fillMuted,
  },
  itemLabel: {
    flex: 1,
    color: palette.label,
    fontSize: 15,
    fontWeight: '500',
  },
  itemLabelActive: {
    color: palette.blue,
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: palette.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.separator,
    marginVertical: 10,
    marginHorizontal: 8,
  },
}));
