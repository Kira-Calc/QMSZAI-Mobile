import { SymbolView } from 'expo-symbols';
import { ChatWorkspace } from './src/ChatWorkspace';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useCallback, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usageRangeOptions } from './src/data/mockConsole';
import { ModelLogo } from './src/components/ModelLogo';
import { LiquidTabBar } from './src/LiquidTabBar';
import { mockConsoleAdapter } from './src/services/consoleAdapter';
import {
  GlassIconButton,
  Group,
  Row,
  Segmented,
  SheetHeader,
  animateContentChange,
} from './src/ui';
import { FaceToolsScreen } from './src/screens/FaceToolsScreen';
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
  MessageRecord,
  Model,
  ModelStatus,
  NewTokenDraft,
  OverviewMetrics,
  TabKey,
  TaskKind,
  TaskRecord,
  Token,
  TokenStatus,
  UsageRange,
} from './src/types';

type SubpageKey =
  | 'logs'
  | 'tasks'
  | 'messages'
  | 'media'
  | 'experience'
  | 'face'
  | 'fusion'
  | 'pricing'
  | 'personal'
  | 'wallet';

type TabScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

const statusLabel: Record<ModelStatus, string> = {
  stable: '可用',
  watch: '观察',
  limited: '限流',
};

const tokenStatusLabel: Record<TokenStatus, string> = {
  active: '启用',
  paused: '暂停',
  expired: '过期',
};

const statusColor: Record<ModelStatus | TokenStatus, string> = {
  stable: '#157A5B',
  watch: '#9A6500',
  limited: '#B3404A',
  active: '#157A5B',
  paused: '#9A6500',
  expired: '#B3404A',
};

