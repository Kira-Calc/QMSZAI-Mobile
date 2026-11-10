import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Group, Row, Sheet, Subpage, palette } from '../ui';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);

const bindings = [
  { name: '邮箱', status: '未绑定', detail: '用于登录与找回密码' },
  { name: '微信', status: '未启用', detail: '站点未开启微信登录' },
  { name: 'GitHub', status: '未绑定', detail: 'OAuth 登录方式' },
  { name: 'Discord', status: '未绑定', detail: 'OAuth 登录方式' },
  { name: 'OIDC', status: '未绑定', detail: '企业统一身份认证' },
  { name: 'Telegram', status: '未绑定', detail: 'OAuth 登录方式' },
  { name: 'LinuxDO', status: '未绑定', detail: '社区账号登录' },
];

const languages = ['简体中文', 'English', '日本語'];

export function PersonalScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkinCount, setCheckinCount] = useState(0);
  const [reward, setReward] = useState(0);
  const [language, setLanguage] = useState('简体中文');
  const [languageSheet, setLanguageSheet] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  const checkIn = () => {
    if (checkedIn) {
      return;
    }
    const amount = 0.5;
    setCheckedIn(true);
    setCheckinCount((count) => count + 1);
    setReward((total) => total + amount);
    Alert.alert('签到成功', `本次获得模拟额度 ¥${amount.toFixed(2)}，已计入累计获得。`);
  };

  const bindingAction = (name: string, status: string) => {
    if (status === '未启用') {
      Alert.alert('暂不可用', `${name}登录未在站点启用。`);
      return;
    }
    Alert.alert(`绑定${name}`, '演示模式不会发起真实 OAuth 授权。接入登录后，这里会打开系统授权页并在回调中完成绑定。', [
      { text: '知道了', style: 'cancel' },
    ]);
  };

  const signOut = () => {
    Alert.alert('退出登录？', '演示模式没有真实登录态，此操作不会影响网站账号。', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => undefined },
    ]);
  };

  return (
    <Subpage title="个人设置" onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>K</Text>
          </View>
          <View style={styles.profileMain}>
            <Text style={styles.name}>kira</Text>
            <Text style={styles.role}>普通用户 · ID 493</Text>
          </View>
          <View style={styles.balanceBlock}>
            <Text style={styles.balance}>¥278.44</Text>
            <Text style={styles.balanceLabel}>当前余额</Text>
          </View>
        </View>

        <Group>
          <Row title="历史消耗" value="¥22.56" />
          <Row title="请求次数" value="218" />
          <Row title="用户分组" value="default" />
        </Group>

        <Group
          header="每日签到"
        >
          <View style={styles.checkinBody}>
            <View style={styles.checkinStats}>
              <View style={styles.checkinStat}>
                <Text style={styles.statValue}>{checkinCount}</Text>
                <Text style={styles.statLabel}>累计签到</Text>
              </View>
              <View style={styles.checkinStat}>
                <Text style={styles.statValue}>¥{reward.toFixed(2)}</Text>
                <Text style={styles.statLabel}>本次获得</Text>
              </View>
              <View style={styles.checkinStat}>
                <Text style={styles.statValue}>¥{reward.toFixed(2)}</Text>
                <Text style={styles.statLabel}>累计获得</Text>
              </View>
            </View>
            <View style={styles.weekStrip}>
              {weekdays.map((day, index) => {
                const date = 8 + index;
                const active = date === 9;
                return (
                  <View key={day} style={styles.dayCell}>
                    <Text style={styles.dayLabel}>{day}</Text>
                    <View style={[styles.dayDot, active ? styles.dayDotActive : null]}>
                      <Text style={[styles.dayNumber, active ? styles.dayNumberActive : null]}>
                        {date}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: checkedIn }}
              disabled={checkedIn}
              onPress={checkIn}
              style={[styles.checkinButton, checkedIn ? styles.checkinDone : null]}
            >
              <Text style={[styles.checkinText, checkedIn ? styles.checkinTextDone : null]}>
                {checkedIn ? '今日已签到' : '立即签到'}
              </Text>
            </Pressable>
            <View style={styles.calendar}>
              {calendarDays.map((day) => (
                <View key={day} style={styles.calendarCell}>
                  <Text style={[styles.calendarDay, day === 9 ? styles.calendarToday : null]}>
                    {day}
                  </Text>
                  {day === 9 ? <View style={styles.todayDot} /> : null}
                </View>
              ))}
            </View>
          </View>
        </Group>

        <Group header="账户绑定">
          {bindings.map((binding) => (
            <Row
              key={binding.name}
              title={binding.name}
              subtitle={binding.detail}
              value={binding.status}
              chevron
              onPress={() => bindingAction(binding.name, binding.status)}
            />
          ))}
        </Group>

        <Group header="偏好设置">
          <Row title="语言" value={language} chevron onPress={() => setLanguageSheet(true)} />
          <View style={styles.switchRow}>
            <View style={styles.switchMain}>
              <Text style={styles.switchTitle}>系统通知</Text>
              <Text style={styles.switchSubtitle}>任务完成、额度与安全提醒</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ true: palette.green }}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchMain}>
              <Text style={styles.switchTitle}>自动保存草稿</Text>
              <Text style={styles.switchSubtitle}>在聊天与创作页保留未提交内容</Text>
            </View>
            <Switch
              value={autoSave}
              onValueChange={setAutoSave}
              trackColor={{ true: palette.green }}
            />
          </View>
        </Group>

        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut}>
          <Text style={[styles.signOutText, { color: palette.red }]}>退出登录</Text>
        </Pressable>
      </ScrollView>

      <Sheet visible={languageSheet} title="语言" onClose={() => setLanguageSheet(false)}>
        <Group>
          {languages.map((item) => (
            <Row
              key={item}
              title={item}
              value={item === language ? '✓' : undefined}
              onPress={() => {
                setLanguage(item);
                setLanguageSheet(false);
              }}
            />
          ))}
        </Group>
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
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 16,
    marginTop: 4,
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
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    gap: 5,
    width: 34,
  },
  dayLabel: {
    color: palette.secondaryLabel,
    fontSize: 11,
  },
  dayDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotActive: {
    backgroundColor: palette.blue,
  },
  dayNumber: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  dayNumberActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkinButton: {
    minHeight: 44,
    borderRadius: 10,
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
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.separator,
    paddingTop: 12,
  },
  calendarCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 5,
    gap: 2,
  },
  calendarDay: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  calendarToday: {
    color: palette.blue,
    fontWeight: '600',
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.blue,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 47,
  },
  switchMain: {
    flex: 1,
    gap: 2,
  },
  switchTitle: {
    color: palette.label,
    fontSize: 17,
  },
  switchSubtitle: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  signOut: {
    minHeight: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  signOutText: {
    fontSize: 17,
  },
});
