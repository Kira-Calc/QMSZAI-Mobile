import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchCheckin, submitCheckin, updateSelf } from '../api/endpoints';
import type { CheckinStatus } from '../api/types';
import { formatQuota, formatQuotaSmart } from '../api/format';
import { useAuth } from '../auth/AuthProvider';
import { cardSurface, m3, pressedDim } from '../material';
import { Group, Row, Sheet, Subpage, palette } from '../ui';

const ios = Platform.OS === 'ios';

const roleLabel = (role: number) => (role === 1 ? '普通用户' : `角色 ${role}`);

export function PersonalScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, signOut, refreshUser, quotaPerUnit, siteStatus } = useAuth();

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
  const initial = displayNameValue.trim().charAt(0).toUpperCase() || '·';
  const checkedIn = checkin?.stats?.checked_in_today ?? false;
  const checkinEnabled = checkin?.enabled ?? Boolean(siteStatus?.checkin_enabled);

  const checkIn = async () => {
    if (checkedIn || checkinBusy) return;
    setCheckinBusy(true);
    try {
      const result = await submitCheckin();
      Alert.alert('签到成功', `获得 ${formatQuotaSmart(result.quota_awarded ?? 0, quotaPerUnit)} 额度`);
      await Promise.all([loadCheckin(), refreshUser()]);
    } catch (error) {
      Alert.alert('签到失败', error instanceof Error ? error.message : '请稍后重试');
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
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!user || busy) return;
    if (newPassword.length < 8 || newPassword.length > 20) {
      Alert.alert('密码格式不正确', '新密码需为 8–20 位');
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
      Alert.alert('密码已更新');
    } catch (error) {
      Alert.alert('修改失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('退出登录？', '退出后需要重新输入账号密码。', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <Subpage title="个人设置" onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileMain}>
            <Text style={styles.name}>{displayNameValue || '未登录'}</Text>
            <Text style={styles.role}>
              {roleLabel(user?.role ?? 0)} · ID {user?.id ?? '—'}
            </Text>
          </View>
          <View style={styles.balanceBlock}>
            <Text style={styles.balance}>{formatQuota(user?.quota ?? 0, quotaPerUnit)}</Text>
            <Text style={styles.balanceLabel}>剩余额度</Text>
          </View>
        </View>

        <Group>
          <Row title="历史消耗" value={formatQuota(user?.used_quota ?? 0, quotaPerUnit)} />
          <Row title="请求次数" value={(user?.request_count ?? 0).toLocaleString()} />
          <Row title="用户分组" value={user?.group || '—'} />
          <Row title="手机号" value={user?.phone || '—'} />
        </Group>

        {checkinEnabled ? (
          <Group header="每日签到">
            <View style={styles.checkinBody}>
              <View style={styles.checkinStats}>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>{checkin?.stats?.checkin_count ?? 0}</Text>
                  <Text style={styles.statLabel}>累计签到</Text>
                </View>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>
                    {formatQuotaSmart(checkin?.stats?.total_quota ?? 0, quotaPerUnit)}
                  </Text>
                  <Text style={styles.statLabel}>累计获得</Text>
                </View>
                <View style={styles.checkinStat}>
                  <Text style={styles.statValue}>
                    {formatQuotaSmart(checkin?.max_quota ?? 0, quotaPerUnit)}
                  </Text>
                  <Text style={styles.statLabel}>单次上限</Text>
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
                  {checkedIn ? '今日已签到' : checkinBusy ? '签到中…' : '立即签到'}
                </Text>
              </Pressable>
            </View>
          </Group>
        ) : null}

        <Group header="账号">
          <Row title="用户名" value={user?.username || '—'} />
          <Row title="显示名称" value={user?.display_name || '—'} chevron onPress={openProfile} />
          <Row title="登录密码" value={user?.has_password ? '已设置' : '未设置'} chevron onPress={openPassword} />
        </Group>

        <Pressable
          accessibilityRole="button"
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed ? styles.signOutPressed : null]}
        >
          <Text style={[styles.signOutText, { color: palette.red }]}>退出登录</Text>
        </Pressable>
      </ScrollView>

      <Sheet visible={sheet === 'profile'} title="显示名称" onClose={() => setSheet(null)}>
        <View style={styles.form}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="输入显示名称"
            placeholderTextColor={palette.tertiaryLabel}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={saveProfile}
            style={({ pressed }) => [styles.primary, pressed ? pressedDim : null]}
          >
            <Text style={styles.primaryText}>{busy ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={sheet === 'password'} title="修改密码" onClose={() => setSheet(null)}>
        <View style={styles.form}>
          <TextInput
            value={originalPassword}
            onChangeText={setOriginalPassword}
            placeholder="当前密码"
            placeholderTextColor={palette.tertiaryLabel}
            secureTextEntry
            style={styles.input}
          />
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="新密码（8–20 位）"
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
            <Text style={styles.primaryText}>{busy ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>
      </Sheet>
    </Subpage>
  );
}

const styles = StyleSheet.create({
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
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
});