export default function App() {
  const initialSnapshot = useMemo(() => mockConsoleAdapter.getInitialSnapshot(), []);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [query, setQuery] = useState('');
  const [usageRange, setUsageRange] = useState<UsageRange>('24h');
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [tokens, setTokens] = useState<Token[]>(initialSnapshot.tokens);
  const [tasks, setTasks] = useState<TaskRecord[]>(initialSnapshot.tasks);
  const [messages, setMessages] = useState<MessageRecord[]>(initialSnapshot.messages);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
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
  }, [subpage, subpageAnim]);

  const setTabBarMinimizedAnimated = useCallback((minimized: boolean) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
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

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return initialSnapshot.models;
    }
    return initialSnapshot.models.filter((model) => {
      return [model.name, model.vendor, model.context, model.route, ...model.tags]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [initialSnapshot.models, query]);

  const activeTokens = tokens.filter((token) => token.status === 'active').length;
  const metrics = initialSnapshot.metricsByRange[usageRange];
  const availableModels = `${initialSnapshot.models.filter((model) => model.status !== 'limited').length}/${initialSnapshot.models.length}`;
  const usagePercent = Math.round((metrics.totalUsage / metrics.totalQuota) * 100);

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

  const toggleToken = (id: string) => {
    setTokens((current) =>
      current.map((token) => {
        if (token.id !== id || token.status === 'expired') {
          return token;
        }
        return { ...token, status: token.status === 'active' ? 'paused' : 'active' };
      }),
    );
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

  const submitToken = (draft: NewTokenDraft) => {
    if (editingToken) {
      setTokens((current) =>
        current.map((token) =>
          token.id === editingToken.id
            ? {
                ...token,
                name: draft.name,
                owner: draft.owner,
                scope: draft.scope,
                quota: draft.quota,
              }
            : token,
        ),
      );
    } else {
      setTokens((current) => [
        mockConsoleAdapter.createToken(draft, Date.now()),
        ...current,
      ]);
    }
    setTokenFormVisible(false);
    setEditingToken(null);
  };

  const deleteToken = (token: Token) => {
    Alert.alert('删除令牌？', `“${token.name}”删除后无法恢复，使用该令牌的请求会被拒绝。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setTokens((current) => current.filter((item) => item.id !== token.id));
          setSelectedToken(null);
        },
      },
    ]);
  };

  const cancelTask = (id: string) => {
    setTasks((current) =>
      current.map((task): TaskRecord =>
        task.id === id
          ? { ...task, state: 'cancelled', elapsed: '已取消', note: '任务已取消，未产生费用。' }
          : task,
      ),
    );
  };

  const retryTask = (id: string) => {
    setTasks((current) =>
      current.map((task): TaskRecord =>
        task.id === id
          ? {
              ...task,
              state: 'running',
              progress: 4,
              submittedAt: '刚刚',
              elapsed: '重新开始',
              cost: 0,
              note: '已重新排队，等待上游调度。',
            }
          : task,
      ),
    );
  };

  const readMessage = (id: string) => {
    setMessages((current) =>
      current.map((message) => (message.id === id ? { ...message, read: true } : message)),
    );
  };

  const readAllMessages = () => {
    setMessages((current) => current.map((message) => ({ ...message, read: true })));
  };

  const deleteMessage = (id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTasks((current) => {
        let changed = false;
        const next = current.map((task): TaskRecord => {
          if (task.state !== 'running') {
            return task;
          }
          changed = true;
          const progress = Math.min(100, task.progress + 4);
          return progress >= 100
            ? {
                ...task,
                progress: 100,
                state: 'succeeded',
                elapsed: '已完成',
                note: '模拟任务已完成，结果仅保留在本次运行中。',
              }
            : { ...task, progress };
        });
        return changed ? next : current;
      });
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  const createMediaTask = (input: { title: string; kind: TaskKind; cost: number }) => {
    setTasks((current) => [
      {
        id: `task-${Date.now()}`,
        title: input.title,
        kind: input.kind,
        state: 'running',
        progress: 6,
        submittedAt: '刚刚',
        elapsed: '刚开始',
        cost: input.cost,
        note: '由 AI 创作页提交，模拟生成中。',
      },
      ...current,
    ]);
  };

  const currentTitle =
    activeTab === 'overview'
      ? '概览'
      : activeTab === 'models'
        ? '模型目录'
        : activeTab === 'tokens'
          ? '令牌管理'
          : '账户中心';

  const subpageView = subpageRendered ? (
    <Animated.View style={[styles.subpageOverlay, styles.subpageShadow, overlayStyle]}>
      <SafeAreaView style={styles.subpagePane} edges={['top', 'left', 'right']}>
        <StatusBar style="dark" />
        {subpageRendered === 'logs' ? (
          <UsageLogsScreen logs={initialSnapshot.logs} onBack={() => setSubpage(null)} />
        ) : null}
        {subpageRendered === 'tasks' ? (
          <TasksScreen
            tasks={tasks}
            onBack={() => setSubpage(null)}
            onCancel={cancelTask}
            onRetry={retryTask}
          />
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
            onCreateTask={createMediaTask}
          />
        ) : null}
        {subpageRendered === 'experience' ? (
          <ModelExperienceScreen onBack={() => setSubpage(null)} />
        ) : null}
        {subpageRendered === 'face' ? <FaceToolsScreen onBack={() => setSubpage(null)} /> : null}
        {subpageRendered === 'fusion' ? <FusionScreen onBack={() => setSubpage(null)} /> : null}
        {subpageRendered === 'pricing' ? (
          <ModelMarketplaceScreen onBack={() => setSubpage(null)} />
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
        <StatusBar style="dark" />
        <View style={styles.appShell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>阡陌数智 · 演示</Text>
            <Animated.Text style={[styles.title, titleStyle]}>{activeTab === 'chat' ? '聊天' : currentTitle}</Animated.Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>模拟数据</Text>
          </View>
        </View>

        <Animated.View style={[styles.content, sceneStyle]}>
          <View style={{ flex: 1, display: activeTab === 'chat' ? 'flex' : 'none' }}>
            <ChatWorkspace bottomInset={76} onOpenTool={setSubpage} />
          </View>
          {activeTab === 'overview' ? (
            <Overview
              activeTokens={activeTokens}
              metrics={metrics}
              availableModels={availableModels}
              usagePercent={usagePercent}
              usageRange={usageRange}
              onRangeChange={setUsageRange}
              onScroll={handleTabScroll}
              onOpenModels={() => setActiveTab('models')}
              onOpenTokens={() => setActiveTab('tokens')}
              onOpenLogs={() => setSubpage('logs')}
              onOpenTasks={() => setSubpage('tasks')}
              onOpenMessages={() => setSubpage('messages')}
              onOpenMedia={() => setSubpage('media')}
              onOpenExperience={() => setSubpage('experience')}
              onOpenFace={() => setSubpage('face')}
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
              tokens={tokens}
              onOpen={setSelectedToken}
              onToggle={toggleToken}
              onCreate={openCreateToken}
              onScroll={handleTabScroll}
            />
          ) : null}

          {activeTab === 'account' ? (
            <AccountView
              account={initialSnapshot.account}
              onOpenPersonal={() => setSubpage('personal')}
              onOpenWallet={() => setSubpage('wallet')}
              onScroll={handleTabScroll}
            />
          ) : null}
        </Animated.View>
        </View>

        <TokenModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onEdit={openEditToken}
          onDelete={deleteToken}
        />
        <TokenFormModal
          key={`${editingToken?.id ?? 'new'}-${tokenFormSession}`}
          visible={tokenFormVisible}
          initial={editingToken}
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
  usageRange,
  onRangeChange,
  onScroll,
  onOpenModels,
  onOpenTokens,
  onOpenLogs,
  onOpenTasks,
  onOpenMessages,
  onOpenMedia,
  onOpenExperience,
  onOpenFace,
  onOpenFusion,
  onOpenPricing,
}: {
  activeTokens: number;
  metrics: OverviewMetrics;
  availableModels: string;
  usagePercent: number;
  usageRange: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  onScroll: TabScrollHandler;
  onOpenModels: () => void;
  onOpenTokens: () => void;
  onOpenLogs: () => void;
  onOpenTasks: () => void;
  onOpenMessages: () => void;
  onOpenMedia: () => void;
  onOpenExperience: () => void;
  onOpenFace: () => void;
  onOpenFusion: () => void;
  onOpenPricing: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}

      onScroll={onScroll}
      scrollEventThrottle={16}
    >
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
            <Text style={styles.panelLabel}>请求次数</Text>
            <Text style={styles.heroMetric}>{metrics.requests}</Text>
          </View>
          <Text style={styles.mutedText}>成功率 {metrics.reliability}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${usagePercent}%` }]} />
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.mutedText}>{metrics.totalUsage.toLocaleString()} 已使用</Text>
          <Text style={styles.mutedText}>{metrics.totalQuota.toLocaleString()} 总额度</Text>
        </View>
      </View>

      <View style={styles.gridTwo}>
        <StatBlock label="可用模型" value={availableModels} tone="blue" />
        <StatBlock label="启用令牌" value={`${activeTokens}`} tone="green" />
        <StatBlock label="平均延迟" value={metrics.averageLatency} tone="amber" />
        <StatBlock label="异常队列" value={`${metrics.issueCount}`} tone="rose" />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>快捷访问</Text>
      </View>
      <View style={styles.actionList}>
        <QuickAction
          symbol="square.stack.3d.up"
          icon="▦"
          title="模型目录"
          onPress={onOpenModels}
        />
        <QuickAction
          symbol="key"
          icon="◇"
          title="API 令牌"
          onPress={onOpenTokens}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>AI 功能</Text>
      </View>
      <View style={styles.actionList}>
        <QuickAction
          symbol="sparkles"
          icon="✦"
          title="AI 创作"
          onPress={onOpenMedia}
        />
        <QuickAction
          symbol="text.bubble"
          icon="◇"
          title="模型体验"
          onPress={onOpenExperience}
        />
        <QuickAction
          symbol="person.crop.square"
          icon="◎"
          title="人脸工具"
          onPress={onOpenFace}
        />
        <QuickAction
          symbol="arrow.triangle.merge"
          icon="◈"
          title="模型融合"
          onPress={onOpenFusion}
        />
        <QuickAction
          symbol="square.grid.2x2"
          icon="▦"
          title="模型广场"
          onPress={onOpenPricing}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>用量与消息</Text>
      </View>
      <View style={styles.actionList}>
        <QuickAction
          symbol="doc.text.magnifyingglass"
          icon="▤"
          title="用量日志"
          onPress={onOpenLogs}
        />
        <QuickAction
          symbol="square.stack.3d.up"
          icon="◫"
          title="任务"
          onPress={onOpenTasks}
        />
        <QuickAction
          symbol="bell"
          icon="✉"
          title="消息"
          onPress={onOpenMessages}
        />
      </View>
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
  return (
    <View style={styles.splitContent}>
      <View style={styles.modelsSearchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索模型、厂商或标签"
          placeholderTextColor="#7A828A"
          style={styles.searchInput}
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.modelList}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {filteredModels.map((model) => {
          const selected = selectedModel?.id === model.id;
          return (
            <Pressable
              key={model.id}
              onPress={() => setSelectedModel(model)}
              style={[styles.modelRow, selected ? styles.modelRowSelected : null]}
            >
              <View style={styles.modelRowIdentity}>
                <ModelLogo name={model.name} size={30} />
                <View style={styles.modelRowMain}>
                  <Text style={styles.modelName}>{model.name}</Text>
                  <Text style={styles.modelVendor}>{model.vendor}</Text>
                </View>
              </View>
              <View style={[styles.pill, { borderColor: statusColor[model.status] }]}>
                <Text style={[styles.pillText, { color: statusColor[model.status] }]}>
                  {statusLabel[model.status]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Modal visible={selectedModel !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedModel(null)}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
          <SheetHeader title="模型详情" onClose={() => setSelectedModel(null)} />
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
          {statusLabel[model.status]}
        </Text>
      </View>
      <View style={styles.detailStats}>
        <MiniStat label="上下文" value={model.context} />
        <MiniStat label="延迟" value={model.latency} />
        <MiniStat label="成本" value={model.price} />
      </View>
      <View style={styles.billingGrid}>
        <SettingsRow label="路由" value={model.route} />
        <SettingsRow label="输入费率" value={model.inputRate} />
        <SettingsRow label="输出费率" value={model.outputRate} />
        <SettingsRow label="健康检查" value={model.updatedAt} />
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
    <ScrollView
      contentContainerStyle={styles.scrollContent}

      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <Pressable accessibilityRole="button" onPress={onCreate} style={styles.primaryButton}>
        <Text style={styles.primaryButtonIcon}>＋</Text>
        <Text style={styles.primaryButtonText}>新建模拟令牌</Text>
      </Pressable>
      {tokens.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>暂无令牌</Text>
          <Text style={styles.modelVendor}>创建一个模拟令牌后，可以验证移动端详情、暂停和限额交互。</Text>
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
                  <Text style={styles.modelVendor}>{token.owner}</Text>
                </View>
                <Text style={[styles.statusText, { color: statusColor[token.status] }]}>
                  {tokenStatusLabel[token.status]}
                </Text>
              </View>
              <Text style={styles.scopeText}>{token.scope}</Text>
              <View style={styles.progressTrackCompact}>
                <View style={[styles.progressFillCompact, { width: `${percent}%` }]} />
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.mutedText}>{percent}% 已使用</Text>
                <Text style={styles.mutedText}>{token.lastUsed}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => onToggle(token.id)}
              disabled={token.status === 'expired'}
              style={[styles.secondaryButton, token.status === 'expired' ? styles.buttonDisabled : null]}
            >
              <Text style={styles.secondaryButtonText}>
                {token.status === 'active' ? '暂停' : token.status === 'paused' ? '启用' : '不可用'}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function AccountView({
  account,
  onOpenPersonal,
  onOpenWallet,
  onScroll,
}: {
  account: AccountSummary;
  onOpenPersonal: () => void;
  onOpenWallet: () => void;
  onScroll: TabScrollHandler;
}) {
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
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>K</Text>
        </View>
        <View style={styles.accountHeaderMain}>
          <Text style={styles.accountName}>kira</Text>
          <Text style={styles.modelVendor}>普通用户 · ID 493</Text>
        </View>
        <Text style={styles.accountBalance}>¥278.44</Text>
        {Platform.OS === 'ios' ? (
          <SymbolView name="chevron.right" tintColor="#C7C7CC" style={styles.accountChevron} />
        ) : (
          <Text style={styles.accountChevronText}>›</Text>
        )}
      </Pressable>

      <Group>
        <Row title="当前计划" value={account.plan} />
        <Row title="账单状态" value={account.balance} />
        <Row title="API 端点" value={account.endpoint} />
        <Row title="移动端模式" value={account.mode} />
      </Group>
      <Group header="账户">
        <Row title="个人设置" chevron icon="person.crop.circle" onPress={onOpenPersonal} />
        <Row title="钱包" chevron icon="creditcard" onPress={onOpenWallet} />
      </Group>

      <View style={styles.noticePanel}>
        <Text style={styles.noticeTitle}>关于演示模式</Text>
        <Text style={styles.noticeCopy}>
          当前显示示例数据，修改仅在本次运行中生效。账户登录与网站业务同步尚未接入。
        </Text>
      </View>
    </ScrollView>
  );
}

function TokenModal({
  token,
  onClose,
  onEdit,
  onDelete,
}: {
  token: Token | null;
  onClose: () => void;
  onEdit: (token: Token) => void;
  onDelete: (token: Token) => void;
}) {
  if (!token) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.detailTitle}>{token.name}</Text>
              <Text style={styles.modelVendor}>{token.owner}</Text>
            </View>
            <GlassIconButton
              icon="xmark"
              fallback="×"
              label="关闭令牌详情"
              onPress={onClose}
              size={32}
              tint="#6C6C70"
            />
          </View>
          <View style={styles.detailStats}>
            <MiniStat label="用量" value={token.usage.toLocaleString()} />
            <MiniStat label="限额" value={token.quota.toLocaleString()} />
            <MiniStat label="状态" value={tokenStatusLabel[token.status]} />
          </View>
          <SettingsRow label="Scope" value={token.scope} />
          <SettingsRow label="最后使用" value={token.lastUsed} />

          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDelete(token)}
              style={[styles.secondaryActionButton, styles.destructiveOutline]}
            >
              <Text style={[styles.secondaryButtonText, styles.destructiveText]}>删除</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onEdit(token)}
              style={styles.primaryActionButton}
            >
              <Text style={styles.primaryButtonText}>编辑</Text>
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
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initial: Token | null;
  onCancel: () => void;
  onSubmit: (draft: NewTokenDraft) => void;
}) {
  const [name, setName] = useState(initial?.name ?? 'Mobile client');
  const [owner, setOwner] = useState(initial?.owner ?? 'Wenze');
  const [scope, setScope] = useState(initial?.scope ?? 'models:read');
  const [quota, setQuota] = useState(String(initial?.quota ?? 10000));

  const parsedQuota = Number.parseInt(quota, 10);
  const canSubmit =
    name.trim().length > 0 &&
    owner.trim().length > 0 &&
    scope.trim().length > 0 &&
    parsedQuota > 0;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit({
      name: name.trim(),
      owner: owner.trim(),
      scope: scope.trim(),
      quota: parsedQuota,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.detailTitle}>{initial ? '编辑令牌' : '新建模拟令牌'}</Text>
              <Text style={styles.modelVendor}>
                {initial ? '仅更新本地演示状态' : '仅写入本地状态，不生成真实凭证'}
              </Text>
            </View>
            <GlassIconButton
              icon="xmark"
              fallback="×"
              label="关闭令牌编辑"
              onPress={onCancel}
              size={32}
              tint="#6C6C70"
            />
          </View>

          <View style={styles.formStack}>
            <FieldInput label="名称" value={name} onChangeText={setName} />
            <FieldInput label="负责人" value={owner} onChangeText={setOwner} />
            <FieldInput label="权限范围" value={scope} onChangeText={setScope} />
            <FieldInput
              label="月限额"
              value={quota}
              onChangeText={setQuota}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondaryActionButton}>
              <Text style={styles.secondaryButtonText}>取消</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={submit}
              style={[styles.primaryActionButton, !canSubmit ? styles.buttonDisabled : null]}
            >
              <Text style={styles.primaryButtonText}>{initial ? '保存' : '创建'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldInput({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#7A828A"
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
    <Pressable onPress={onPress} style={styles.quickAction}>
      {Platform.OS === 'ios' ? (
        <SymbolView name={symbol} tintColor="#007AFF" style={styles.quickSymbol} />
      ) : (
        <Text style={styles.quickIcon}>{icon}</Text>
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

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F9',
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
    backgroundColor: '#F2F2F7',
  },
  subpagePane: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  subpageShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.14,
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
  eyebrow: {
    color: '#66707A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
  },
  title: {
    color: '#111418',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 0,
  },
  liveBadge: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#CCD3DA',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#26A269',
  },
  liveText: {
    color: '#30363D',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 96,
    gap: 16,
  },
  rangeSwitch: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D2D8DE',
    backgroundColor: '#FFFFFF',
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  rangeButton: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeButtonActive: {
    backgroundColor: '#15191E',
  },
  rangeButtonText: {
    color: '#69737D',
    fontSize: 13,
    fontWeight: '800',
  },
  rangeButtonTextActive: {
    color: '#FFFFFF',
  },
  heroPanel: {
    borderRadius: 8,
    padding: 18,
    backgroundColor: '#111418',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelLabel: {
    color: '#B9C0C8',
    fontSize: 13,
    fontWeight: '700',
  },
  heroMetric: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  scoreRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 6,
    borderColor: '#58C7A8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#343A42',
    overflow: 'hidden',
    marginTop: 18,
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#58C7A8',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  mutedText: {
    color: '#69737D',
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
    minHeight: 96,
    borderRadius: 8,
    padding: 14,
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  statBlock_blue: {
    backgroundColor: '#EEF6FC',
    borderColor: '#C9DEEE',
  },
  statBlock_green: {
    backgroundColor: '#EEF8F2',
    borderColor: '#C7E6D3',
  },
  statBlock_amber: {
    backgroundColor: '#FFF7E8',
    borderColor: '#EED9AA',
  },
  statBlock_rose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#EFCAD0',
  },
  statLabel: {
    color: '#69737D',
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: '#15191E',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionHeader: {
    marginTop: 2,
  },
  sectionTitle: {
    color: '#15191E',
    fontSize: 18,
    fontWeight: '800',
  },
  actionList: {
    gap: 10,
  },
  quickAction: {
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DEE4',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickIcon: {
    width: 36,
    color: '#286E8F',
    fontSize: 26,
    fontWeight: '800',
  },
  quickSymbol: {
    width: 34,
    height: 26,
  },
  quickBody: {
    flex: 1,
  },
  quickTitle: {
    color: '#15191E',
    fontSize: 16,
    fontWeight: '800',
  },
  chevron: {
    color: '#8A929B',
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
  searchInput: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D2D8DE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#15191E',
    fontSize: 16,
  },
  modelList: {
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 96,
  },
  modelRow: {
    minHeight: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9DEE4',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelRowSelected: {
    borderColor: '#2E7EA5',
    backgroundColor: '#F1F8FC',
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
    color: '#15191E',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  modelVendor: {
    color: '#69737D',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  pill: {
    minWidth: 58,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  detailSheetContent: { padding: 16, paddingBottom: 40 },
  detailPanel: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DEE4',
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailTitle: {
    color: '#15191E',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E5EA',
    backgroundColor: '#FBFCFD',
    overflow: 'hidden',
    marginTop: 14,
  },
  miniStat: {
    flex: 1,
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: '#F6F7F9',
    padding: 10,
    justifyContent: 'space-between',
  },
  miniValue: {
    color: '#15191E',
    fontSize: 17,
    fontWeight: '800',
  },
  detailNote: {
    color: '#30363D',
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
    borderRadius: 14,
    backgroundColor: '#EEF1F4',
    color: '#4D5964',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#15191E',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonIcon: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '500',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyState: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9DEE4',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  emptyTitle: {
    color: '#15191E',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 5,
  },
  tokenCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9DEE4',
    backgroundColor: '#FFFFFF',
    padding: 14,
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
    color: '#15191E',
    fontSize: 17,
    fontWeight: '800',
  },
  scopeText: {
    color: '#30363D',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  progressTrackCompact: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E4E8EC',
    overflow: 'hidden',
  },
  progressFillCompact: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2E7EA5',
  },
  secondaryButton: {
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CCD3DA',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: '#15191E',
    fontSize: 14,
    fontWeight: '800',
  },
  accountHeader: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DEE4',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accountHeaderPressed: {
    backgroundColor: '#F2F2F7',
  },
  accountHeaderMain: {
    flex: 1,
    gap: 2,
  },
  accountBalance: {
    color: '#15191E',
    fontSize: 17,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  accountChevron: { width: 8, height: 14 },
  accountChevronText: { color: '#C7C7CC', fontSize: 18 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E7EA5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  accountName: {
    color: '#15191E',
    fontSize: 18,
    fontWeight: '800',
  },
  settingsList: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DEE4',
    overflow: 'hidden',
  },
  settingsRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D9DEE4',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingsLabel: {
    color: '#4D5964',
    fontSize: 14,
    fontWeight: '700',
  },
  settingsValue: {
    flex: 1,
    color: '#15191E',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  noticePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D9DEE4',
    backgroundColor: '#FFF7E8',
    padding: 16,
  },
  noticeTitle: {
    color: '#15191E',
    fontSize: 16,
    fontWeight: '800',
  },
  noticeCopy: {
    color: '#4D5964',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 20, 24, 0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#FFFFFF',
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
    color: '#4D5964',
    fontSize: 13,
    fontWeight: '800',
  },
  formInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D2D8DE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    color: '#15191E',
    fontSize: 16,
    fontWeight: '600',
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
    borderColor: '#CCD3DA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveOutline: {
    borderColor: '#B3404A',
  },
  destructiveText: {
    color: '#B3404A',
  },
  primaryActionButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#15191E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4DAE0',
    marginBottom: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF1F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#30363D',
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '500',
  },
});

// iOS follows inset grouped lists and system typography; Android retains its own baseline.
const iosStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  title: { color: '#000', fontSize: 34, fontWeight: '700', letterSpacing: 0.3 },
  eyebrow: { color: '#8E8E93', fontSize: 13, marginBottom: 5 },
  liveBadge: { padding: 8 }, liveDot: { width: 0, height: 0 },
  liveText: { color: '#8E8E93', fontSize: 12 },
  heroPanel: { backgroundColor: '#FFFFFF', borderRadius: 12, borderCurve: 'continuous', padding: 16 },
  panelLabel: { color: '#3C3C43', fontSize: 15 },
  heroMetric: { color: '#000', fontSize: 34, fontWeight: '600', marginTop: 4 },
  heroCopy: { color: '#8E8E93', fontSize: 13, lineHeight: 19, marginTop: 8 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#E5E5EA', overflow: 'hidden', marginTop: 16 },
  progressFill: { height: 4, backgroundColor: '#007AFF' },
  gridTwo: { backgroundColor: '#FFF', borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  statBlock: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#C6C6C8' },
  statBlock_blue: {}, statBlock_green: {}, statBlock_amber: {}, statBlock_rose: {},
  statLabel: { color: '#000', fontSize: 17 },
  statValue: { color: '#8E8E93', fontSize: 17, fontWeight: '400' },
  sectionTitle: { color: '#6D6D72', fontSize: 13, fontWeight: '400', marginLeft: 0, marginTop: 8 },
  actionList: { backgroundColor: '#FFF', borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  quickAction: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(60,60,67,0.29)' },
  quickTitle: { color: '#000', fontSize: 17, fontWeight: '400' },
  quickIcon: { width: 34, fontSize: 23, color: '#007AFF' },
  searchInput: { minHeight: 40, borderRadius: 10, backgroundColor: '#E5E5EA', paddingHorizontal: 12, color: '#000', fontSize: 17 },
  modelName: { color: '#000', fontSize: 17, fontWeight: '600', marginBottom: 4 },
  modelRowSelected: { borderColor: '#007AFF', backgroundColor: '#FFF' },
  noticePanel: { paddingHorizontal: 16, paddingTop: 4, backgroundColor: 'transparent' },
  noticeTitle: { fontSize: 13, color: '#6D6D72', fontWeight: '400' },
  noticeCopy: { fontSize: 13, color: '#8E8E93', lineHeight: 19, marginTop: 6 },
  detailTitle: { fontSize: 22, fontWeight: '600' },
  formLabel: { color: '#6C6C70', fontSize: 13, fontWeight: '400' },
  formInput: { minHeight: 46, borderRadius: 10, borderWidth: 0, backgroundColor: '#F2F2F7', paddingHorizontal: 12, color: '#000', fontSize: 17, fontWeight: '400' },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: '#007AFF', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  primaryActionButton: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center' },
  secondaryActionButton: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#C6C6C8', alignItems: 'center', justifyContent: 'center' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  settingsLabel: { fontSize: 17, color: '#000', fontWeight: '400' },
  settingsValue: { flex: 1, fontSize: 17, color: '#8E8E93', textAlign: 'right' },
  accountHeader: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  accountHeaderPressed: { backgroundColor: '#F2F2F7' },
  accountName: { fontSize: 20, fontWeight: '600' },
  accountBalance: { fontSize: 17, fontWeight: '600' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 23, fontWeight: '600' },
  settingsList: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  settingsRow: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.29)',
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
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  modelRow: {
    minHeight: 72,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tokenTitle: { fontSize: 17, fontWeight: '600' },
  scopeText: { color: '#6C6C70', fontSize: 15, fontWeight: '400', lineHeight: 20 },
  mutedText: { color: '#8E8E93', fontSize: 13, fontWeight: '400' },
  statusText: { fontSize: 15, fontWeight: '400' },
  progressTrackCompact: { height: 4, borderRadius: 2, backgroundColor: '#E5E5EA' },
  progressFillCompact: { height: 4, borderRadius: 2, backgroundColor: '#007AFF' },
  secondaryButton: {
    height: 40,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 0,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  secondaryButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '500' },
  emptyState: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  detailPanel: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
});
const styles = Platform.OS === 'ios' ? { ...baseStyles, ...iosStyles } : baseStyles;
