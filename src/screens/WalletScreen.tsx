import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchAffCode } from '../api/endpoints';
import { formatQuota } from '../api/format';
import { useAuth } from '../auth/AuthProvider';
import { AppIcon } from '../components/AppIcon';
import { pressedSurface } from '../material';
import { Group, Row, Subpage, palette } from '../ui';
import { themedStyles } from '../theme';
import { t, tf } from '../i18n';

const ios = Platform.OS === 'ios';

const REGISTER_HOST = 'https://test.qmszai.cn';

export function WalletScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, quotaPerUnit, refreshUser } = useAuth();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // /api/user/self 可能还没生成邀请码，和网页端一样在缺失时补一次。
  const [fetchedAffCode, setFetchedAffCode] = useState('');
  useEffect(() => {
    if (user?.aff_code) {
      setFetchedAffCode('');
      return;
    }
    let active = true;
    fetchAffCode()
      .then((code) => {
        if (active && code) setFetchedAffCode(code);
      })
      .catch(() => {
        // 邀请码生成失败不影响页面其它内容。
      });
    return () => {
      active = false;
    };
  }, [user?.aff_code]);

  const affCode = user?.aff_code || fetchedAffCode;
  const inviteLink = affCode ? `${REGISTER_HOST}/register?aff=${affCode}` : '';

  const copyCode = async () => {
    if (!affCode) return;
    await Clipboard.setStringAsync(affCode);
    Alert.alert(t('已复制邀请码'));
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert(t('已复制邀请链接'));
  };

  return (
    <Subpage title={t("钱包")} onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{t('当前余额')}</Text>
          <Text style={styles.heroValue}>{formatQuota(user?.quota ?? 0, quotaPerUnit)}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{formatQuota(user?.used_quota ?? 0, quotaPerUnit)}</Text>
              <Text style={styles.heroMetaLabel}>{t('历史消耗')}</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{(user?.request_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.heroMetaLabel}>{t('请求次数')}</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{user?.group || '—'}</Text>
              <Text style={styles.heroMetaLabel}>{t('用户分组')}</Text>
            </View>
          </View>
        </View>

        <Group header={t("邀请奖励")}>
          <View style={styles.inviteStats}>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>
                {formatQuota(user?.aff_quota ?? 0, quotaPerUnit)}
              </Text>
              <Text style={styles.inviteLabel}>{t('待使用收益')}</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>
                {formatQuota(user?.aff_history_quota ?? 0, quotaPerUnit)}
              </Text>
              <Text style={styles.inviteLabel}>{t('总收益')}</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>{(user?.aff_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.inviteLabel}>{t('邀请人数')}</Text>
            </View>
          </View>
          <Row
            title={t('邀请码')}
            onPress={affCode ? copyCode : undefined}
            accessibilityLabel={affCode ? t('复制邀请码') : undefined}
            accessory={
              <View style={styles.codeGroup}>
                <Text style={styles.codeText}>{affCode || '—'}</Text>
                {affCode ? <AppIcon name="doc.on.doc" size={16} color={palette.blue} /> : null}
              </View>
            }
          />
          {inviteLink ? (
            <Pressable
              accessibilityRole="button"
              onPress={copyInvite}
              style={({ pressed }) => [styles.copyRow, pressed ? pressedSurface : null]}
            >
              <Text style={[styles.copyText, { color: palette.blue }]}>{t('复制邀请链接')}</Text>
            </Pressable>
          ) : null}
        </Group>

        <Group header={t("额度说明")}>
          <Row title={t("计费单位")} value={tf('{0} 额度 / ¥1', quotaPerUnit.toLocaleString())} />
          <Row title={t("余额来源")} value={t("签到、兑换码、邀请奖励")} />
        </Group>
      </ScrollView>
    </Subpage>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
  codeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeText: {
    color: palette.secondaryLabel,
    fontSize: ios ? 17 : 14,
    fontFamily: ios ? 'Menlo' : 'monospace',
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
}));
