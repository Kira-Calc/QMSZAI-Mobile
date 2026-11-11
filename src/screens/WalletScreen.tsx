import * as Clipboard from 'expo-clipboard';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatQuota } from '../api/format';
import { useAuth } from '../auth/AuthProvider';
import { pressedSurface } from '../material';
import { Group, Row, Subpage, palette } from '../ui';

const ios = Platform.OS === 'ios';

const REGISTER_HOST = 'https://test.qmszai.cn';

export function WalletScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, quotaPerUnit } = useAuth();

  const affCode = user?.aff_code || '';
  const inviteLink = affCode ? `${REGISTER_HOST}/register?aff=${affCode}` : '';

  const copyInvite = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert('已复制邀请链接');
  };

  return (
    <Subpage title="钱包" onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>当前余额</Text>
          <Text style={styles.heroValue}>{formatQuota(user?.quota ?? 0, quotaPerUnit)}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{formatQuota(user?.used_quota ?? 0, quotaPerUnit)}</Text>
              <Text style={styles.heroMetaLabel}>历史消耗</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{(user?.request_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.heroMetaLabel}>请求次数</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{user?.group || '—'}</Text>
              <Text style={styles.heroMetaLabel}>用户分组</Text>
            </View>
          </View>
        </View>

        <Group header="邀请奖励">
          <View style={styles.inviteStats}>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>
                {formatQuota(user?.aff_quota ?? 0, quotaPerUnit)}
              </Text>
              <Text style={styles.inviteLabel}>待使用收益</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>
                {formatQuota(user?.aff_history_quota ?? 0, quotaPerUnit)}
              </Text>
              <Text style={styles.inviteLabel}>总收益</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>{(user?.aff_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.inviteLabel}>邀请人数</Text>
            </View>
          </View>
          <View style={styles.linkBox}>
            <Text style={styles.linkLabel}>邀请码</Text>
            <Text selectable style={styles.linkText}>
              {affCode || '—'}
            </Text>
          </View>
          {inviteLink ? (
            <Pressable
              accessibilityRole="button"
              onPress={copyInvite}
              style={({ pressed }) => [styles.copyRow, pressed ? pressedSurface : null]}
            >
              <Text style={[styles.copyText, { color: palette.blue }]}>复制邀请链接</Text>
            </Pressable>
          ) : null}
        </Group>

        <Group header="额度说明">
          <Row title="计费单位" value={`${quotaPerUnit.toLocaleString()} 额度 / ¥1`} />
          <Row title="余额来源" value="签到、兑换码、邀请奖励" />
        </Group>
      </ScrollView>
    </Subpage>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: palette.card,
    padding: 20,
    gap: 4,
    marginTop: 4,
    borderRadius: ios ? 12 : 28,
    borderCurve: 'continuous',
  },
  heroLabel: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  heroValue: {
    color: palette.label,
    fontSize: 34,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  heroMeta: {
    gap: 2,
  },
  heroMetaValue: {
    color: palette.label,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  heroMetaLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  inviteStats: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inviteStat: {
    flex: 1,
    gap: 2,
  },
  inviteValue: {
    color: palette.label,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  inviteLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  linkBox: {
    marginHorizontal: 16,
    padding: ios ? 12 : 14,
    borderRadius: ios ? 10 : 16,
    backgroundColor: palette.fill,
    gap: 4,
  },
  linkLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  linkText: {
    color: palette.label,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  copyRow: {
    minHeight: ios ? 44 : 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyText: {
    fontSize: 16,
  },
  disabled: {
    opacity: 0.4,
  },
});
