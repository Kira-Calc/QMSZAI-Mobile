import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isUnauthorized } from '../api/client';
import {
  createAlipayOrder,
  createWechatOrder,
  fetchAffCode,
  fetchAlipayOrderState,
  fetchTopUpInfo,
  fetchTopUpOrders,
  fetchWechatOrderState,
  redeemTopUpCode,
  transferAffQuota,
} from '../api/endpoints';
import { formatCurrency, formatQuota, formatUnixTime } from '../api/format';
import type { TopUpInfo, TopUpOrder } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { AppIcon } from '../components/AppIcon';
import { PaymentLogo } from '../components/PaymentLogo';
import { PAYMENTS_ENABLED } from '../features';
import { pressedSurface } from '../material';
import { Group, Row, Subpage, palette } from '../ui';
import { themedStyles } from '../theme';
import { t, tf } from '../i18n';

const ios = Platform.OS === 'ios';

const REGISTER_HOST = 'https://test.qmszai.cn';

type PayMethod = 'alipay' | 'wechat';

type PaySession = {
  method: PayMethod;
  tradeNo: string;
  url: string;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
};

const payTitle = (method: PayMethod) => (method === 'wechat' ? t('微信支付') : t('支付宝支付'));

const orderStatusLabel = (status: string) => {
  if (status === 'success' || status === 'completed') return t('已支付');
  if (status === 'failed' || status === 'expired') return t('已失败');
  return t('待支付');
};

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

  // ---------- 充值 ----------

  const [info, setInfo] = useState<TopUpInfo | null>(null);
  const [orders, setOrders] = useState<TopUpOrder[] | null>(null);
  const [amount, setAmount] = useState('1');
  const [code, setCode] = useState('');
  const [pay, setPay] = useState<PaySession | null>(null);
  const [busy, setBusy] = useState(false);
  const amountRef = useRef<TextInputInstance>(null);

  const loadOrders = useCallback(async () => {
    try {
      const page = await fetchTopUpOrders(1, 5);
      setOrders(page.items ?? []);
    } catch (error) {
      if (isUnauthorized(error)) return;
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    // 支付功能关闭时完全不请求充值配置与订单，避免留下支付入口或多余的网络请求。
    if (!PAYMENTS_ENABLED) return;
    let active = true;
    fetchTopUpInfo()
      .then((data) => {
        if (!active) return;
        setInfo(data);
        // 默认填最低可充值金额，避免一进来就是不合法的数字。
        setAmount(String(Math.max(1, Math.floor(data.min_topup || 1))));
      })
      .catch((error) => {
        if (!active || isUnauthorized(error)) return;
        setInfo(null);
      });
    loadOrders();
    return () => {
      active = false;
    };
  }, [loadOrders]);

  const minTopup = Math.max(1, Math.floor(info?.min_topup ?? 1));
  const unitPrice = info?.payment_unit_price || 1;
  const amountValue = Math.floor(Number(amount));
  const amountValid = Number.isFinite(amountValue) && amountValue >= minTopup;
  const discountRate = info?.discount?.[String(amountValue)] ?? 1;
  const actualAmount = amountValid ? amountValue * unitPrice * discountRate : 0;

  const alipayEnabled = Boolean(info?.enable_alipay_topup);
  const wechatEnabled = Boolean(info?.enable_wechat_topup);

  const openPayApp = (url: string) => {
    // 手机上直接把收银台交给对方 App；没装对应 App 时提示改走复制链接。
    Linking.openURL(url).catch(() => {
      Alert.alert(t('无法打开支付应用'), t('请复制支付链接后在对应 App 中打开'));
    });
  };

  const startPayment = async (method: PayMethod) => {
    if (!PAYMENTS_ENABLED || busy) return;
    if (!amountValid) {
      Alert.alert(tf('充值数量不能小于 {0}', String(minTopup)));
      return;
    }
    setBusy(true);
    try {
      const order =
        method === 'alipay'
          ? await createAlipayOrder(amountValue)
          : await createWechatOrder(amountValue);
      setPay({
        method,
        tradeNo: order.trade_no,
        url: order.qr_code,
        amount: amountValue,
        status: 'pending',
      });
      // 下单即刷新记录，关掉弹窗就能看到这笔「待支付」。
      loadOrders();
      openPayApp(order.qr_code);
    } catch (error) {
      if (isUnauthorized(error)) return;
      Alert.alert(t('支付请求失败'), error instanceof Error ? error.message : t('请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  // 支付弹窗打开期间轮询订单状态：对方 App 里付完，回到这里余额会自动刷新。
  useEffect(() => {
    if (!pay || pay.status !== 'pending') return;
    let alive = true;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      const check = pay.method === 'alipay' ? fetchAlipayOrderState : fetchWechatOrderState;
      check(pay.tradeNo)
        .then(async (state) => {
          if (!alive) return;
          if (state?.status === 'success' || state?.status === 'completed') {
            setPay((current) => (current ? { ...current, status: 'success' } : current));
            await refreshUser();
            loadOrders();
            return;
          }
          if (state?.status === 'failed' || state?.status === 'expired') {
            setPay((current) => (current ? { ...current, status: 'failed' } : current));
          }
        })
        .catch(() => {
          // 轮询失败不打断用户，下一轮再试。
        });
      // 五分钟还没付就停，避免一直挂着请求。
      if (ticks >= 100) {
        setPay((current) => (current ? { ...current, status: 'timeout' } : current));
      }
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pay?.method, pay?.status, pay?.tradeNo, refreshUser, loadOrders]);

  const redeem = async () => {
    const key = code.trim();
    if (!key) {
      Alert.alert(t('请输入兑换码'));
      return;
    }
    setBusy(true);
    try {
      const quota = await redeemTopUpCode(key);
      setCode('');
      await refreshUser();
      loadOrders();
      Alert.alert(tf('兑换成功，获得 {0}', formatQuota(Number(quota) || 0, quotaPerUnit)));
    } catch (error) {
      if (isUnauthorized(error)) return;
      Alert.alert(t('兑换失败'), error instanceof Error ? error.message : t('请稍后重试'));
    } finally {
      setBusy(false);
    }
  };

  const transfer = () => {
    const quota = user?.aff_quota ?? 0;
    if (quota <= 0) return;
    Alert.alert(
      t('划转到余额？'),
      tf('将 {0} 邀请奖励转入账户余额。', formatQuota(quota, quotaPerUnit)),
      [
        { text: t('取消'), style: 'cancel' },
        {
          text: t('划转'),
          onPress: async () => {
            try {
              await transferAffQuota(quota);
              await refreshUser();
              Alert.alert(t('已划转到余额'));
            } catch (error) {
              if (isUnauthorized(error)) return;
              Alert.alert(t('操作失败'), error instanceof Error ? error.message : t('请稍后重试'));
            }
          },
        },
      ],
    );
  };

  const payStatusText = (session: PaySession) => {
    if (session.status === 'success') return t('支付成功，余额已更新');
    if (session.status === 'failed') return t('支付未完成');
    if (session.status === 'timeout') return t('等待超时，可稍后在充值记录中查看');
    return t('等待支付');
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

        {PAYMENTS_ENABLED ? (
          <Group header={t("账户充值")}>
            <Row
              title={t('充值数量')}
              subtitle={tf('最低 {0}', String(minTopup))}
              onPress={() => amountRef.current?.focus()}
              accessory={
                <TextInput
                  ref={amountRef}
                  value={amount}
                  onChangeText={(next) => setAmount(next.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder={String(minTopup)}
                  placeholderTextColor={palette.placeholder}
                  accessibilityLabel={tf('充值金额，最低 {0}', String(minTopup))}
                  style={styles.amountInput}
                />
              }
            />
            <Row
              title={t('实付金额')}
              value={formatCurrency(actualAmount)}
            />
            {(info?.amount_options?.length ?? 0) > 0 ? (
              <View style={styles.amountChips}>
                {(info?.amount_options ?? []).map((option) => {
                  const active = amountValue === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={formatCurrency(option, 0)}
                      onPress={() => setAmount(String(option))}
                      style={({ pressed }) => [
                        styles.amountChip,
                        active ? styles.amountChipActive : null,
                        pressed ? pressedSurface : null,
                      ]}
                    >
                      <Text style={[styles.amountChipText, active ? styles.amountChipTextActive : null]}>
                        {formatCurrency(option, 0)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {alipayEnabled ? (
              <Row
                title={t('支付宝支付')}
                leading={<PaymentLogo brand="alipay" />}
                chevron
                onPress={() => startPayment('alipay')}
              />
            ) : null}
            {wechatEnabled ? (
              <Row
                title={t('微信支付')}
                leading={<PaymentLogo brand="wechat" />}
                chevron
                onPress={() => startPayment('wechat')}
              />
            ) : null}
          </Group>
        ) : null}

        <Group header={t("兑换码充值")}>
          <Row
            title={t('兑换码')}
            accessory={
              <TextInput
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={t('请输入兑换码')}
                placeholderTextColor={palette.placeholder}
                accessibilityLabel={t('输入兑换码')}
                style={styles.codeInput}
                returnKeyType="done"
                onSubmitEditing={redeem}
              />
            }
          />
          <Row title={t('兑换额度')} onPress={redeem} chevron />
        </Group>

        {PAYMENTS_ENABLED ? (
          <Group header={t("充值记录")}>
            {orders === null ? (
              <View style={styles.ordersLoading}>
                <ActivityIndicator size="small" color={palette.blue} />
              </View>
            ) : null}
            {orders !== null && orders.length === 0 ? (
              <Row title={t('暂无充值记录')} />
            ) : null}
            {(orders ?? []).map((order) => (
              <Row
                key={order.id}
                title={formatCurrency(order.money)}
                subtitle={tf('{0} · {1}', order.payment_method === 'wechat' ? t('微信') : t('支付宝'), formatUnixTime(order.create_time))}
                leading={
                  <PaymentLogo
                    brand={order.payment_method === 'wechat' ? 'wechat' : 'alipay'}
                    size={22}
                  />
                }
                value={orderStatusLabel(order.status)}
              />
            ))}
          </Group>
        ) : null}

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
          {(user?.aff_quota ?? 0) > 0 ? (
            <Row
              title={t('划转到余额')}
              chevron
              onPress={transfer}
              value={formatQuota(user?.aff_quota ?? 0, quotaPerUnit)}
            />
          ) : null}
        </Group>

        <Group header={t("额度说明")}>
          <Row title={t("计费单位")} value={tf('{0} 额度 / ¥1', quotaPerUnit.toLocaleString())} />
          <Row title={t("余额来源")} value={t("签到、兑换码、邀请奖励")} />
        </Group>
      </ScrollView>

      {PAYMENTS_ENABLED ? (
        <Modal visible={pay !== null} transparent animationType="fade" onRequestClose={() => setPay(null)}>
          <View style={styles.payRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('关闭支付')}
              onPress={() => setPay(null)}
              style={StyleSheet.absoluteFill}
            />
            {pay ? (
              <View style={styles.payCard}>
                <View style={styles.payTitleRow}>
                  <PaymentLogo brand={pay.method} size={22} />
                  <Text style={styles.payTitle}>{payTitle(pay.method)}</Text>
                </View>
                <Text style={styles.payAmount}>{formatCurrency(pay.amount)}</Text>
                <View style={styles.payStatusRow}>
                  {pay.status === 'pending' ? (
                    <ActivityIndicator size="small" color={palette.secondaryLabel} />
                  ) : null}
                  <Text style={styles.payStatus}>{payStatusText(pay)}</Text>
                </View>
                <Text style={styles.payTrade}>{tf('订单号 {0}', pay.tradeNo)}</Text>
                {pay.status === 'pending' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openPayApp(pay.url)}
                    style={({ pressed }) => [styles.payPrimary, pressed ? pressedSurface : null]}
                  >
                    <Text style={styles.payPrimaryText}>
                      {pay.method === 'wechat' ? t('打开微信') : t('打开支付宝')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={async () => {
                    await Clipboard.setStringAsync(pay.url);
                    Alert.alert(t('已复制支付链接'));
                  }}
                  style={({ pressed }) => [styles.paySecondary, pressed ? pressedSurface : null]}
                >
                  <Text style={styles.paySecondaryText}>{t('复制支付链接')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPay(null)}
                  style={({ pressed }) => [styles.payClose, pressed ? pressedSurface : null]}
                >
                  <Text style={styles.payCloseText}>{t('关闭')}</Text>
                </Pressable>
                {busy ? <ActivityIndicator size="small" color={palette.blue} /> : null}
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
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
  amountInput: {
    minWidth: 96,
    textAlign: 'right',
    color: palette.label,
    fontSize: ios ? 17 : 16,
    fontVariant: ['tabular-nums'],
    paddingVertical: ios ? 6 : 8,
  },
  amountChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amountChip: {
    minWidth: 64,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: ios ? 10 : 18,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountChipActive: {
    backgroundColor: palette.tintBlue,
    borderColor: 'transparent',
  },
  amountChipText: {
    color: palette.label,
    fontSize: ios ? 15 : 14,
    fontVariant: ['tabular-nums'],
  },
  amountChipTextActive: {
    color: palette.blue,
    fontWeight: '600',
  },
  codeInput: {
    minWidth: 160,
    textAlign: 'right',
    color: palette.label,
    fontSize: ios ? 17 : 16,
    paddingVertical: 0,
  },
  ordersLoading: {
    paddingVertical: 18,
    alignItems: 'center',
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
  payRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.overlay,
    paddingHorizontal: 28,
  },
  payCard: {
    width: '100%',
    maxWidth: 330,
    borderRadius: ios ? 20 : 24,
    borderCurve: 'continuous',
    backgroundColor: palette.card,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 8,
  },
  payTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payTitle: {
    color: palette.label,
    fontSize: 17,
    fontWeight: '600',
  },
  payAmount: {
    color: palette.label,
    fontSize: 34,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  payStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  payStatus: {
    color: palette.secondaryLabel,
    fontSize: 14,
    textAlign: 'center',
  },
  payTrade: {
    color: palette.subtleLabel,
    fontSize: 12,
    fontFamily: ios ? 'Menlo' : 'monospace',
    textAlign: 'center',
  },
  payPrimary: {
    width: '100%',
    minHeight: 46,
    marginTop: 8,
    borderRadius: ios ? 12 : 23,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payPrimaryText: {
    color: palette.onAccent,
    fontSize: 17,
    fontWeight: '600',
  },
  paySecondary: {
    width: '100%',
    minHeight: 44,
    borderRadius: ios ? 12 : 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paySecondaryText: {
    color: palette.blue,
    fontSize: 16,
  },
  payClose: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payCloseText: {
    color: palette.secondaryLabel,
    fontSize: 16,
  },
}));
