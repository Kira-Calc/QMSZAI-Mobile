import { BlurView, BlurTargetView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import { SymbolView } from 'expo-symbols';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { AppIcon } from './src/components/AppIcon';
import { cardSurface, elevation, m3, pressedSurface, ripple, shape, type as typeScale } from './src/material';
import { ChatWorkspace } from './src/ChatWorkspace';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useMemo, useRef, useState, type ComponentProps, type ComponentRef, type ComponentType, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { formatQuota, formatQuotaSmart } from './src/api/format';
import { usageRangeOptions } from './src/data/mockConsole';
import { ModelLogo } from './src/components/ModelLogo';
import { UserAvatar } from './src/components/UserAvatar';
import { LiquidTabBar } from './src/LiquidTabBar';
import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import {
  createToken,
  deleteToken as removeToken,
  fetchTokenKey,
  fetchUserGroups,
  fetchUserModels,
  setTokenStatus,
  updateToken,
} from './src/api/endpoints';
import { LoginScreen } from './src/screens/LoginScreen';
import { useConsoleData } from './src/services/useConsoleData';
import { useKeyboardInsets } from './src/useKeyboardInsets';
import {
  AlphabetRail,
  GlassIconButton,
  GlassPillButton,
  Group,
  Row,
  Segmented,
  SheetHeader,
  animateContentChange,
  palette,
} from './src/ui';
import { alphabetOf, letterOf, sortByName } from './src/modelSort';
import { initTheme, isDark, themedStyles, useScheme } from './src/theme';
import { initLanguage, useLanguage } from './src/i18n';
import { bindMediaGenerationAccount, initMediaGenerations } from './src/mediaGenerations';
import { resumePendingMediaTasks } from './src/services/mediaTasks';
import { FusionScreen } from './src/screens/FusionScreen';
import { MediaStudioScreen } from './src/screens/MediaStudioScreen';
import { MessagesScreen } from './src/screens/MessagesScreen';
import { ModelExperienceScreen } from './src/screens/ModelExperienceScreen';
import { ModelMarketplaceScreen } from './src/screens/ModelMarketplaceScreen';
import { PersonalScreen } from './src/screens/PersonalScreen';
import { TasksScreen } from './src/screens/TasksScreen';
import { UsageLogsScreen } from './src/screens/UsageLogsScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import type {
  AccountSummary,
  Model,
  ModelStatus,
  NewTokenDraft,
  OverviewMetrics,
  TabKey,
  Token,
  TokenStatus,
  UsageRange,
} from './src/types';
import { t, tf } from './src/i18n';

type SubpageKey =
  | 'logs'
  | 'tasks'
  | 'messages'
  | 'media'
  | 'experience'
  | 'fusion'
  | 'pricing'
  | 'personal'
  | 'wallet';

type TabScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

const statusLabel = (status: ModelStatus) => {
  if (status === 'stable') return t('可用');
  if (status === 'watch') return t('观察');
  return t('限流');
};

const tokenStatusLabel = (status: TokenStatus) => {
  if (status === 'active') return t('启用');
  if (status === 'paused') return t('暂停');
  return t('过期');
};

const ios = Platform.OS === 'ios';

// masked-view 的旧声明依赖已移除的 NativeMethods，限定为它实际支持的 props。
const MaskedView = NativeMaskedView as unknown as ComponentType<ViewProps & {
  maskElement: ReactElement;
}>;

// 状态色随主题变化：读取时再取 palette，避免模块加载时把浅色固化。
const statusColor: Record<ModelStatus | TokenStatus, string> = {
  get stable() {
    return palette.successText;
  },
  get watch() {
    return palette.warningText;
  },
  get limited() {
    return palette.destructive;
  },
  get active() {
    return palette.successText;
  },
  get paused() {
    return palette.warningText;
  },
  get expired() {
    return palette.destructive;
  },
};

