import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, Group, Row, Subpage, palette } from '../ui';
import type { RedeemRecord } from '../types';

const inviteLink = 'https://qmszai.cn/register?aff=DEMO493';

export function WalletScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(278.44);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [records, setRecords] = useState<RedeemRecord[]>([]);
  const [notice, setNotice] = useState('');

  const redeem = () => {
    const trimmed = code.trim();
    if (trimmed.length < 8) {
      setError('兑换码至少 8 位，请检查后重试。');
      setNotice('');
      return;
    }
    const amount = 5;
    const record: RedeemRecord = {
      id: `redeem-${Date.now()}`,
      code: trimmed,
      amount,
      time: '刚刚',
      status: 'success',
    };
    setRecords((current) => [record, ...current]);
    setBalance((current) => current + amount);
    setCode('');
    setError('');
    setNotice(`兑换成功，模拟额度 ¥${amount.toFixed(2)} 已加入余额。`);
  };

  const copyInvite = () => {
    Alert.alert('邀请链接', `${inviteLink}\n\n演示模式不会写入剪贴板，请在真实接入后使用系统复制能力。`);
  };

  return (
    <Subpage title="钱包" onBack={onBack}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>当前余额</Text>
          <Text style={styles.heroValue}>¥{balance.toFixed(2)}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>¥22.68</Text>
              <Text style={styles.heroMetaLabel}>历史消耗</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>229</Text>
              <Text style={styles.heroMetaLabel}>请求次数</Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>default</Text>
              <Text style={styles.heroMetaLabel}>用户分组</Text>
            </View>
          </View>
        </View>

        <Group
          header="兑换码充值"
        >
          <View style={styles.redeemBody}>
            <TextInput
              value={code}
              onChangeText={(text) => {
                setCode(text);
                setError('');
              }}
              placeholder="输入兑换码"
              placeholderTextColor={palette.tertiaryLabel}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
            {error ? <Text style={[styles.feedback, { color: palette.red }]}>{error}</Text> : null}
            {notice ? (
              <Text style={[styles.feedback, { color: palette.green }]}>{notice}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: code.trim().length === 0 }}
              disabled={code.trim().length === 0}
              onPress={redeem}
              style={[styles.redeemButton, code.trim().length === 0 ? styles.disabled : null]}
            >
              <Text style={styles.redeemText}>兑换</Text>
            </Pressable>
          </View>
        </Group>

        <Group header="邀请奖励">
          <View style={styles.inviteStats}>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>¥0.00</Text>
              <Text style={styles.inviteLabel}>待使用收益</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>¥0.00</Text>
              <Text style={styles.inviteLabel}>总收益</Text>
            </View>
            <View style={styles.inviteStat}>
              <Text style={styles.inviteValue}>0</Text>
              <Text style={styles.inviteLabel}>邀请人数</Text>
            </View>
          </View>
          <View style={styles.linkBox}>
            <Text style={styles.linkLabel}>邀请链接</Text>
            <Text selectable style={styles.linkText}>
              {inviteLink}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={copyInvite} style={styles.copyRow}>
            <Text style={[styles.copyText, { color: palette.blue }]}>复制邀请链接</Text>
          </Pressable>
        </Group>

        <Group header="奖励说明">
          <View style={styles.noteBody}>
            <Text style={styles.noteText}>
              邀请好友注册，好友充值后您可获得相应奖励。奖励额度需要通过划转功能转入账户余额，邀请的好友越多，奖励越多。
            </Text>
          </View>
        </Group>

        <Group header="兑换记录" footer={records.length === 0 ? '本次运行还没有兑换记录。' : undefined}>
          {records.length === 0 ? (
            <Row title="暂无记录" value="—" />
          ) : (
            records.map((record) => (
              <View key={record.id} style={styles.recordRow}>
                <View style={styles.recordMain}>
                  <Text style={styles.recordCode} numberOfLines={1}>
                    {record.code}
                  </Text>
                  <Text style={styles.recordTime}>{record.time}</Text>
                </View>
                <View style={styles.recordRight}>
                  <Text style={styles.recordAmount}>+¥{record.amount.toFixed(2)}</Text>
                  <Badge text="成功" tone="success" />
                </View>
              </View>
            ))
          )}
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
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 20,
    gap: 4,
    marginTop: 4,
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
  redeemBody: {
    padding: 16,
    gap: 10,
  },
  input: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: palette.fill,
    paddingHorizontal: 12,
    color: palette.label,
    fontSize: 17,
  },
  feedback: {
    fontSize: 13,
    lineHeight: 18,
  },
  redeemButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  redeemText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    padding: 12,
    borderRadius: 10,
    backgroundColor: palette.fill,
    gap: 4,
  },
  linkLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  linkText: {
    color: palette.label,
    fontSize: 13,
  },
  copyRow: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyText: {
    fontSize: 16,
  },
  noteBody: {
    padding: 16,
    gap: 8,
  },
  noteText: {
    color: palette.label,
    fontSize: 14,
    lineHeight: 21,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recordMain: {
    flex: 1,
    gap: 2,
  },
  recordCode: {
    color: palette.label,
    fontSize: 15,
  },
  recordTime: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  recordRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  recordAmount: {
    color: palette.green,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
