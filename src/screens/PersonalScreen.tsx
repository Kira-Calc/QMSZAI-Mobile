import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchCheckin, submitCheckin, updateSelf } from '../api/endpoints';
import type { CheckinStatus } from '../api/types';
import { formatQuota, formatQuotaSmart } from '../api/format';
import { useAuth } from '../auth/AuthProvider';
import { removeAvatar, saveAvatar, useAvatar } from '../avatar';
import { cardSurface, m3, pressedDim } from '../material';
import { Group, Row, Sheet, Subpage, palette } from '../ui';
import { AppIcon } from '../components/AppIcon';
import { UserAvatar } from '../components/UserAvatar';
import { isDark, setMode, themedStyles, useThemeMode } from '../theme';
import type { ThemeMode } from '../theme';
import { setLanguage, t, tf, useLanguage, useLanguageSetting } from '../i18n';
import type { LanguageSetting } from '../i18n';

const ios = Platform.OS === 'ios';

const roleLabel = (role: number) => (role === 1 ? t('普通用户') : tf('角色 {0}', role));

export function PersonalScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, signOut, refreshUser, quotaPerUnit, siteStatus } = useAuth();
  const themeMode = useThemeMode();
  const languageSetting = useLanguageSetting();
  useLanguage();

  // 文案随语言切换，放在渲染期求值。
  const appearanceOptions: Array<{ mode: ThemeMode; title: string }> = [
    { mode: 'system', title: t('跟随系统') },
    { mode: 'light', title: t('浅色') },
    { mode: 'dark', title: t('深色') },
  ];
  const languageOptions: Array<{ value: LanguageSetting; title: string }> = [
    { value: 'system', title: t('跟随系统') },
    { value: 'zh', title: '简体中文' },
    { value: 'en', title: 'English' },
  ];

  const [checkin, setCheckin] = useState<CheckinStatus | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'profile' | 'password'>(null);
  const [displayName, setDisplayName] = useState('');
  const [originalPassword, setOriginalPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const loadCheckin = useCallback(async () => {
    try {
      setCheckin(await fetchCheckin());
    } catch {
      setCheckin(null);
    }
  }, []);

  useEffect(() => {
    loadCheckin();
    refreshUser();
  }, [loadCheckin, refreshUser]);

  const displayNameValue = user?.display_name || user?.username || '';
  const avatarUri = useAvatar(user?.id);
  const checkedIn = checkin?.stats?.checked_in_today ?? false;
  const checkinEnabled = checkin?.enabled ?? Boolean(siteStatus?.checkin_enabled);

  const checkIn = async () => {
    if (checkedIn || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const result = await submitCheckin();
      Alert.alert(t('签到成功'), tf('获得 {0} 额度', formatQuotaSmart(result.quota_awarded ?? 0, quotaPerUnit)));
      await Promise.all([loadCheckin(), refreshUser()]);
    } catch (error) {
      Alert.alert(t('签到失败'), error instanceof Error ? error.message : t('请稍后重试'));
    } finally {
      setCheckinBusy(false);
    }
  };

  const openProfile = () => {
    setDisplayName(user?.display_name || '');
    setSheet('profile');
  };

  const openPassword = () => {
    setOriginalPassword('');
    setNewPassword('');
    setSheet('password');
  };

  const saveProfile = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      await updateSelf({
        username: user.username,
        display_name: displayName.trim(),
      });
      await refreshUser();
      setSheet(null);
    } catch (error) {
      Alert.alert(t('保存失败'), error instanceof Error ? error.message : t('请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!user || busy) return;
    if (newPassword.length < 8 || newPassword.length > 20) {
      Alert.alert(t('密码格式不正确'), t('新密码需为 8–20 位'));
      return;
    }
    setBusy(true);
    try {
      await updateSelf({
        username: user.username,
        original_password: originalPassword,
        password: newPassword,
      });
      setSheet(null);
      Alert.alert(t('密码已更新'));
    } catch (error) {
      Alert.alert(t('修改失败'), error instanceof Error ? error.message : t('请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = async () => {
    if (!user?.id) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      const asset = result.canceled ? null : result.assets?.[0];
      if (!asset) return;
      await saveAvatar(user.id, asset.uri);
    } catch (error) {
      Alert.alert(t('无法打开相册'), error instanceof Error ? error.message : t('请稍后重试'));
    }
  };

  // 点头像直接进相册，避免安卓三按钮弹窗把长文案挤在一行。
  const confirmRemoveAvatar = () => {
    if (!user?.id) return;
    Alert.alert(t('移除头像？'), undefined, [
      { text: t('取消'), style: 'cancel' },
      { text: t('移除'), style: 'destructive', onPress: () => void removeAvatar(user.id) },
    ]);
  };

  const confirmSignOut = () => {
    Alert.alert(t('退出登录？'), t('退出后需要重新输入账号密码。'), [
      { text: t('取消'), style: 'cancel' },
      { text: t('退出'), style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <Subpage title={t("个人设置")} onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.profile}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('更换头像')}
            onPress={() => void pickAvatar()}
            style={({ pressed }) => [styles.avatarButton, pressed ? pressedDim : null]}
          >
            <UserAvatar userId={user?.id} name={displayNameValue} size={56} />
            <View style={styles.avatarBadge}>
              <AppIcon name="camera" size={11} color="#FFFFFF" />
            </View>
          </Pressable>
          <View style={styles.profileMain}>
            <Text style={styles.name}>{displayNameValue || t('未登录')}</Text>
            <Text style={styles.role}>
              {roleLabel(user?.role ?? 0)} · ID {user?.id ?? '—'}
            </Text>
          </View>
          <View style={styles.balanceBlock}>
            <Text style={styles.balance}>{formatQuota(user?.quota ?? 0, quotaPerUnit)}</Text>
            <Text style={styles.balanceLabel}>{t('剩余额度')}</Text>
          </View>
        </View>

        <Group>
          <Row title={t("历史消耗")} value={formatQuota(user?.used_quota ?? 0, quotaPerUnit)} />
          <Row title={t("请求次数")} value={(user?.request_count ?? 0).toLocaleString()} />
          <Row title={t("用户分组")} value={user?.group || '—'} />
          <Row title={t("手机号")} value={user?.phone || '—'} />
        </Group>

        {checkinEnabled ? (
          <Group header={t("每日签到")}>
            <View style={styles.checkinBody}>
              <View style={styles.checkinStats}>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>{checkin?.stats?.checkin_count ?? 0}</Text>
                  <Text style={styles.statLabel}>{t('累计签到')}</Text>
                </View>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>
                    {formatQuotaSmart(checkin?.stats?.total_quota ?? 0, quotaPerUnit)}
                  </Text>
                  <Text style={styles.statLabel}>{t('累计获得')}</Text>
                </View>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>
                    {formatQuotaSmart(checkin?.max_quota ?? 0, quotaPerUnit)}
                  </Text>
                  <Text style={styles.statLabel}>{t('单次上限')}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: checkedIn || checkinBusy }}
                disabled={checkedIn || checkinBusy}
                onPress={checkIn}
                style={({ pressed }) => [
                  styles.checkinButton,
                  checkedIn ? styles.checkinDone : null,
                  pressed ? pressedDim : null,
                ]}
              >
                <Text style={[styles.checkinText, checkedIn ? styles.checkinTextDone : null]}>
                  {checkedIn ? t('今日已签到') : checkinBusy ? t('签到中…') : t('立即签到')}
                </Text>
              </Pressable>
            </View>
          </Group>
        ) : null}

        <Group header={t("账号")}>
          <Row title={t("用户名")} value={user?.username || '—'} />
          <Row title={t("显示名称")} value={user?.display_name || '—'} chevron onPress={openProfile} />
          <Row title={t("登录密码")} value={user?.has_password ? t('已设置') : t('未设置')} chevron onPress={openPassword} />
          {avatarUri ? (
            <Row title={t("移除头像")} destructive onPress={confirmRemoveAvatar} />
          ) : null}
        </Group>

        <Group header={t("外观")}>
          {appearanceOptions.map((option) => (
            <Row
              key={option.mode}
              title={option.title}
              onPress={() => setMode(option.mode)}
              accessory={
                themeMode === option.mode ? (
                  <AppIcon name="checkmark" size={18} color={palette.blue} />
                ) : null
              }
            />
          ))}
        </Group>

        <Group header={t("语言")}>
          {languageOptions.map((option) => (
            <Row
              key={option.value}
              title={option.title}
              onPress={() => setLanguage(option.value)}
              accessory={
                languageSetting === option.value ? (
                  <AppIcon name="checkmark" size={18} color={palette.blue} />
                ) : null
              }
            />
          ))}
        </Group>

        <Pressable
          accessibilityRole="button"
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed ? styles.signOutPressed : null]}
        >
          <Text style={[styles.signOutText, { color: palette.red }]}>{t('退出登录')}</Text>
        </Pressable>
      </ScrollView>

      <Sheet visible={sheet === 'profile'} title={t("显示名称")} onClose={() => setSheet(null)}>
        <View style={styles.form}>
          <TextInput
            keyboardAppearance={isDark() ? 'dark' : 'light'}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t("输入显示名称")}
            placeholderTextColor={palette.tertiaryLabel}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={saveProfile}
            style={({ pressed }) => [styles.primary, pressed ? pressedDim : null]}
          >
            <Text style={styles.primaryText}>{busy ? t('保存中…') : t('保存')}</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'password'} title={t("修改密码")} onClose={() => setSheet(null)}>
        <View style={styles.form}>
          <TextInput
            keyboardAppearance={isDark() ? 'dark' : 'light'}
            value={originalPassword}
            onChangeText={setOriginalPassword}
            placeholder={t("当前密码")}
            placeholderTextColor={palette.tertiaryLabel}
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            keyboardAppearance={isDark() ? 'dark' : 'light'}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={t("新密码（8–20 位）")}
            placeholderTextColor={palette.tertiaryLabel}
            secureTextEntry
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={savePassword}
            style={({ pressed }) => [styles.primary, pressed ? pressedDim : null]}
          >
            <Text style={styles.primaryText}>{busy ? t('保存中…') : t('保存')}</Text>
          </Pressable>
        </View>
      </Sheet>
    </Subpage>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.card,
    padding: ios ? 16 : 18,
    marginTop: 4,
    ...cardSurface,
  },
  avatarButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.card,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMain: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  role: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  balanceBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balance: {
    color: palette.label,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  balanceLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  checkinBody: {
    padding: 16,
    gap: 14,
  },
  checkinStats: {
    flexDirection: 'row',
    gap: 10,
  },
  checkinStat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    color: palette.label,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  checkinButton: {
    minHeight: ios ? 44 : 52,
    overflow: 'hidden',
    borderRadius: ios ? 10 : 26,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinDone: {
    backgroundColor: palette.fill,
  },
  checkinText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  checkinTextDone: {
    color: palette.secondaryLabel,
  },
  signOut: {
    minHeight: ios ? 48 : 52,
    overflow: 'hidden',
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  signOutPressed: {
    backgroundColor: m3.surfaceContainer,
  },
  signOutText: {
    fontSize: 17,
  },
  form: {
    gap: 12,
    padding: 16,
  },
  input: {
    minHeight: ios ? 44 : 52,
    paddingHorizontal: 14,
    borderRadius: ios ? 10 : 12,
    backgroundColor: palette.fill,
    color: palette.label,
    fontSize: 16,
  },
  primary: {
    minHeight: ios ? 46 : 52,
    borderRadius: ios ? 10 : 26,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
}));