export default function App() {
  // 订阅全局主题与语言：切换时 App 重渲染，整棵界面同步换成新文案/颜色。
  useScheme();
  useLanguage();
  useEffect(() => {
    initTheme();
    initLanguage();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { status } = useAuth();
  if (status === 'restoring') return <BootScreen />;
  if (status === 'signedOut') return <LoginScreen />;
  return <AppShell />;
}

function BootScreen() {
  return (
    <View style={styles.bootScreen}>
      <StatusBar style={isDark() ? 'light' : 'dark'} />
      <ActivityIndicator color={palette.blue} />
    </View>
  );
}

function AppShell() {
  const { user, quotaPerUnit } = useAuth();
  const consoleData = useConsoleData();
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [query, setQuery] = useState('');
  const [usageRange, setUsageRange] = useState<UsageRange>('24h');
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [readMessageIds, setReadMessageIds] = useState<string[]>([]);
  const [deletedMessageIds, setDeletedMessageIds] = useState<string[]>([]);
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [tokenFormVisible, setTokenFormVisible] = useState(false);
  const [tokenFormSession, setTokenFormSession] = useState(0);
  const [subpage, setSubpage] = useState<SubpageKey | null>(null);
  const [tabBarMinimized, setTabBarMinimized] = useState(false);
  const lastTabScrollY = useRef(0);

  // Android 上 LayoutAnimation 需要显式开启（iOS 默认可用）。
  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  // AI 创作记录属于当前账号：登录后加载本机记录，并把没跑完的任务接上。
  // 回到前台再扫一次，防止系统在后台挂起定时器后任务停在「生成中」。
  const mediaUserId = user?.id;
  useEffect(() => {
    if (mediaUserId === undefined) return undefined;
    void initMediaGenerations()
      .then(() => bindMediaGenerationAccount(mediaUserId))
      .then(() => resumePendingMediaTasks())
      .catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') resumePendingMediaTasks();
    });
    return () => subscription.remove();
  }, [mediaUserId]);

  const tabTransition = useRef(new Animated.Value(1)).current;
  const titleTransition = useRef(new Animated.Value(1)).current;
  const subpageAnim = useRef(new Animated.Value(0)).current;
  const subpageRenderedRef = useRef<SubpageKey | null>(null);
  const [subpageRendered, setSubpageRendered] = useState<SubpageKey | null>(null);
  const { width: windowWidth } = useWindowDimensions();

  // 主标签切换：内容轻微淡入并上移，标题同步淡入。
  useEffect(() => {
    tabTransition.setValue(0);
    titleTransition.setValue(0);
    Animated.parallel([
      Animated.timing(tabTransition, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(titleTransition, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeTab, tabTransition, titleTransition]);

  // 子页：右侧推入/推出，主界面同步做视差位移。
  useEffect(() => {
    if (subpage) {
      // 日志/任务每次进入都拉一次，避免看到启动时的旧数据。
      if (subpage === 'logs') consoleData.refreshLogs();
      if (subpage === 'tasks') consoleData.refreshTasks();
      const opening = subpageRenderedRef.current === null;
      subpageRenderedRef.current = subpage;
      setSubpageRendered(subpage);
      if (opening) {
        subpageAnim.setValue(0);
        Animated.timing(subpageAnim, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
    } else if (subpageRenderedRef.current) {
      subpageRenderedRef.current = null;
      Animated.timing(subpageAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setSubpageRendered(null);
      });
    }
  }, [subpage, subpageAnim, consoleData.refreshLogs, consoleData.refreshTasks]);

  // 收起/展开的动画在 LiquidTabBar 内用 Animated 驱动（尺寸 + 内容交叉淡化），
  // 这里只切状态，避免再叠一层 LayoutAnimation 造成重复/瞬切。
  const setTabBarMinimizedAnimated = useCallback((minimized: boolean) => {
    setTabBarMinimized(minimized);
  }, []);

  const handleTabScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = Math.max(0, event.nativeEvent.contentOffset.y);
      const delta = offsetY - lastTabScrollY.current;
      lastTabScrollY.current = offsetY;

      if (offsetY <= 12) {
        if (tabBarMinimized) setTabBarMinimizedAnimated(false);
        return;
      }
      if (delta > 8 && offsetY > 48) {
        if (!tabBarMinimized) setTabBarMinimizedAnimated(true);
      } else if (delta < -8) {
        if (tabBarMinimized) setTabBarMinimizedAnimated(false);
      }
    },
    [setTabBarMinimizedAnimated, tabBarMinimized],
  );

  useEffect(() => {
    lastTabScrollY.current = 0;
    setTabBarMinimized(false);
  }, [activeTab]);

  // 令牌页每次进入都重新拉取：网页端新建/删除的令牌不用重启 App 才同步。
  useEffect(() => {
    if (activeTab === 'tokens') consoleData.refreshTokens();
  }, [activeTab, consoleData.refreshTokens]);

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = sortByName(consoleData.models);
    if (!q) {
      return sorted;
    }
    return sorted.filter((model) => {
      return [model.name, model.vendor, model.context, model.route, ...model.tags]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [consoleData.models, query]);

  const activeTokens = consoleData.tokens.filter((token) => token.status === 'active').length;
  const metrics = consoleData.metricsByRange[usageRange];
  const availableModels = `${consoleData.models.length}`;
  // 进度条表示区间消耗占「已消耗 + 账户余额」的比例。
  const usagePercent = Math.max(
    0,
    Math.min(100, Math.round((metrics.totalUsage / Math.max(metrics.totalUsage + (user?.quota ?? 0), 1)) * 100)),
  );
  const spentLabel = formatQuotaSmart(metrics.totalUsage, quotaPerUnit);

  const messages = useMemo(
    () =>
      consoleData.messages
        .filter((message) => !deletedMessageIds.includes(message.id))
        .map((message) => ({
          ...message,
          read: message.read || readMessageIds.includes(message.id),
        })),
    [consoleData.messages, deletedMessageIds, readMessageIds],
  );

  const tasks = consoleData.tasks;

  const unreadMessages = messages.filter((message) => !message.read).length;

  // 聊天 / 模型体验 / 模型融合只展示可对话的模型，避免选到图像、音乐、语音等按次模型。
  const chatModelIds = useMemo(
    () =>
      consoleData.marketModels
        .filter((model) => model.category === 'chat' && !/asr|whisper|embed|rerank|moderation/i.test(model.id))
        .map((model) => model.id),
    [consoleData.marketModels],
  );

  // 价格表还没到时先沿用完整列表，避免聊天页短暂没有可选模型。
  const chatModels = useMemo(() => {
    if (!chatModelIds.length) return consoleData.models;
    const allowed = new Set(chatModelIds);
    return consoleData.models.filter((model) => allowed.has(model.id));
  }, [consoleData.models, chatModelIds]);

  const sceneStyle = {
    opacity: tabTransition,
    transform: [
      {
        translateY: tabTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
  const titleStyle = {
    opacity: titleTransition,
    transform: [
      {
        translateY: titleTransition.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
    ],
  };
  const mainStyle = {
    transform: [
      {
        translateX: subpageAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -Math.round(windowWidth * 0.3)],
        }),
      },
    ],
  };
  const dimStyle = {
    opacity: subpageAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.08] }),
  };
  const overlayStyle = {
    transform: [
      {
        translateX: subpageAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [windowWidth, 0],
        }),
      },
    ],
  };

  const toggleToken = async (id: string) => {
    const current = consoleData.tokens.find((token) => token.id === id);
    if (!current || current.status === 'expired') return;
    const nextStatus = current.status === 'active' ? 2 : 1;
    try {
      await setTokenStatus(Number(id), nextStatus);
      await consoleData.refreshTokens();
    } catch (error) {
      Alert.alert(t('操作失败'), error instanceof Error ? error.message : t('请稍后重试'));
    }
  };

  const openCreateToken = () => {
    setEditingToken(null);
    setTokenFormSession((session) => session + 1);
    setTokenFormVisible(true);
  };

  const openEditToken = (token: Token) => {
    setSelectedToken(null);
    setEditingToken(token);
    setTokenFormSession((session) => session + 1);
    setTokenFormVisible(true);
  };

  const submitToken = async (draft: NewTokenDraft) => {
    setTokenFormVisible(false);
    // 与网页端一致：无限额度时金额与原生额度都写 0；否则同时下发金额与换算后的额度。
    const unlimited = draft.unlimited ?? draft.quota <= 0;
    const remainAmount = unlimited ? 0 : Math.max(0, draft.quota);
    const remainQuota = unlimited ? 0 : Math.max(0, Math.round(remainAmount * quotaPerUnit));
    // 分组优先级与网页端一致：group 取首个分组，routing_group_order 存完整有序列表。
    const routingGroups = draft.routingGroups ?? [];
    const routingOrder = routingGroups.length > 0 ? JSON.stringify(routingGroups) : '';
    const modelLimits = draft.modelLimits ?? [];
    const access = {
      remain_amount: remainAmount,
      unlimited_quota: unlimited,
      model_limits_enabled: modelLimits.length > 0,
      model_limits: modelLimits.join(','),
      allow_ips: draft.allowIps ?? '',
    };
    try {
      if (editingToken) {
        await updateToken(Number(editingToken.id), {
          name: draft.name,
          remain_quota: remainQuota,
          ...access,
          expired_time: editingToken.expiredTime ?? -1,
          group: routingGroups[0] || draft.group || editingToken.group || '',
          routing_group_order: routingOrder,
        });
      } else {
        await createToken({
          name: draft.name,
          remain_quota: remainQuota,
          ...access,
          expired_time: -1,
          group: routingGroups[0] || draft.group || undefined,
          routing_group_order: routingOrder || undefined,
        });
      }
      setEditingToken(null);
      await consoleData.refreshTokens();
    } catch (error) {
      Alert.alert(t('保存失败'), error instanceof Error ? error.message : t('请稍后重试'));
    }
  };

  const deleteToken = (token: Token) => {
    Alert.alert(t('删除令牌？'), tf('“{0}”删除后无法恢复，使用该令牌的请求会被拒绝。', token.name), [
      { text: t('取消'), style: 'cancel' },
      {
        text: t('删除'),
        style: 'destructive',
        onPress: async () => {
          setSelectedToken(null);
          try {
            await removeToken(Number(token.id));
            await consoleData.refreshTokens();
          } catch (error) {
            Alert.alert(t('删除失败'), error instanceof Error ? error.message : t('请稍后重试'));
          }
        },
      },
    ]);
  };

  const copyTokenKey = async (token: Token) => {
    try {
      const { key } = await fetchTokenKey(Number(token.id));
      if (!key) throw new Error(t('无法读取密钥'));
      // 服务端返回的 key 不带 sk- 前缀，网页端展示时也会补上。
      await Clipboard.setStringAsync(key.startsWith('sk-') ? key : `sk-${key}`);
      Alert.alert(t('已复制密钥'));
    } catch (error) {
      Alert.alert(t('复制失败'), error instanceof Error ? error.message : t('请稍后重试'));
    }
  };

  const readMessage = (id: string) => {
    setReadMessageIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const readAllMessages = () => {
    setReadMessageIds(messages.map((message) => message.id));
  };

  const deleteMessage = (id: string) => {
    setDeletedMessageIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const currentTitle =
    activeTab === 'overview'
      ? t('概览')
      : activeTab === 'models'
        ? t('模型目录')
        : activeTab === 'tokens'
          ? t('令牌管理')
          : t('账户中心');

  const subpageView = subpageRendered ? (
    <Animated.View style={[styles.subpageOverlay, styles.subpageShadow, overlayStyle]}>
      <SafeAreaView style={styles.subpagePane} edges={['top', 'left', 'right']}>
        <StatusBar style={isDark() ? 'light' : 'dark'} />
        {subpageRendered === 'logs' ? (
          <UsageLogsScreen logs={consoleData.logs} onBack={() => setSubpage(null)} />
        ) : null}
        {subpageRendered === 'tasks' ? (
          <TasksScreen tasks={tasks} onBack={() => setSubpage(null)} />
        ) : null}
        {subpageRendered === 'messages' ? (
          <MessagesScreen
            messages={messages}
            onBack={() => setSubpage(null)}
            onRead={readMessage}
            onReadAll={readAllMessages}
            onDelete={deleteMessage}
          />
        ) : null}
        {subpageRendered === 'media' ? (
          <MediaStudioScreen
            onBack={() => setSubpage(null)}
            models={consoleData.models}
            pricing={consoleData.pricing}
            group={user?.group}
          />
        ) : null}
        {subpageRendered === 'experience' ? (
          <ModelExperienceScreen
            onBack={() => setSubpage(null)}
            models={chatModelIds}
          />
        ) : null}
        {subpageRendered === 'fusion' ? (
          <FusionScreen
            onBack={() => setSubpage(null)}
            models={chatModelIds}
          />
        ) : null}
        {subpageRendered === 'pricing' ? (
          <ModelMarketplaceScreen
            onBack={() => setSubpage(null)}
            models={consoleData.marketModels}
          />
        ) : null}
        {subpageRendered === 'personal' ? <PersonalScreen onBack={() => setSubpage(null)} /> : null}
        {subpageRendered === 'wallet' ? <WalletScreen onBack={() => setSubpage(null)} /> : null}
      </SafeAreaView>
    </Animated.View>
  ) : null;

  return (
    <SafeAreaProvider>
      <Animated.View style={[styles.safeArea, mainStyle]} pointerEvents={subpage ? 'none' : 'auto'}>
        <SafeAreaView style={styles.safeAreaContent} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar style={isDark() ? 'light' : 'dark'} />
        <View style={styles.appShell}>
        <View style={styles.header}>
          <Animated.Text style={[styles.title, titleStyle]}>{activeTab === 'chat' ? t('聊天') : currentTitle}</Animated.Text>
          {activeTab === 'account' ? (
            <Animated.View style={[styles.headerAction, titleStyle]}>
              <GlassIconButton
                icon="bell"
                label={t('消息')}
                onPress={() => setSubpage('messages')}
                size={36}
              />
              {unreadMessages > 0 ? (
                <View style={styles.headerBadge} pointerEvents="none">
                  <Text style={styles.headerBadgeText}>
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        <Animated.View style={[styles.content, sceneStyle]}>
          <View style={{ flex: 1, display: activeTab === 'chat' ? 'flex' : 'none' }}>
            <ChatWorkspace
              bottomInset={76}
              onOpenTool={setSubpage}
              models={chatModels}
              active={activeTab === 'chat'}
            />
          </View>
          {activeTab === 'overview' ? (
            <Overview
              activeTokens={activeTokens}
              metrics={metrics}
              availableModels={availableModels}
              usagePercent={usagePercent}
              spent={spentLabel}
              balance={consoleData.account?.balance ?? '¥0.00'}
              usageRange={usageRange}
              onRangeChange={setUsageRange}
              onScroll={handleTabScroll}
              onOpenModels={() => setActiveTab('models')}
              onOpenTokens={() => setActiveTab('tokens')}
              onOpenLogs={() => setSubpage('logs')}
              onOpenTasks={() => setSubpage('tasks')}
              onOpenMedia={() => setSubpage('media')}
              onOpenExperience={() => setSubpage('experience')}
              onOpenFusion={() => setSubpage('fusion')}
              onOpenPricing={() => setSubpage('pricing')}
            />
          ) : null}

          {activeTab === 'models' ? (
            <ModelsView
              query={query}
              setQuery={setQuery}
              filteredModels={filteredModels}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              onScroll={handleTabScroll}
            />
          ) : null}

          {activeTab === 'tokens' ? (
            <TokensView
              tokens={consoleData.tokens}
              onOpen={setSelectedToken}
              onToggle={toggleToken}
              onCreate={openCreateToken}
              onScroll={handleTabScroll}
            />
          ) : null}

          {activeTab === 'account' ? (
            <AccountView
              account={consoleData.account}
              onOpenPersonal={() => setSubpage('personal')}
              onOpenWallet={() => setSubpage('wallet')}
              onScroll={handleTabScroll}
            />
          ) : null}
        </Animated.View>
        </View>

        <TokenModal
          token={selectedToken}
          quotaPerUnit={quotaPerUnit}
          onClose={() => setSelectedToken(null)}
          onCopyKey={copyTokenKey}
          onEdit={openEditToken}
          onDelete={deleteToken}
        />
        <TokenFormModal
          key={`${editingToken?.id ?? 'new'}-${tokenFormSession}`}
          visible={tokenFormVisible}
          initial={editingToken}
          quotaPerUnit={quotaPerUnit}
          onCancel={() => {
            setTokenFormVisible(false);
            setEditingToken(null);
          }}
          onSubmit={submitToken}
        />
        </SafeAreaView>
        <LiquidTabBar
          activeKey={activeTab}
          minimized={tabBarMinimized}
          onChange={setActiveTab}
          onMinimizedChange={setTabBarMinimizedAnimated}
        />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dimLayer, dimStyle]} />
      </Animated.View>
      {subpageView}
    </SafeAreaProvider>
  );
}

function Overview({
  activeTokens,
  metrics,
  availableModels,
  usagePercent,
  spent,
  balance,
  usageRange,
  onRangeChange,
  onScroll,
  onOpenModels,
  onOpenTokens,
  onOpenLogs,
  onOpenTasks,
  onOpenMedia,
  onOpenExperience,
  onOpenFusion,
  onOpenPricing,
}: {
  activeTokens: number;
  metrics: OverviewMetrics;
  availableModels: string;
  usagePercent: number;
  spent: string;
  balance: string;
  usageRange: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  onScroll: TabScrollHandler;
  onOpenModels: () => void;
  onOpenTokens: () => void;
  onOpenLogs: () => void;
  onOpenTasks: () => void;
  onOpenMedia: () => void;
  onOpenExperience: () => void;
  onOpenFusion: () => void;
  onOpenPricing: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}

      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {ios ? (
        <>
        <Segmented
          values={usageRangeOptions.map((option) => option.label)}
          selectedIndex={usageRangeOptions.findIndex((option) => option.key === usageRange)}
          onChange={(index) => {
            animateContentChange();
            onRangeChange(usageRangeOptions[index].key);
          }}
        />
        <View style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.panelLabel}>{t('请求次数')}</Text>
              <Text style={styles.heroMetric}>{metrics.requests}</Text>
            </View>
            <Text style={styles.mutedText}>{t('成功率')} {metrics.reliability}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${usagePercent}%` }]} />
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.mutedText}>{spent} {t('已使用')}</Text>
            <Text style={styles.mutedText}>{balance} {t('余额')}</Text>
          </View>
        </View>

        <View style={styles.gridTwo}>
          <StatBlock label={t("可用模型")} value={availableModels} tone="blue" />
          <StatBlock label={t("启用令牌")} value={`${activeTokens}`} tone="green" />
          <StatBlock label={t("平均延迟")} value={metrics.averageLatency} tone="amber" />
          <StatBlock label={t("异常队列")} value={`${metrics.issueCount}`} tone="rose" />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('快捷访问')}</Text>
        </View>
        <View style={styles.actionList}>
          <QuickAction
            symbol="square.stack.3d.up"
            icon="▦"
            title={t("模型目录")}
            onPress={onOpenModels}
          />
          <QuickAction
            symbol="key"
            icon="◇"
            title={t("API 令牌")}
            onPress={onOpenTokens}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('AI 功能')}</Text>
        </View>
        <View style={styles.actionList}>
          <QuickAction
            symbol="sparkles"
            icon="✦"
            title={t("AI 创作")}
            onPress={onOpenMedia}
          />
          <QuickAction
            symbol="text.bubble"
            icon="◇"
            title={t("模型体验")}
            onPress={onOpenExperience}
          />
          <QuickAction
            symbol="arrow.triangle.merge"
            icon="◈"
            title={t("模型融合")}
            onPress={onOpenFusion}
          />
          <QuickAction
            symbol="square.grid.2x2"
            icon="▦"
            title={t("模型广场")}
            onPress={onOpenPricing}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('用量与任务')}</Text>
        </View>
        <View style={styles.actionList}>
          <QuickAction
            symbol="doc.text.magnifyingglass"
            icon="▤"
            title={t("用量日志")}
            onPress={onOpenLogs}
          />
          <QuickAction
            symbol="square.stack.3d.up"
            icon="◫"
            title={t("任务")}
            onPress={onOpenTasks}
          />
        </View>
        </>
      ) : (
        <>
          <Segmented
            values={usageRangeOptions.map((option) => option.label)}
            selectedIndex={usageRangeOptions.findIndex((option) => option.key === usageRange)}
            onChange={(index) => {
              animateContentChange();
              onRangeChange(usageRangeOptions[index].key);
            }}
          />

          <View style={styles.heroCard}>
            <View style={styles.heroCardTop}>
              <View style={styles.heroCardMain}>
                <Text style={styles.heroCardLabel}>{t('请求次数')}</Text>
                <Text style={styles.heroCardValue}>{metrics.requests}</Text>
              </View>
              <View style={styles.heroCardAside}>
                <Text style={styles.heroCardAsideLabel}>{t('成功率')}</Text>
                <Text style={styles.heroCardAsideValue}>{metrics.reliability}</Text>
              </View>
            </View>
            <View style={styles.heroCardTrack}>
              <View style={[styles.heroCardFill, { width: `${usagePercent}%` }]} />
            </View>
            <View style={styles.heroCardMetaRow}>
              <Text style={styles.heroCardMeta}>{spent} {t('已使用')}</Text>
              <Text style={styles.heroCardMeta}>{balance} {t('余额')}</Text>
            </View>
          </View>

          <Group style={styles.overviewGroup}>
            <Row title={t("可用模型")} accessory={<Text style={styles.overviewStatValue}>{availableModels}</Text>} />
            <Row title={t("启用令牌")} accessory={<Text style={styles.overviewStatValue}>{activeTokens}</Text>} />
            <Row
              title={t("平均延迟")}
              accessory={<Text style={styles.overviewStatValue}>{metrics.averageLatency}</Text>}
            />
            <Row
              title={t("异常队列")}
              accessory={<Text style={styles.overviewStatValue}>{metrics.issueCount}</Text>}
            />
          </Group>

          <Group header={t("快捷访问")} style={styles.overviewGroup}>
            <Row title={t("模型目录")} icon="square.stack.3d.up" chevron onPress={onOpenModels} />
            <Row title={t("API 令牌")} icon="key" chevron onPress={onOpenTokens} />
          </Group>

          <Group header={t("AI 功能")} style={styles.overviewGroup}>
            <Row title={t("AI 创作")} icon="sparkles" chevron onPress={onOpenMedia} />
            <Row title={t("模型体验")} icon="text.bubble" chevron onPress={onOpenExperience} />
            <Row title={t("模型融合")} icon="arrow.triangle.merge" chevron onPress={onOpenFusion} />
            <Row title={t("模型广场")} icon="square.grid.2x2" chevron onPress={onOpenPricing} />
          </Group>

          <Group header={t("用量与任务")} style={styles.overviewGroup}>
            <Row title={t("用量日志")} icon="doc.text.magnifyingglass" chevron onPress={onOpenLogs} />
            <Row title={t("任务")} icon="square.stack.3d.up" chevron onPress={onOpenTasks} />
          </Group>
        </>
      )}
    </ScrollView>
  );
}

function ModelsView({
  query,
  setQuery,
  filteredModels,
  selectedModel,
  setSelectedModel,
  onScroll,
}: {
  query: string;
  setQuery: (value: string) => void;
  filteredModels: Model[];
  selectedModel: Model | null;
  setSelectedModel: (model: Model | null) => void;
  onScroll: TabScrollHandler;
}) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const rowOffsets = useRef<number[]>([]);
  const listFade = useRef(new Animated.Value(0)).current;
  const letters = useMemo(
    () => alphabetOf(filteredModels.map((model) => model.name)),
    [filteredModels],
  );

  const jumpToLetter = (letter: string) => {
    const index = filteredModels.findIndex((model) => letterOf(model.name) === letter);
    if (index < 0) return;
    const offset = rowOffsets.current[index];
    if (offset === undefined) return;
    // modelList 有 paddingTop，减一点让字母对应的第一行完整露出。
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - 12), animated: true });
  };

  return (
    <View style={styles.splitContent}>
      <View style={styles.modelsSearchWrap}>
        {Platform.OS === 'ios' ? null : (
          <View style={styles.searchIconBox} pointerEvents="none">
            <AppIcon name="magnifyingglass" size={20} color={palette.secondaryLabel} />
          </View>
        )}
        <TextInput
          keyboardAppearance={isDark() ? 'dark' : 'light'}
          value={query}
          onChangeText={setQuery}
          placeholder={t("搜索模型、厂商或标签")}
          placeholderTextColor={palette.placeholder}
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
      </View>
      <View style={styles.modelsListRow}>
      {/* 安卓的 BlurView 需要和 BlurTargetView 同级，不能放在被模糊的视图里面。 */}
      <View style={styles.modelsListTarget}>
      <BlurTargetView ref={blurTarget} style={styles.modelsListTarget}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.modelList}
        onScroll={(event) => {
          // 列表滚到搜索框下方时淡入顶部模糊，静止时不压暗第一行。
          const offset = event.nativeEvent.contentOffset.y;
          listFade.setValue(Math.min(1, Math.max(0, offset / 24)));
          onScroll(event);
        }}
        scrollEventThrottle={16}
      >
        {filteredModels.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {query.trim() ? t('没有匹配的模型') : t('暂无模型')}
            </Text>
          </View>
        ) : null}
        {filteredModels.map((model, index) => {
          const selected = selectedModel?.id === model.id;
          return (
            <Pressable
              key={model.id}
              onPress={() => setSelectedModel(model)}
              onLayout={(event) => {
                rowOffsets.current[index] = event.nativeEvent.layout.y;
              }}
              style={({ pressed }) => [
                styles.modelRow,
                selected ? styles.modelRowSelected : null,
                pressed && !ios ? pressedSurface : null,
              ]}
            >
              <View style={styles.modelRowIdentity}>
                <ModelLogo name={model.name} size={30} />
                <View style={styles.modelRowMain}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  <Text style={styles.modelVendor}>{model.vendor}</Text>
                </View>
              </View>
              <View
                style={[
                  styles.pill,
                  ios
                    ? { borderColor: statusColor[model.status] }
                    : { backgroundColor: `${statusColor[model.status]}1F` },
                ]}
              >
                <Text style={[styles.pillText, { color: statusColor[model.status] }]}>
                  {statusLabel(model.status)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      </BlurTargetView>
      <Animated.View pointerEvents="none" style={[styles.modelsListFade, { opacity: listFade }]}>
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <Svg width="100%" height="100%">
              <Defs>
                <SvgLinearGradient id="modelsFadeMask" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="black" stopOpacity="1" />
                  <Stop offset="0.55" stopColor="black" stopOpacity="0.45" />
                  <Stop offset="1" stopColor="black" stopOpacity="0" />
                </SvgLinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#modelsFadeMask)" />
            </Svg>
          }
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            blurTarget={blurTarget}
            blurMethod="dimezisBlurView"
            intensity={40}
            tint={isDark() ? 'dark' : 'light'}
          />
        </MaskedView>
      </Animated.View>
      </View>
      <AlphabetRail letters={letters} onSelect={jumpToLetter} />
      </View>
      <Modal visible={selectedModel !== null} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} statusBarTranslucent onRequestClose={() => setSelectedModel(null)}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
          <SheetHeader title={t("模型详情")} onClose={() => setSelectedModel(null)} />
          <ScrollView contentContainerStyle={styles.detailSheetContent}>
            {selectedModel ? <ModelDetail model={selectedModel} /> : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ModelDetail({ model }: { model: Model }) {
  return (
    <View style={styles.detailPanel}>
      <View style={styles.detailHeader}>
        <View>
          <Text style={styles.detailTitle}>{model.name}</Text>
          <Text style={styles.modelVendor}>{model.vendor}</Text>
        </View>
        <Text style={[styles.statusText, { color: statusColor[model.status] }]}>
          {statusLabel(model.status)}
        </Text>
      </View>
      <View style={styles.detailStats}>
        <MiniStat label={t("上下文")} value={model.context} />
        <MiniStat label={t("延迟")} value={model.latency} />
        <MiniStat label={t("成本")} value={model.price} />
      </View>
      <View style={styles.billingGrid}>
        <SettingsRow label={t("路由")} value={model.route} />
        <SettingsRow label={t("输入费率")} value={model.inputRate} />
        <SettingsRow label={t("输出费率")} value={model.outputRate} />
        <SettingsRow label={t("健康检查")} value={model.updatedAt} />
      </View>
      <Text style={styles.detailNote}>{model.note}</Text>
      <View style={styles.tagRow}>
        {model.tags.map((tag) => (
          <Text key={tag} style={styles.tag}>
            {tag}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TokensView({
  tokens,
  onOpen,
  onToggle,
  onCreate,
  onScroll,
}: {
  tokens: Token[];
  onOpen: (token: Token) => void;
  onToggle: (id: string) => void;
  onCreate: () => void;
  onScroll: TabScrollHandler;
}) {
  return (
    <View style={styles.tokensPane}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, styles.tokensScrollContent]}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {tokens.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('暂无令牌')}</Text>
          </View>
        ) : null}
        {tokens.map((token) => {
          const percent = Math.min(100, Math.round((token.usage / token.quota) * 100));
          return (
            <View key={token.id} style={styles.tokenCard}>
              <Pressable onPress={() => onOpen(token)} style={styles.tokenMain}>
                <View style={styles.tokenHeader}>
                  <View>
                    <Text style={styles.tokenTitle}>{token.name}</Text>
                    <Text style={styles.modelVendor}>{t('令牌 #')}{token.id}</Text>
                  </View>
                  <Text style={[styles.statusText, { color: statusColor[token.status] }]}>
                    {tokenStatusLabel(token.status)}
                  </Text>
                </View>
                <Text style={styles.scopeText}>{token.scope}</Text>
                <View style={styles.progressTrackCompact}>
                  <View style={[styles.progressFillCompact, { width: `${percent}%` }]} />
                </View>
                <View style={styles.metricRow}>
                  <Text style={styles.mutedText}>
                    {token.unlimited ? t('不限额度') : tf('{0}% 已使用', percent)}
                  </Text>
                  <Text style={styles.mutedText}>{token.lastUsed}</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => onToggle(token.id)}
                disabled={token.status === 'expired'}
                style={[styles.secondaryButton, token.status === 'expired' ? styles.buttonDisabled : null]}
              >
                <Text style={styles.secondaryButtonText}>
                  {token.status === 'active' ? t('暂停') : token.status === 'paused' ? t('启用') : t('不可用')}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {/* 新建入口悬浮在右下角：列表再长也不用回到顶部去找。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('新建令牌')}
        onPress={onCreate}
        style={({ pressed }) => [styles.fab, pressed ? styles.fabPressed : null]}
      >
        <AppIcon name="plus" size={26} color={palette.onAccent} />
      </Pressable>
    </View>
  );
}

function AccountView({
  account,
  onOpenPersonal,
  onOpenWallet,
  onScroll,
}: {
  account: AccountSummary | null;
  onOpenPersonal: () => void;
  onOpenWallet: () => void;
  onScroll: TabScrollHandler;
}) {
  const { user } = useAuth();
  const displayName = user?.display_name || user?.username || t('未登录');
  const roleLabel = user?.role === 1 ? t('普通用户') : tf('角色 {0}', user?.role ?? '—');
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}

      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onOpenPersonal}
        style={({ pressed }) => [styles.accountHeader, pressed ? styles.accountHeaderPressed : null]}
      >
        <UserAvatar userId={user?.id} name={displayName} size={56} />
        <View style={styles.accountHeaderMain}>
          <Text style={styles.accountName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.modelVendor}>
            {roleLabel} · ID {user?.id ?? '—'}
          </Text>
        </View>
        <Text style={styles.accountBalance} numberOfLines={1}>
          {account?.balance ?? '—'}
        </Text>
        {Platform.OS === 'ios' ? (
          <SymbolView name="chevron.right" tintColor={palette.tertiaryLabel} style={styles.accountChevron} />
        ) : (
          <AppIcon name="chevron.right" size={18} color={palette.tertiaryLabel} />
        )}
      </Pressable>

      <Group>
        <Row title={t("当前分组")} value={account?.plan ?? user?.group ?? '—'} />
        <Row title={t("剩余额度")} value={account?.balance ?? '—'} />
        <Row title={t("API 端点")} value={account?.endpoint ?? 'test.qmszai.cn'} />
        <Row title={t("连接状态")} value={account?.mode ?? t('在线')} />
      </Group>
      <Group header={t("账户")}>
        <Row title={t("个人设置")} chevron icon="person.crop.circle" onPress={onOpenPersonal} />
        <Row title={t("钱包")} chevron icon="creditcard" onPress={onOpenWallet} />
      </Group>
    </ScrollView>
  );
}

function TokenModal({
  token,
  quotaPerUnit,
  onClose,
  onCopyKey,
  onEdit,
  onDelete,
}: {
  token: Token | null;
  quotaPerUnit: number;
  onClose: () => void;
  onCopyKey: (token: Token) => void;
  onEdit: (token: Token) => void;
  onDelete: (token: Token) => void;
}) {
  if (!token) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('关闭令牌详情')}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.detailTitle}>{token.name}</Text>
              <Text style={styles.modelVendor}>{token.scope}</Text>
            </View>
            <GlassIconButton
              icon="xmark"
              fallback="×"
              label={t("关闭令牌详情")}
              onPress={onClose}
              size={32}
              tint={palette.secondaryLabel}
            />
          </View>
          <View style={styles.detailStats}>
            <MiniStat label={t("用量")} value={formatQuota(token.usage, quotaPerUnit)} />
            <MiniStat
              label={t("限额")}
              value={token.unlimited ? t('不限') : formatQuota(token.remainQuota ?? token.quota, quotaPerUnit)}
            />
            <MiniStat label={t("状态")} value={tokenStatusLabel(token.status)} />
          </View>
          <SettingsRow label={t("分组")} value={token.scope} />
          <SettingsRow label={t("最后使用")} value={token.lastUsed} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("复制密钥")}
            onPress={() => onCopyKey(token)}
            style={({ pressed }) => [
              styles.settingsRow,
              pressed ? { backgroundColor: palette.cardMuted } : null,
            ]}
          >
            <Text style={styles.settingsLabel}>{t("复制密钥")}</Text>
            <View style={styles.copyKeyValue}>
              <Text style={styles.copyKeyMask}>sk-••••••••</Text>
              <AppIcon name="doc.on.doc" size={18} color={palette.blue} />
            </View>
          </Pressable>

          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDelete(token)}
              style={[styles.secondaryActionButton, styles.destructiveOutline]}
            >
              <Text style={[styles.secondaryButtonText, styles.destructiveText]}>{t('删除')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onEdit(token)}
              style={styles.primaryActionButton}
            >
              <Text style={styles.primaryActionText}>{t('编辑')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TokenFormModal({
  visible,
  initial,
  quotaPerUnit,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initial: Token | null;
  quotaPerUnit: number;
  onCancel: () => void;
  onSubmit: (draft: NewTokenDraft) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [name, setName] = useState(initial?.name ?? 'Mobile client');
  // 与网页端一致：新建默认无限额度；关闭后才需要填金额。
  const [unlimited, setUnlimited] = useState(initial ? Boolean(initial.unlimited) : true);
  const [amount, setAmount] = useState(() => {
    if (!initial || initial.unlimited) return '';
    const remain = initial.remainQuota ?? initial.quota;
    return String(Number((remain / (quotaPerUnit || 1)).toFixed(6)));
  });

  // 分组优先级：顺序即优先级，与网页端 routing_group_order 一致。
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    if (initial?.routingGroups?.length) return initial.routingGroups;
    return initial?.group ? [initial.group] : [];
  });
  // 拉不到分组列表时退回手填，避免功能直接不可用。
  const [freeGroup, setFreeGroup] = useState(initial?.group ?? '');
  const [groups, setGroups] = useState<TokenGroupOption[] | null>(null);
  const [groupQuery, setGroupQuery] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [modelLimits, setModelLimits] = useState<string[]>(initial?.modelLimits ?? []);
  const [modelQuery, setModelQuery] = useState('');
  const [allowIps, setAllowIps] = useState(initial?.allowIps ?? '');
  const [pickerMode, setPickerMode] = useState<'none' | 'groups' | 'models'>('none');

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setGroups(null);
    fetchUserGroups()
      .then((map) => {
        if (!alive) return;
        const options = Object.entries(map).map(([groupName, info]) => ({
          name: groupName,
          ratio: Number(info?.ratio ?? 1),
          desc: info?.desc ?? '',
        }));
        // 与网页端下拉一致：default 置顶，其余按名称（拉丁字母在中文前）排序。
        options.sort((a, b) => {
          if (a.name === 'default') return b.name === 'default' ? 0 : -1;
          if (b.name === 'default') return 1;
          const left = a.name.toLowerCase();
          const right = b.name.toLowerCase();
          return left < right ? -1 : left > right ? 1 : 0;
        });
        setGroups(options);
      })
      .catch(() => {
        if (alive) setGroups([]);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setModels(null);
    fetchUserModels()
      .then((list) => {
        if (alive) setModels(list);
      })
      .catch(() => {
        if (alive) setModels([]);
      });
    return () => {
      alive = false;
    };
  }, [visible]);

  const trimmedQuery = groupQuery.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!trimmedQuery) return groups;
    return groups.filter((option) =>
      `${option.name} ${option.desc}`.toLowerCase().includes(trimmedQuery),
    );
  }, [groups, trimmedQuery]);

  const trimmedModelQuery = modelQuery.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!models) return [];
    if (!trimmedModelQuery) return models;
    return models.filter((item) => item.toLowerCase().includes(trimmedModelQuery));
  }, [models, trimmedModelQuery]);

  const toggleGroup = (groupName: string) => {
    setSelectedGroups((current) =>
      current.includes(groupName)
        ? current.filter((item) => item !== groupName)
        : [...current, groupName],
    );
  };

  const toggleModelLimit = (modelId: string) => {
    setModelLimits((current) =>
      current.includes(modelId)
        ? current.filter((item) => item !== modelId)
        : [...current, modelId],
    );
  };

  // iOS 的自定义 Modal 不会避让键盘。这里让白色面板一直铺到屏幕底部（键盘浮在面板上），
  // 用键盘高度 + 16 撑出底部内边距：按钮不贴住键盘顶部的半透明边缘，面板本身仍是连续的。
  const { inset: keyboardInset } = useKeyboardInsets(Platform.OS === 'ios');
  const sheetPaddingBottom =
    Platform.OS === 'ios'
      ? keyboardInset > 0
        ? keyboardInset + 16
        : 30
      : 22;
  // 选择页固定高度，让列表用剩余空间伸缩；否则键盘弹起后列表会把「完成」按钮顶到键盘下面。
  const pickerSheetHeight =
    Platform.OS === 'ios' && pickerMode !== 'none' ? Math.max(420, windowHeight - 96) : undefined;
  // 表单字段变多后，键盘弹起时需要一个可滚动区域，否则顶部字段会被顶出屏幕。
  const formMaxHeight =
    Platform.OS === 'ios' && keyboardInset > 0
      ? Math.max(160, windowHeight - keyboardInset - 190)
      : undefined;

  // 表单变长后，键盘弹起时点击靠下的字段（如 IP 白名单）会被动作按钮挡住；
  // 这里记录每个字段的纵向位置，聚焦时把字段滚到可视区顶部。
  const formRef = useRef<ScrollViewInstance>(null);
  const fieldOffsets = useRef<Record<string, number>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const scrollFieldIntoView = (key: string) => {
    const offset = fieldOffsets.current[key];
    if (offset == null) return;
    formRef.current?.scrollTo({ y: Math.max(0, offset - 12), animated: true });
  };
  // 键盘弹起时 ScrollView 才收缩；聚焦当下滚动不会生效，等键盘高度变化后再补一次。
  useEffect(() => {
    if (!focusedField || keyboardInset <= 0) return;
    // 键盘有弹出动画：先滚一次，动画结束后再补一次，避免滚动被旧的视口高度截断。
    const first = setTimeout(() => scrollFieldIntoView(focusedField), 60);
    const second = setTimeout(() => scrollFieldIntoView(focusedField), 320);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [focusedField, keyboardInset]);

  const parsedAmount = Number.parseFloat(amount);
  const canSubmit =
    name.trim().length > 0 &&
    (unlimited || (Number.isFinite(parsedAmount) && parsedAmount >= 0));

  const openPicker = (mode: 'groups' | 'models') => {
    animateContentChange();
    setPickerMode(mode);
  };

  const closePicker = () => {
    animateContentChange();
    setPickerMode('none');
    setGroupQuery('');
    setModelQuery('');
  };

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit({
      name: name.trim(),
      group: freeGroup.trim(),
      routingGroups: selectedGroups,
      quota: unlimited ? 0 : parsedAmount,
      unlimited,
      modelLimits,
      allowIps: allowIps.trim(),
    });
  };

  const limitSummary =
    modelLimits.length <= 1
      ? (modelLimits[0] ?? '')
      : tf('{0} 等 {1} 个', modelLimits[0], modelLimits.length);

  const pickerTitle = pickerMode === 'models' ? t('模型限制') : t('选择分组');
  const pickerSearch = pickerMode === 'models' ? modelQuery : groupQuery;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        {/* 点面板上方空白区域返回上一层：选择页回到表单，表单回到令牌列表。 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('取消')}
          onPress={pickerMode === 'none' ? onCancel : closePicker}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.modalSheet,
            { paddingBottom: sheetPaddingBottom },
            pickerSheetHeight ? { height: pickerSheetHeight } : null,
          ]}
        >
          <View style={styles.modalHandle} />
          {pickerMode !== 'none' ? (
            <>
              <View style={styles.pickerNav}>
                <GlassPillButton
                  icon="chevron.left"
                  label={t("返回")}
                  tint={palette.blue}
                  onPress={closePicker}
                />
                <Text style={styles.pickerTitle} pointerEvents="none">
                  {pickerTitle}
                </Text>
                <GlassPillButton label={t("完成")} tint={palette.blue} onPress={closePicker} />
              </View>
              <View style={styles.groupSearch}>
                <AppIcon name="magnifyingglass" size={16} color={palette.secondaryLabel} />
                <TextInput
                  keyboardAppearance={isDark() ? 'dark' : 'light'}
                  accessibilityLabel={pickerMode === 'models' ? t('搜索模型') : t('搜索分组')}
                  value={pickerSearch}
                  onChangeText={pickerMode === 'models' ? setModelQuery : setGroupQuery}
                  placeholder={pickerMode === 'models' ? t('搜索模型') : t('搜索分组')}
                  placeholderTextColor={palette.tertiaryLabel}
                  autoCorrect={false}
                  style={styles.groupSearchInput}
                />
                {pickerSearch ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pickerMode === 'models' ? t('清除模型搜索') : t('清除分组搜索')}
                    onPress={() => (pickerMode === 'models' ? setModelQuery('') : setGroupQuery(''))}
                    hitSlop={10}
                  >
                    <AppIcon name="xmark" size={14} color={palette.secondaryLabel} />
                  </Pressable>
                ) : null}
              </View>
              {pickerMode === 'groups' ? (
                <ScrollView
                  style={[styles.groupPickerList, pickerSheetHeight ? styles.groupPickerListFlex : null]}
                  contentContainerStyle={styles.groupPickerListContent}
                  keyboardShouldPersistTaps="handled"
                >
                  {groups === null ? (
                    <Text style={styles.groupEmpty}>{t('正在加载分组…')}</Text>
                  ) : filteredGroups.length === 0 ? (
                    <Text style={styles.groupEmpty}>{t('没有匹配的分组')}</Text>
                  ) : (
                    filteredGroups.map((option) => {
                      const order = selectedGroups.indexOf(option.name);
                      const selected = order >= 0;
                      return (
                        <Pressable
                          key={option.name}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${option.name}${selected ? tf('，第 {0} 优先', order + 1) : ''}`}
                          onPress={() => toggleGroup(option.name)}
                          style={({ pressed }) => [
                            styles.groupOption,
                            selected ? styles.groupOptionSelected : null,
                            pressed ? styles.groupOptionPressed : null,
                          ]}
                        >
                          <View
                            style={[
                              styles.groupOptionOrder,
                              selected ? styles.groupOptionOrderActive : null,
                            ]}
                          >
                            {selected ? (
                              <Text style={styles.groupOptionOrderText}>{order + 1}</Text>
                            ) : null}
                          </View>
                          <View style={styles.groupOptionMain}>
                            <Text style={styles.groupOptionName} numberOfLines={1}>
                              {option.name}
                            </Text>
                            {option.desc && option.desc !== option.name ? (
                              <Text style={styles.groupOptionDesc} numberOfLines={1}>
                                {option.desc}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.groupOptionRatio}>
                            {tf('{0}x 倍率', Number(option.ratio.toFixed(5)))}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              ) : (
                <FlatList
                  data={filteredModels}
                  keyExtractor={(item) => item}
                  style={[styles.groupPickerList, pickerSheetHeight ? styles.groupPickerListFlex : null]}
                  contentContainerStyle={styles.groupPickerListContent}
                  keyboardShouldPersistTaps="handled"
                  initialNumToRender={14}
                  windowSize={9}
                  ListEmptyComponent={
                    <Text style={styles.groupEmpty}>
                      {models === null ? t('正在加载模型…') : t('没有匹配的模型')}
                    </Text>
                  }
                  renderItem={({ item }) => {
                    const selected = modelLimits.includes(item);
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${item}${selected ? t('，已选择') : ''}`}
                        onPress={() => toggleModelLimit(item)}
                        style={({ pressed }) => [
                          styles.groupOption,
                          selected ? styles.groupOptionSelected : null,
                          pressed ? styles.groupOptionPressed : null,
                        ]}
                      >
                        <View
                          style={[
                            styles.groupOptionOrder,
                            selected ? styles.groupOptionOrderActive : null,
                          ]}
                        >
                          {selected ? (
                            <AppIcon name="checkmark" size={12} color={palette.onAccent} />
                          ) : null}
                        </View>
                        <ModelLogo name={item} size={24} />
                        <View style={styles.groupOptionMain}>
                          <Text style={styles.groupOptionName} numberOfLines={1}>
                            {item}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }}
                />
              )}
            </>
          ) : (
            <>
              <View style={styles.detailHeader}>
                <View>
                  <Text style={styles.detailTitle}>{initial ? t('编辑令牌') : t('新建令牌')}</Text>
                  <Text style={styles.modelVendor}>
                    {initial ? t('修改名称与限额') : t('创建后可用于调用 API')}
                  </Text>
                </View>
                <GlassIconButton
                  icon="xmark"
                  fallback="×"
                  label={t("关闭令牌编辑")}
                  onPress={onCancel}
                  size={32}
                  tint={palette.secondaryLabel}
                />
              </View>

              <ScrollView
                ref={formRef}
                style={formMaxHeight ? { maxHeight: formMaxHeight } : undefined}
                contentContainerStyle={styles.formStack}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={formMaxHeight ? true : false}
              >
                <View
                  onLayout={(event) => {
                    fieldOffsets.current.name = event.nativeEvent.layout.y;
                  }}
                >
                  <FieldInput
                    label={t("名称")}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => {
                      setFocusedField('name');
                      scrollFieldIntoView('name');
                    }}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.formLabel}>{t('分组优先选择')}</Text>
                  {groups && groups.length === 0 ? (
                    <TextInput
                      keyboardAppearance={isDark() ? 'dark' : 'light'}
                      value={freeGroup}
                      onChangeText={setFreeGroup}
                      placeholder={t("输入分组名，留空使用默认分组")}
                      placeholderTextColor={palette.placeholder}
                      autoCorrect={false}
                      style={styles.formInput}
                    />
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("选择分组")}
                      onPress={() => openPicker('groups')}
                      style={({ pressed }) => [
                        styles.groupField,
                        pressed ? styles.groupFieldPressed : null,
                      ]}
                    >
                      {selectedGroups.length === 0 ? (
                        <Text style={styles.groupPlaceholder}>{t('选择分组，可多选，顺序即优先级')}</Text>
                      ) : (
                        <View style={styles.groupChips}>
                          {selectedGroups.map((groupName, index) => (
                            <View key={groupName} style={styles.groupChip}>
                              <Text style={styles.groupChipIndex}>{index + 1}</Text>
                              <Text style={styles.groupChipText} numberOfLines={1}>
                                {groupName}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <AppIcon name="chevron.down" size={14} color={palette.placeholder} />
                    </Pressable>
                  )}
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.formLabel}>{t('无限额度')}</Text>
                  <Switch
                    accessibilityLabel={t("无限额度")}
                    value={unlimited}
                    onValueChange={setUnlimited}
                    // iOS 原生 Switch 默认 alignSelf: 'flex-start'，会贴住行顶，这里强制居中。
                    style={styles.switchControl}
                  />
                </View>

                {unlimited ? null : (
                  <View
                    onLayout={(event) => {
                      fieldOffsets.current.amount = event.nativeEvent.layout.y;
                    }}
                  >
                    <FieldInput
                      label={t("金额（元）")}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      onFocus={() => {
                        setFocusedField('amount');
                        scrollFieldIntoView('amount');
                      }}
                    />
                  </View>
                )}

                <View style={styles.fieldGroup}>
                  <Text style={styles.formLabel}>{t('模型限制列表')}</Text>
                  {models && models.length === 0 ? (
                    <Text style={styles.groupPlaceholder}>{t('模型列表不可用')}</Text>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("选择模型限制")}
                      onPress={() => openPicker('models')}
                      style={({ pressed }) => [
                        styles.groupField,
                        pressed ? styles.groupFieldPressed : null,
                      ]}
                    >
                      <Text
                        style={modelLimits.length === 0 ? styles.groupPlaceholder : styles.limitSummary}
                        numberOfLines={1}
                      >
                        {modelLimits.length === 0 ? t('留空支持所有模型') : limitSummary}
                      </Text>
                      <AppIcon name="chevron.down" size={14} color={palette.placeholder} />
                    </Pressable>
                  )}
                </View>

                <View
                  style={styles.fieldGroup}
                  onLayout={(event) => {
                    fieldOffsets.current.allowIps = event.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.formLabel}>{t('IP 白名单')}</Text>
                  <TextInput
                    keyboardAppearance={isDark() ? 'dark' : 'light'}
                    accessibilityLabel={t("IP 白名单")}
                    value={allowIps}
                    onChangeText={setAllowIps}
                    placeholder={t("允许的 IP，一行一个，留空不限制")}
                    placeholderTextColor={palette.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    onFocus={() => {
                      setFocusedField('allowIps');
                      scrollFieldIntoView('allowIps');
                    }}
                    style={[styles.formInput, styles.formTextarea]}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondaryActionButton}>
                  <Text style={styles.secondaryButtonText}>{t('取消')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSubmit}
                  onPress={submit}
                  style={[styles.primaryActionButton, !canSubmit ? styles.buttonDisabled : null]}
                >
                  <Text style={styles.primaryActionText}>{initial ? t('保存') : t('创建')}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

type TokenGroupOption = { name: string; ratio: number; desc: string };

function FieldInput({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  placeholder?: string;
  onFocus?: () => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        keyboardAppearance={isDark() ? 'dark' : 'light'}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={palette.placeholder}
        style={styles.formInput}
      />
    </View>
  );
}

function StatBlock({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'amber' | 'rose' }) {
  return (
    <View style={[styles.statBlock, styles[`statBlock_${tone}`]]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  symbol,
  title,
  onPress,
}: {
  icon: string;
  symbol: ComponentProps<typeof SymbolView>['name'];
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} android_ripple={ripple()} style={styles.quickAction}>
      {Platform.OS === 'ios' ? (
        <SymbolView name={symbol} tintColor={palette.blue} style={styles.quickSymbol} />
      ) : (
        <AppIcon name={symbol} size={24} color={palette.blue} style={{ marginRight: 12 }} />
      )}
      <View style={styles.quickBody}>
        <Text style={styles.quickTitle}>{title}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text style={styles.settingsValue}>{value}</Text>
    </View>
  );
}

function makeBaseStyles() {
  return StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
  },
  dimLayer: {
    backgroundColor: '#000000',
  },
  subpageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.groupedBackground,
  },
  subpagePane: {
    flex: 1,
    backgroundColor: palette.groupedBackground,
  },
  subpageShadow: {
    shadowColor: '#000000',
    shadowOpacity: ios ? 0.14 : 0,
    shadowRadius: 18,
    shadowOffset: { width: -8, height: 0 },
  },
  appShell: {
    flex: 1,
    paddingTop: Platform.select({ android: 18, ios: 4, default: 12 }),
  },
  safeAreaContent: {
    flex: 1,
  },
  header: {
    minHeight: 76,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    color: m3.onSurface,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerAction: {
    // 标题是 30pt 文本、按钮 36pt，稍微上抬让两者视觉居中而不是贴底。
    marginBottom: ios ? 2 : 4,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: palette.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 96,
    gap: 16,
  },
  tokensPane: {
    flex: 1,
  },
  // 右下角悬浮按钮会盖住列表末条，多留一屏滚动余量。
  tokensScrollContent: {
    paddingBottom: 176,
  },
  fab: {
    position: 'absolute',
    right: 20,
    // 悬浮导航栏顶边距内容底边 70pt（dock paddingTop 6 + bar 64），再留 14pt 间距。
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: m3.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    opacity: 0.82,
  },
  rangeSwitch: {
    minHeight: 48,
    borderRadius: shape.full,
    backgroundColor: m3.surfaceContainer,
    padding: 4,
    flexDirection: 'row',
    gap: 2,
  },
  rangeButton: {
    flex: 1,
    borderRadius: shape.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeButtonActive: {
    backgroundColor: m3.surfaceContainerLowest,
    ...elevation.level1,
  },
  rangeButtonText: {
    color: m3.onSurfaceVariant,
    ...typeScale.labelLarge,
  },
  rangeButtonTextActive: {
    color: m3.onSurface,
    ...typeScale.labelLarge,
    fontWeight: '600',
  },
  heroPanel: {
    borderRadius: shape.xl,
    padding: 20,
    backgroundColor: palette.heroBackground,
    ...elevation.level2,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelLabel: {
    color: palette.heroLabel,
    fontSize: 13,
    fontWeight: '500',
  },
  heroMetric: {
    color: palette.heroValue,
    fontSize: 44,
    fontWeight: '600',
    letterSpacing: -1,
    marginTop: 2,
  },
  scoreRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 6,
    borderColor: palette.heroAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.heroTrack,
    overflow: 'hidden',
    marginTop: 18,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.heroAccent,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  mutedText: {
    color: palette.subtleLabel,
    fontSize: 12,
    fontWeight: '600',
  },
  gridTwo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBlock: {
    width: '48.2%',
    minHeight: 104,
    borderRadius: shape.lg,
    padding: 16,
    justifyContent: 'space-between',
  },
  statBlock_blue: {
    backgroundColor: palette.tintBlue,
  },
  statBlock_green: {
    backgroundColor: palette.tintGreen,
  },
  statBlock_amber: {
    backgroundColor: palette.tintAmber,
  },
  statBlock_rose: {
    backgroundColor: palette.tintRose,
  },
  statLabel: {
    color: m3.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '500',
  },
  statValue: {
    color: m3.onSurface,
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    marginTop: 2,
  },
  sectionTitle: {
    color: m3.onSurface,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  // 安卓概览：单张白色数据卡 + 分组列表，信息层级与 iOS 版一致。
  heroCard: {
    backgroundColor: m3.surfaceContainerLowest,
    padding: 20,
    gap: 16,
    ...cardSurface,
  },
  heroCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroCardMain: {
    flex: 1,
    gap: 2,
  },
  heroCardLabel: {
    color: m3.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '500',
  },
  heroCardValue: {
    color: m3.onSurface,
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  heroCardAside: {
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: 2,
  },
  heroCardAsideLabel: {
    color: m3.onSurfaceVariant,
    fontSize: 12,
    fontWeight: '500',
  },
  heroCardAsideValue: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  heroCardTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: m3.surfaceContainerHighest,
    overflow: 'hidden',
  },
  heroCardFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: m3.primary,
  },
  heroCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCardMeta: {
    color: m3.onSurfaceVariant,
    fontSize: 12,
  },
  overviewGroup: {
    marginTop: 0,
  },
  overviewStatValue: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  actionList: {
    gap: 10,
  },
  quickAction: {
    minHeight: 64,
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    ...elevation.level1,
  },
  quickSymbol: {
    width: 34,
    height: 26,
  },
  quickBody: {
    flex: 1,
  },
  quickTitle: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '500',
  },
  chevron: {
    color: m3.outline,
    fontSize: 32,
    fontWeight: '300',
  },
  splitContent: {
    flex: 1,
    paddingBottom: 16,
  },
  modelsSearchWrap: {
    paddingHorizontal: 20,
  },
  modelsListRow: {
    flex: 1,
    flexDirection: 'row',
  },
  modelsListTarget: {
    flex: 1,
  },
  modelsListFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
  },
  searchIconBox: {
    position: 'absolute',
    left: 36,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  searchInput: {
    height: 52,
    borderRadius: shape.full,
    backgroundColor: m3.surfaceContainerHigh,
    paddingLeft: 48,
    paddingRight: 20,
    color: m3.onSurface,
    fontSize: 15,
  },
  modelList: {
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 96,
  },
  modelRow: {
    minHeight: 80,
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    overflow: 'hidden',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...elevation.level1,
  },
  modelRowSelected: {
    backgroundColor: m3.secondaryContainer,
  },
  modelRowIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modelRowMain: {
    flex: 1,
    paddingRight: 12,
  },
  modelName: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  modelVendor: {
    color: m3.onSurfaceVariant,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  pill: {
    minWidth: 58,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  detailSheetContent: { padding: 16, paddingBottom: 40 },
  detailPanel: {
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    padding: 18,
    ...elevation.level1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTitle: {
    color: m3.onSurface,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  detailStats: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  billingGrid: {
    borderRadius: shape.lg,
    backgroundColor: m3.surfaceContainerLow,
    overflow: 'hidden',
    marginTop: 14,
  },
  miniStat: {
    flex: 1,
    minHeight: 70,
    borderRadius: shape.md,
    backgroundColor: m3.surfaceContainerLowest,
    padding: 12,
    justifyContent: 'space-between',
  },
  miniValue: {
    color: m3.onSurface,
    fontSize: 17,
    fontWeight: '600',
  },
  detailNote: {
    color: palette.deepLabel,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  tag: {
    borderRadius: shape.sm,
    backgroundColor: m3.surfaceContainer,
    color: m3.onSurfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '500',
  },
  primaryActionText: {
    color: palette.onSolidButton,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    padding: 18,
    ...elevation.level1,
  },
  emptyTitle: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  tokenCard: {
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    padding: 16,
    ...elevation.level1,
  },
  tokenMain: {
    gap: 10,
  },
  tokenHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  tokenTitle: {
    color: m3.onSurface,
    fontSize: 16,
    fontWeight: '600',
  },
  scopeText: {
    color: palette.deepLabel,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  progressTrackCompact: {
    height: 6,
    borderRadius: 3,
    backgroundColor: m3.surfaceContainerHighest,
    overflow: 'hidden',
  },
  progressFillCompact: {
    height: 6,
    borderRadius: 3,
    backgroundColor: m3.primary,
  },
  secondaryButton: {
    height: 44,
    borderRadius: shape.full,
    borderWidth: 1,
    borderColor: m3.outlineVariant,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: m3.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  accountHeader: {
    borderRadius: shape.xl,
    backgroundColor: m3.surfaceContainerLowest,
    overflow: 'hidden',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    ...elevation.level1,
  },
  accountHeaderPressed: {
    backgroundColor: m3.surfaceContainerLow,
  },
  accountHeaderMain: {
    flex: 1,
    gap: 2,
  },
  accountBalance: {
    color: palette.strongLabel,
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  accountChevron: { width: 8, height: 14 },
  accountChevronText: { color: palette.tertiaryLabel, fontSize: 18 },
  accountName: {
    color: palette.strongLabel,
    fontSize: 18,
    fontWeight: '800',
  },
  settingsRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingsLabel: {
    color: palette.secondaryLabel,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsValue: {
    flex: 1,
    color: palette.strongLabel,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  copyKeyValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyKeyMask: {
    color: palette.subtleLabel,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: palette.backdrop,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    // 表单与选择页切换时面板高度会变化，裁掉过渡中溢出的行，避免内容跑到面板圆角之外。
    overflow: 'hidden',
    backgroundColor: palette.card,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 30, android: 22, default: 24 }),
  },
  formStack: {
    gap: 12,
    marginTop: 18,
  },
  fieldGroup: {
    gap: 7,
  },
  formLabel: {
    color: palette.secondaryLabel,
    fontSize: 13,
    fontWeight: '800',
  },
  formInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.separator,
    backgroundColor: palette.inputBackground,
    paddingHorizontal: 12,
    color: palette.strongLabel,
    fontSize: 16,
    fontWeight: '600',
  },
  groupField: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.separator,
    backgroundColor: palette.inputBackground,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupFieldPressed: {
    backgroundColor: palette.pressedFill,
  },
  groupChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: m3.primaryContainer,
  },
  groupChipIndex: {
    color: m3.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  groupChipText: {
    color: m3.primary,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 160,
  },
  groupPlaceholder: {
    flex: 1,
    color: palette.placeholder,
    fontSize: 15,
  },
  pickerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
  },
  pickerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: palette.strongLabel,
    fontSize: 17,
    fontWeight: '700',
  },
  switchRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchControl: {
    alignSelf: 'center',
  },
  limitSummary: {
    flex: 1,
    color: palette.strongLabel,
    fontSize: 15,
    fontWeight: '600',
  },
  formTextarea: {
    minHeight: 76,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
  },
  groupSearch: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: m3.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  groupSearchInput: {
    flex: 1,
    minHeight: 38,
    paddingVertical: 0,
    color: palette.strongLabel,
    fontSize: 15,
  },
  groupPickerList: {
    marginTop: 10,
    maxHeight: 300,
  },
  groupPickerListFlex: {
    flex: 1,
    maxHeight: undefined,
    minHeight: 120,
  },
  groupPickerListContent: {
    paddingBottom: 4,
  },
  groupEmpty: {
    color: palette.placeholder,
    fontSize: 14,
    paddingVertical: 20,
    textAlign: 'center',
  },
  groupOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separatorSoft,
  },
  groupOptionSelected: {
    backgroundColor: m3.primaryContainer,
    borderBottomColor: 'transparent',
  },
  groupOptionPressed: {
    backgroundColor: palette.pressedFill,
  },
  groupOptionOrder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: palette.tertiaryLabel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupOptionOrderActive: {
    borderColor: m3.primary,
    backgroundColor: m3.primary,
  },
  groupOptionOrderText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  groupOptionMain: {
    flex: 1,
    gap: 2,
  },
  groupOptionName: {
    color: palette.strongLabel,
    fontSize: 15,
    fontWeight: '600',
  },
  groupOptionDesc: {
    color: palette.placeholder,
    fontSize: 12,
  },
  groupOptionRatio: {
    color: palette.subtleLabel,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  secondaryActionButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveOutline: {
    borderColor: palette.destructive,
  },
  destructiveText: {
    color: palette.destructive,
  },
  primaryActionButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    backgroundColor: palette.solidButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.handle,
    marginBottom: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: palette.deepLabel,
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '500',
  },
  });
}

// iOS follows inset grouped lists and system typography; Android retains its own baseline.
function makeIosStyles() {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.groupedBackground },
  title: { color: palette.label, fontSize: 34, fontWeight: '700', letterSpacing: 0.3 },
  heroPanel: { backgroundColor: palette.card, borderRadius: 12, borderCurve: 'continuous', padding: 16 },
  panelLabel: { color: palette.deepLabel, fontSize: 15 },
  heroMetric: { color: palette.label, fontSize: 34, fontWeight: '600', marginTop: 4 },
  heroCopy: { color: palette.subtleLabel, fontSize: 13, lineHeight: 19, marginTop: 8 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.fill, overflow: 'hidden', marginTop: 16 },
  progressFill: { height: 4, backgroundColor: palette.blue },
  gridTwo: { backgroundColor: palette.card, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  statBlock: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator },
  statBlock_blue: {}, statBlock_green: {}, statBlock_amber: {}, statBlock_rose: {},
  statLabel: { color: palette.label, fontSize: 17 },
  statValue: { color: palette.subtleLabel, fontSize: 17, fontWeight: '400' },
  sectionTitle: { color: palette.secondaryLabel, fontSize: 13, fontWeight: '400', marginLeft: 0, marginTop: 8 },
  actionList: { backgroundColor: palette.card, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  quickAction: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separatorSoft },
  quickTitle: { color: palette.label, fontSize: 17, fontWeight: '400' },
  quickIcon: { width: 34, fontSize: 23, color: palette.blue },
  searchInput: { minHeight: 40, borderRadius: 10, backgroundColor: palette.fill, paddingHorizontal: 12, color: palette.label, fontSize: 17 },
  modelName: { color: palette.label, fontSize: 17, fontWeight: '600', marginBottom: 4 },
  modelRowSelected: { borderColor: palette.blue, backgroundColor: palette.card },
  detailTitle: { color: palette.label, fontSize: 22, fontWeight: '600' },
  formLabel: { color: palette.secondaryLabel, fontSize: 13, fontWeight: '400' },
  formInput: { minHeight: 46, borderRadius: 10, borderWidth: 0, backgroundColor: palette.inputBackground, paddingHorizontal: 12, color: palette.label, fontSize: 17, fontWeight: '400' },
  groupField: { minHeight: 46, borderRadius: 10, borderWidth: 0, backgroundColor: palette.inputBackground, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupFieldPressed: { backgroundColor: palette.fill },
  groupChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  groupChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.tintBlue },
  groupChipIndex: { color: palette.blue, fontSize: 11, fontWeight: '700' },
  groupChipText: { color: palette.blue, fontSize: 13, fontWeight: '600', maxWidth: 160 },
  groupPlaceholder: { flex: 1, color: palette.subtleLabel, fontSize: 17 },
  pickerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 10 },
  pickerTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: palette.label, fontSize: 17, fontWeight: '600' },
  switchRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  switchControl: { alignSelf: 'center' },
  limitSummary: { flex: 1, color: palette.label, fontSize: 17, fontWeight: '400' },
  formTextarea: { minHeight: 76, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' },
  groupSearch: { minHeight: 38, borderRadius: 10, backgroundColor: palette.fill, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  groupSearchInput: { flex: 1, minHeight: 36, paddingVertical: 0, color: palette.label, fontSize: 17 },
  groupPickerList: { marginTop: 8, maxHeight: 300 },
  groupOption: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, borderCurve: 'continuous', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separatorSoft },
  groupOptionSelected: { backgroundColor: palette.tintBlueSoft, borderBottomColor: 'transparent' },
  groupOptionPressed: { backgroundColor: palette.fillMuted },
  groupOptionOrder: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: palette.separatorSoft, alignItems: 'center', justifyContent: 'center' },
  groupOptionOrderActive: { borderColor: palette.blue, backgroundColor: palette.blue },
  groupOptionOrderText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  groupOptionName: { color: palette.label, fontSize: 17, fontWeight: '400' },
  groupOptionDesc: { color: palette.subtleLabel, fontSize: 13 },
  groupOptionRatio: { color: palette.subtleLabel, fontSize: 13, fontVariant: ['tabular-nums'] },
  groupEmpty: { color: palette.subtleLabel, fontSize: 15, paddingVertical: 20, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 84,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  primaryActionText: { color: palette.onAccent, fontSize: 17, fontWeight: '600' },
  primaryActionButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center' },
  secondaryActionButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: palette.separator, alignItems: 'center', justifyContent: 'center' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden', backgroundColor: palette.card, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  settingsLabel: { fontSize: 17, color: palette.label, fontWeight: '400' },
  settingsValue: { flex: 1, fontSize: 17, color: palette.subtleLabel, textAlign: 'right' },
  accountHeader: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accountHeaderPressed: { backgroundColor: palette.fillMuted },
  accountName: { color: palette.strongLabel, fontSize: 20, fontWeight: '600' },
  accountBalance: { color: palette.strongLabel, fontSize: 17, fontWeight: '600' },
  settingsList: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    overflow: 'hidden',
  },
  settingsRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separatorSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  tokenCard: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    padding: 16,
  },
  modelRow: {
    minHeight: 72,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tokenTitle: { color: palette.label, fontSize: 17, fontWeight: '600' },
  scopeText: { color: palette.secondaryLabel, fontSize: 15, fontWeight: '400', lineHeight: 20 },
  mutedText: { color: palette.subtleLabel, fontSize: 13, fontWeight: '400' },
  statusText: { fontSize: 15, fontWeight: '400' },
  progressTrackCompact: { height: 4, borderRadius: 2, backgroundColor: palette.fill },
  progressFillCompact: { height: 4, borderRadius: 2, backgroundColor: palette.blue },
  secondaryButton: {
    height: 40,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 0,
    backgroundColor: palette.fillMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  secondaryButtonText: { color: palette.blue, fontSize: 15, fontWeight: '500' },
  emptyState: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    padding: 16,
  },
  detailPanel: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: palette.card,
    padding: 16,
  },
  // 以下是 iOS 专用原值：baseStyles 里的同名键已按 M3 改写，这里整体覆盖回来。
  pill: {
    minWidth: 58,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: palette.separator,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
  modelVendor: { color: palette.subtleLabel, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  chevron: { color: palette.subtleLabel, fontSize: 32, fontWeight: '300' },
  tag: {
    borderRadius: 14,
    backgroundColor: palette.fill,
    color: palette.secondaryLabel,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyTitle: { color: palette.strongLabel, fontSize: 17, fontWeight: '800', marginBottom: 5 },
  billingGrid: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.separator,
    backgroundColor: palette.cardSubtle,
    overflow: 'hidden',
    marginTop: 14,
  },
  miniStat: {
    flex: 1,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: palette.cardMuted,
    padding: 10,
    justifyContent: 'space-between',
  },
  miniValue: { color: palette.strongLabel, fontSize: 17, fontWeight: '800' },
  });
}

const styles = themedStyles(() => {
  const base = makeBaseStyles();
  return Platform.OS === 'ios' ? { ...base, ...makeIosStyles() } : base;
});
