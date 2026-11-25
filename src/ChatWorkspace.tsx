import { BlurView, BlurTargetView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactElement, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextInputInstance,
  type ViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { ModelLogo } from './components/ModelLogo';
import { pickRecommendedModels } from './recommendedModels';
import {
  appendMessage,
  createConversation as createConversationRequest,
  deleteConversation as deleteConversationRequest,
  fetchConversationMessages,
  fetchConversations,
} from './api/endpoints';
import { isUnauthorized, streamChat } from './api/client';
import type { ChatConversation } from './api/types';
import type { Model } from './types';
import { AlphabetRail, GlassIconButton, GlassSurface, SheetHeader, palette } from './ui';
import { AppIcon } from './components/AppIcon';
import { elevation, m3, shape } from './material';
import { isDark, themedStyles } from './theme';
import { RichText, plainText } from './richText';
import { formatMessageTime } from './messageTime';
import { alphabetOf, letterOf, sortByName } from './modelSort';
import { useKeyboardInsets } from './useKeyboardInsets';
import { isEnglish, t, tf } from './i18n';

// masked-view 的旧声明依赖已移除的 NativeMethods，限定为它实际支持的 props。
const MaskedView = NativeMaskedView as unknown as ComponentType<ViewProps & {
  maskElement: ReactElement;
  androidRenderingMode?: 'software' | 'hardware';
}>;

const ios = Platform.OS === 'ios';


type ChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  modelId?: string;
  createdAt?: number;
};

type Conversation = {
  id: number;
  title: string;
  messages: ChatMessage[];
  modelId: string;
  updatedAt: number;
  loaded?: boolean;
};

const seedConversations: Conversation[] = [];

const fallbackModel: Model = {
  id: '',
  name: t('选择模型'),
  vendor: '',
  tags: [],
  note: '',
  groups: [],
  groupLabel: '—',
  inputRate: '—',
  outputRate: '—',
  updatedAt: '—',
};

function toConversation(item: ChatConversation): Conversation {
  const updatedAt = Date.parse(item.UpdatedAt);
  return {
    id: item.ID,
    title: item.Title?.trim() || tf('对话 {0}', item.ID),
    modelId: item.Model || '',
    updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt,
    messages: [],
    loaded: false,
  };
}

export type ChatToolKey = 'media' | 'experience' | 'fusion' | 'pricing';

// 文案随语言切换，必须在渲染时求值。
function buildChatTools(): {
  key: ChatToolKey;
  icon: ComponentProps<typeof SymbolView>['name'];
  fallback: string;
  label: string;
}[] {
  return [
    { key: 'media', icon: 'sparkles', fallback: '✦', label: t('AI 创作') },
    { key: 'experience', icon: 'text.bubble', fallback: '◌', label: t('模型体验') },
    { key: 'fusion', icon: 'arrow.triangle.merge', fallback: '◈', label: t('模型融合') },
    { key: 'pricing', icon: 'square.grid.2x2', fallback: '▦', label: t('模型广场') },
  ];
}

export function ChatWorkspace({
  bottomInset = 0,
  onOpenTool,
  models,
  active = true,
}: {
  bottomInset?: number;
  onOpenTool?: (tool: ChatToolKey) => void;
  models: Model[];
  /** 切到其他标签页时页面仍挂载，需要收起弹层，回来时不会残留。 */
  active?: boolean;
}) {
  // 文案随语言切换，放在渲染期求值。
  const chatTools = buildChatTools();
  const suggestions = [
    t('帮我总结一段技术文档'),
    t('解释一个概念并给出例子'),
    t('把这段话润色得更专业'),
  ];

  const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  // 编辑用户消息：保留被编辑的消息 id，发送时从该条开始截断并重新生成回复。
  const [editing, setEditing] = useState<{ id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [modelQuery, setModelQuery] = useState('');
  // A-Z 索引需要知道每行在滚动内容里的位置，用 onLayout 记录。
  const popoverRowOffsets = useRef<Record<number, number>>({});
  const [modelAnchor, setModelAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [toolsVisible, setToolsVisible] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState({ x: 111, y: 170, width: 228, height: 36 });
  const { visible: keyboardVisible, inset: keyboardInset } = useKeyboardInsets(true);
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // 渐变模糊只在键盘弹出、输入条上移后淡入；收起键盘时淡出，避免静态页面出现色带。
  const blurTarget = useRef<ComponentRef<typeof View>>(null);
  const composerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(composerFade, {
      toValue: keyboardVisible ? 1 : 0,
      duration: keyboardVisible ? 220 : 150,
      // 等输入条随键盘上移落位后再淡入，避免两层动画同时开始显得生硬。
      delay: keyboardVisible ? 90 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [composerFade, keyboardVisible]);

  // 键盘开合都会改变输入条位置，工具菜单直接关闭，避免停在旧位置。
  // 模型弹层里有搜索框，键盘弹出不能关掉；改成重新量一次页面尺寸让弹层跟着上移。
  useEffect(() => {
    setToolsVisible(false);
    if (!modelPickerVisible) return;
    const root = rootRef.current;
    if (!root) return;
    root.measureInWindow((_x, _y, width, height) => setPopoverBounds({ width, height }));
  }, [keyboardVisible, modelPickerVisible]);

  useEffect(() => {
    if (active) return;
    setToolsVisible(false);
    setModelPickerVisible(false);
  }, [active]);

  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const threadAnim = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const modelButton = useRef<ComponentRef<typeof View>>(null);
  const toolsButton = useRef<ComponentRef<typeof View>>(null);
  // 弹层不再走 Modal：Modal 会抢走焦点，键盘随之收起，输入条下移后锚点也失效。
  // 改为在当前页面内绝对定位，坐标按页面自身换算，键盘保持原样。
  const [popoverBounds, setPopoverBounds] = useState({ width: 0, height: 0 });

  const current = conversations.find((item) => item.id === selected);
  const currentModelId = current?.modelId ?? selectedModelId;
  const currentModel = models.find((model) => model.id === currentModelId) ?? models[0] ?? fallbackModel;
  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  // 模型选择列表统一按名称排序，搜索命中的范围是名称和厂商。
  const pickerModels = useMemo(() => {
    const keyword = modelQuery.trim().toLowerCase();
    const sorted = sortByName(models);
    if (!keyword) return sorted;
    return sorted.filter((model) =>
      `${model.name} ${model.vendor}`.toLowerCase().includes(keyword),
    );
  }, [models, modelQuery]);

  const pickerLetters = useMemo(
    () => alphabetOf(pickerModels.map((model) => model.name)),
    [pickerModels],
  );

  // 推荐位固定在列表最顶部；搜索时隐藏，避免和过滤结果混在一起。
  const recommended = useMemo(() => pickRecommendedModels(models), [models]);

  const letterIndex = (letter: string) =>
    pickerModels.findIndex((model) => letterOf(model.name) === letter);

  const popoverOffsetFor = (letter: string) => {
    const index = letterIndex(letter);
    return index < 0 ? undefined : popoverRowOffsets.current[index];
  };

  const stop = () => {
    generation.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  // 模型列表晚于聊天页到达时，补一个默认模型。
  useEffect(() => {
    if (!models.length) return;
    setSelectedModelId((current) => (models.some((model) => model.id === current) ? current : models[0].id));
  }, [models]);

  // 会话列表：进入页面、切回聊天标签、App 回到前台、打开历史时都拉一次，
  // 网页端新建的对话才能出现在这里。只合并，不删本地内容。
  const selectedRef = useRef<number | null>(null);
  const refreshing = useRef(0);
  // 本地刚新建、服务端列表可能还没返回的会话（id -> 创建时间）。
  const pendingCreated = useRef<Map<number, number>>(new Map());

  const refreshConversations = useCallback(async () => {
    const ticket = ++refreshing.current;
    try {
      const page = await fetchConversations(50, 0);
      // 期间又发起了新的刷新，丢掉这次的结果。
      if (refreshing.current !== ticket) return;
      const incoming = (page.items ?? []).map(toConversation);
      setConversations((prev) => {
        const local = new Map(prev.map((item) => [item.id, item]));
        const merged = incoming.map((item) => {
          const existing = local.get(item.id);
          if (!existing) return item;
          // 其他端改过的会话：清掉本地缓存，打开时重新拉消息；
          // 当前打开的会话不动，避免把正在显示的回复清空。
          const changedElsewhere = item.updatedAt > existing.updatedAt && item.id !== selectedRef.current;
          return {
            ...item,
            messages: changedElsewhere ? [] : existing.messages,
            loaded: changedElsewhere ? false : existing.loaded,
          };
        });
        const seen = new Set(incoming.map((item) => item.id));
        for (const id of seen) pendingCreated.current.delete(id);
        // 服务端列表里还没有、但确实是刚在本地新建的会话，先留着；
        // 其余不在列表里的（例如网页端删掉了）随之移除。
        const now = Date.now();
        const pending = prev.filter((item) => {
          if (seen.has(item.id)) return false;
          const createdAt = pendingCreated.current.get(item.id);
          if (createdAt === undefined) return false;
          if (now - createdAt > 20000) {
            pendingCreated.current.delete(item.id);
            return false;
          }
          return true;
        });
        return [...merged, ...pending];
      });
    } catch {
      // 刷新失败保持现有列表，不影响已加载的对话。
    }
  }, []);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // 进入聊天页（首次挂载时 active 已经是 true）与从其他标签页切回来。
  useEffect(() => {
    if (active) refreshConversations();
  }, [active, refreshConversations]);

  // App 从后台回到前台（例如在网页端聊完再切回来）。
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshConversations();
    });
    return () => subscription.remove();
  }, [refreshConversations]);

  const openHistory = () => {
    setHistoryVisible(true);
    refreshConversations();
  };

  // 切换/新建会话时，消息区淡入并轻微上移，避免内容硬切。
  const playThreadTransition = () => {
    threadAnim.setValue(0);
    Animated.timing(threadAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const openConversation = (id: number) => {
    stop();
    const conversation = conversations.find((item) => item.id === id);
    setSelected(id);
    if (conversation?.modelId) setSelectedModelId(conversation.modelId);
    setDraft('');
    setEditing(null);
    setHistoryVisible(false);
    playThreadTransition();
    if (conversation && !conversation.loaded) {
      fetchConversationMessages(id, 100, 0)
        .then((page) => {
          const messages: ChatMessage[] = (page.items ?? []).map((item) => ({
            id: item.ID,
            role: item.Role === 'assistant' ? 'assistant' : 'user',
            text: item.Content ?? '',
            modelId: item.Model || conversation.modelId,
            createdAt: Number.isNaN(Date.parse(item.CreatedAt)) ? undefined : Date.parse(item.CreatedAt),
          }));
          setConversations((items) =>
            items.map((entry) => (entry.id === id ? { ...entry, messages, loaded: true } : entry)),
          );
        })
        .catch(() => undefined);
    }
  };

  const startNewConversation = () => {
    stop();
    setSelected(null);
    setDraft('');
    setEditing(null);
    setHistoryVisible(false);
    playThreadTransition();
  };

  const chooseModel = (model: Model) => {
    setSelectedModelId(model.id);
    if (selected !== null) {
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === selected ? { ...conversation, modelId: model.id } : conversation,
        ),
      );
    }
    closeModelPicker();
  };

  // 把某个元素的位置换算成聊天页内部坐标，同时记录页面尺寸，供弹层做边界判断。
  const measureInPage = (
    target: ComponentRef<typeof View> | null,
    onMeasured: (anchor: { x: number; y: number; width: number; height: number }) => void,
  ) => {
    const root = rootRef.current;
    if (!target || !root) return;
    target.measureInWindow((x, y, width, height) => {
      root.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
        setPopoverBounds({ width: rootWidth, height: rootHeight });
        onMeasured({ x: x - rootX, y: y - rootY, width, height });
      });
    });
  };

  const closeModelPicker = () => {
    setModelPickerVisible(false);
    setModelQuery('');
  };

  const openModelPicker = () => {
    setModelQuery('');
    // 双端都是锚定在选择框下方的浮层，先量位置再打开。
    measureInPage(modelButton.current, (anchor) => {
      setModelAnchor(anchor);
      setModelPickerVisible(true);
    });
  };

  const openTools = () => {
    measureInPage(toolsButton.current, (anchor) => {
      setToolsAnchor(anchor);
      setToolsVisible(true);
    });
  };

  const deleteConversation = (id: number) => {
    Alert.alert(t('删除对话？'), t('删除后无法恢复。'), [
      { text: t('取消'), style: 'cancel' },
      {
        text: t('删除'),
        style: 'destructive',
        onPress: async () => {
          if (selected === id) stop();
          setConversations((items) => items.filter((conversation) => conversation.id !== id));
          if (selected === id) setSelected(null);
          try {
            await deleteConversationRequest(id);
          } catch {
            // 服务端删除失败时重新拉取，保持列表与后端一致
            fetchConversations(50, 0)
              .then((page) => setConversations((page.items ?? []).map(toConversation)))
              .catch(() => undefined);
          }
        },
      },
    ]);
  };

  const send = async (preset?: string, editTargetId?: number) => {
    const prompt = (preset ?? draft).trim();
    if (!prompt || busy || !currentModel) return;
    if (!currentModel.id) {
      Alert.alert(t('请先选择模型'));
      return;
    }

    const model = currentModel;
    let conversationId = selected;
    const request = ++generation.current;
    const now = Date.now();
    const userMessage: ChatMessage = { id: Date.now(), role: 'user', text: prompt, createdAt: now };
    const assistantId = userMessage.id + 1;

    // 编辑用户消息时，从被编辑的那一条开始截断，后面所有回复都重新生成。
    const existingMessages =
      conversationId === null
        ? []
        : conversations.find((item) => item.id === conversationId)?.messages ?? [];
    const editIndex =
      editTargetId === undefined
        ? -1
        : existingMessages.findIndex((message) => message.id === editTargetId);
    const truncatedMessages = editIndex >= 0 ? existingMessages.slice(0, editIndex) : existingMessages;
    const historyMessages = editTargetId !== undefined ? truncatedMessages : existingMessages;

    setDraft('');
    setEditing(null);
    setBusy(true);

    try {
      if (conversationId === null) {
        const created = await createConversationRequest(
          prompt.length > 22 ? `${prompt.slice(0, 22)}…` : prompt,
          model.id,
        );
        conversationId = created.ID;
        const newConversation: Conversation = {
          id: created.ID,
          title: created.Title || prompt.slice(0, 22),
          modelId: model.id,
          updatedAt: now,
          messages: [userMessage],
          loaded: true,
        };
        pendingCreated.current.set(created.ID, Date.now());
        setConversations((items) => [newConversation, ...items]);
        setSelected(created.ID);
      } else {
        const target = conversationId;
        setConversations((items) =>
          items.map((conversation) =>
            conversation.id === target
              ? {
                  ...conversation,
                  modelId: model.id,
                  updatedAt: now,
                  messages: [...truncatedMessages, userMessage],
                }
              : conversation,
          ),
        );
      }

      const activeId = conversationId;
      appendMessage(activeId, 'user', prompt).catch(() => undefined);

      const history = historyMessages
        .filter((message) => message.text.trim())
        .map((message) => ({ role: message.role, content: message.text }));
      const payloadMessages = [...history, { role: 'user' as const, content: prompt }];

      const controller = new AbortController();
      abortRef.current = controller;
      let accumulated = '';

      const updateAssistant = (text: string) => {
        setConversations((items) =>
          items.map((conversation) => {
            if (conversation.id !== activeId) return conversation;
            const hasReply = conversation.messages.some((message) => message.id === assistantId);
            return {
              ...conversation,
              updatedAt: Date.now(),
              messages: hasReply
                ? conversation.messages.map((message) =>
                    message.id === assistantId ? { ...message, text } : message,
                  )
                : [
                    ...conversation.messages,
                    {
                      id: assistantId,
                      role: 'assistant' as const,
                      modelId: model.id,
                      text,
                      createdAt: Date.now(),
                    },
                  ],
            };
          }),
        );
      };

      await streamChat(
        { model: model.id, messages: payloadMessages },
        {
          onDelta: (delta) => {
            if (generation.current !== request) return;
            accumulated += delta;
            updateAssistant(accumulated);
          },
          onDone: () => {
            if (generation.current !== request) return;
          },
        },
        controller.signal,
      );

      if (generation.current !== request) return;
      if (accumulated.trim()) {
        appendMessage(activeId, 'assistant', accumulated, { model: model.id }).catch(() => undefined);
      }
      setBusy(false);
    } catch (error) {
      if (generation.current !== request) return;
      if (error instanceof Error && error.name === 'AbortError') {
        setBusy(false);
        return;
      }
      setBusy(false);
      // 401 已经自动回到登录页，不再弹错误框。
      if (isUnauthorized(error)) return;
      Alert.alert(t('发送失败'), error instanceof Error ? error.message : t('请稍后重试'));
      if (conversationId !== null) {
        const target = conversationId;
        setConversations((items) =>
          items.map((conversation) =>
            conversation.id === target ? { ...conversation, messages: existingMessages } : conversation,
          ),
        );
      }
    } finally {
      if (abortRef.current) abortRef.current = null;
    }
  };

  const startEdit = (message: ChatMessage) => {
    if (busy) return;
    setEditing({ id: message.id });
    setDraft(message.text);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };

  const canSend = draft.trim().length > 0 && !busy;

  // 安卓的对话历史是浮层卡片：遮罩淡入、卡片从底部滑上来，关闭时倒放。
  // iOS 继续交给原生 pageSheet 做动画，这里不参与。
  const historyProgress = useRef(new Animated.Value(0)).current;
  const [historyMounted, setHistoryMounted] = useState(historyVisible);

  useEffect(() => {
    if (ios) return;
    if (historyVisible) {
      setHistoryMounted(true);
      Animated.timing(historyProgress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!historyMounted) return;
    Animated.timing(historyProgress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setHistoryMounted(false);
    });
    // 兜底：动画回调被打断时也要卸载，否则透明浮层会一直盖在页面上吃点击。
    const fallback = setTimeout(() => setHistoryMounted(false), 400);
    return () => clearTimeout(fallback);
  }, [historyVisible, historyMounted, historyProgress]);

  const historyContent = (
    <>
      <SheetHeader title={t("对话历史")} onClose={() => setHistoryVisible(false)} />

      <ScrollView
        contentContainerStyle={
          ios
            ? styles.sheetContent
            : [styles.sheetContent, { paddingBottom: 32 + safeAreaInsets.bottom }]
        }
      >
        <Pressable
          accessibilityRole="button"
          onPress={startNewConversation}
          style={({ pressed }) => [styles.newConversation, pressed ? styles.pressed : null]}
        >
          <View style={styles.newConversationIcon}>
            <Icon name="plus.bubble" fallback="＋" size={19} color={palette.blue} />
          </View>
          <Text style={styles.newConversationText}>{t('新建对话')}</Text>
        </Pressable>

        {sortedConversations.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Icon name="bubble.left.and.bubble.right" fallback="◌" size={32} color={palette.tertiaryLabel} />
            <Text style={styles.historyEmptyTitle}>{t('还没有对话')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.groupLabel}>{t('最近')}</Text>
            <View style={styles.historyList}>
              {sortedConversations.map((conversation, index) => {
                const isSelected = selected === conversation.id;
                const model = models.find((item) => item.id === conversation.modelId);
                return (
                  <View
                    key={conversation.id}
                    style={[
                      styles.historyRow,
                      index < sortedConversations.length - 1 ? styles.historyRowBorder : null,
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => openConversation(conversation.id)}
                      style={({ pressed }) => [styles.historyMain, pressed ? styles.pressed : null]}
                    >
                      <View style={styles.historyTop}>
                        <Text numberOfLines={1} style={styles.historyName}>
                          {conversation.title}
                        </Text>
                        {isSelected ? (
                          <Icon name="checkmark" fallback="✓" size={15} color={palette.blue} />
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.historyPreview}>
                        {plainText(
                          conversation.messages[conversation.messages.length - 1]?.text ??
                            conversation.modelId ??
                            t('暂无消息'),
                        )}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {conversation.messages.length} {t('条消息 ·')} {model?.name ?? t('未知模型')} ·{' '}
                        {relativeTime(conversation.updatedAt)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tf('删除 {0}', conversation.title)}
                      onPress={() => deleteConversation(conversation.id)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
                    >
                      <Icon name="trash" fallback="⌫" size={17} color={palette.red} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[
        styles.root,
        { marginBottom: ios
          ? Math.max(bottomInset, keyboardInset - safeAreaInsets.bottom)
          : keyboardVisible ? keyboardInset : bottomInset },
      ]}
    >
      <View style={styles.toolbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("查看对话历史")}
          onPress={openHistory}
          style={({ pressed }) => [styles.toolButton, pressed ? styles.pressed : null]}
        >
          <GlassSurface radius={18} interactive style={styles.toolGlass}>
            <Icon name="clock.arrow.circlepath" fallback="◷" size={17} />
            <Text style={styles.toolLabel}>{t('历史')}</Text>
            {conversations.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{conversations.length}</Text>
              </View>
            ) : null}
          </GlassSurface>
        </Pressable>

        {modelPickerVisible ? (
          // 模型列表弹出时，顶部这个选择框直接变成搜索框。
          <View style={styles.modelButton}>
            <GlassSurface radius={18} style={[styles.modelGlass, styles.modelGlassSearch]}>
              <Icon name="magnifyingglass" size={14} color={palette.secondaryLabel} />
              <TextInput
                keyboardAppearance={isDark() ? 'dark' : 'light'}
                accessibilityLabel={t("搜索模型")}
                value={modelQuery}
                onChangeText={setModelQuery}
                placeholder={t("搜索模型或厂商")}
                placeholderTextColor={palette.tertiaryLabel}
                autoCorrect={false}
                style={styles.modelSearchChipInput}
              />
              {modelQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("清除搜索")}
                  onPress={() => setModelQuery('')}
                  hitSlop={10}
                >
                  <Icon name="xmark" size={13} color={palette.secondaryLabel} />
                </Pressable>
              ) : (
                <Icon name="chevron.up.chevron.down" fallback="⌄" size={11} color={palette.secondaryLabel} />
              )}
            </GlassSurface>
          </View>
        ) : (
          <Pressable
            ref={modelButton}
            accessibilityRole="button"
            accessibilityLabel={tf('当前模型 {0}，点击切换', currentModel.name)}
            onPress={openModelPicker}
            style={({ pressed }) => [styles.modelButton, pressed ? styles.pressed : null]}
          >
            <GlassSurface radius={18} interactive style={styles.modelGlass}>
              <ModelLogo name={currentModel.name} vendor={currentModel.vendor} size={22} />
              <Text numberOfLines={1} style={styles.modelButtonText}>
                {currentModel.name}
              </Text>
              <Icon name="chevron.up.chevron.down" fallback="⌄" size={11} color={palette.secondaryLabel} />
            </GlassSurface>
          </Pressable>
        )}

        <GlassIconButton
          icon="square.and.pencil"
          fallback="✎"
          label={t("新建对话")}
          onPress={startNewConversation}
          size={36}
        />
      </View>

      <BlurTargetView ref={blurTarget} style={styles.thread}>
      <Animated.View
        style={[
          styles.thread,
          {
            opacity: threadAnim,
            transform: [
              {
                translateY: threadAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
      {current ? (
        <ScrollView
          ref={scroll}
          style={styles.messages}
          contentContainerStyle={[styles.messageList, keyboardVisible ? styles.messageListKeyboard : null]}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {current.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              model={models.find((item) => item.id === message.modelId)}
              onEdit={startEdit}
              editDisabled={busy}
            />
          ))}
          {busy ? <TypingBubble model={currentModel} /> : null}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.messages}
          contentContainerStyle={[styles.welcome, keyboardVisible ? styles.welcomeKeyboard : null]}
          keyboardDismissMode="interactive"

        >
          <View style={styles.welcomeIcon}>
            <Icon name="sparkles" fallback="✦" size={40} color={palette.blue} />
          </View>
          <Text style={styles.welcomeTitle}>{t('开始新的对话')}</Text>

          <View style={styles.suggestionList}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                onPress={() => send(suggestion)}
                style={({ pressed }) => [styles.suggestion, pressed ? styles.pressed : null]}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
                <Icon name="arrow.up.right" fallback="↗" size={13} color={palette.subtleLabel} />
              </Pressable>
            ))}
          </View>

          {sortedConversations.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>{t('最近对话')}</Text>
                <Pressable accessibilityRole="button" onPress={openHistory}>
                  <Text style={styles.link}>{t('查看全部')}</Text>
                </Pressable>
              </View>
              <View style={styles.recentList}>
                {sortedConversations.slice(0, 3).map((conversation, index) => (
                  <Pressable
                    key={conversation.id}
                    accessibilityRole="button"
                    onPress={() => openConversation(conversation.id)}
                    style={({ pressed }) => [
                      styles.recentRow,
                      index < Math.min(3, sortedConversations.length) - 1 ? styles.recentRowBorder : null,
                      pressed ? styles.recentRowPressed : null,
                    ]}
                  >
                    <View style={styles.recentMain}>
                      <Text numberOfLines={1} style={styles.recentName}>
                        {conversation.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.recentPreview}>
                        {conversation.messages[conversation.messages.length - 1]?.text ??
                          conversation.modelId ??
                          t('暂无消息')}
                      </Text>
                    </View>
                    <Text style={styles.recentTime}>{relativeTime(conversation.updatedAt)}</Text>
                    <Icon name="chevron.right" fallback="›" size={12} color={palette.tertiaryLabel} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
      </Animated.View>
      </BlurTargetView>

      <View style={styles.composerBar}>
        {editing ? (
          <View style={styles.editingBar}>
            <Icon name="square.and.pencil" size={13} color={ios ? palette.secondaryLabel : m3.onPrimaryContainer} />
            <Text numberOfLines={1} style={styles.editingText}>{t('正在编辑消息，发送后将重新生成回复')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t("取消编辑")} onPress={cancelEdit} hitSlop={8}>
              <Text style={styles.editingCancel}>{t('取消')}</Text>
            </Pressable>
          </View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.composerFade,
            {
              opacity: composerFade,
            },
          ]}
        >
          <MaskedView
            style={StyleSheet.absoluteFill}
            androidRenderingMode="software"
            maskElement={
              <Svg width="100%" height="100%">
                <Defs>
                  <SvgLinearGradient id="composerBlurMask" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="black" stopOpacity="0" />
                    <Stop offset="0.25" stopColor="black" stopOpacity="0.12" />
                    <Stop offset="0.6" stopColor="black" stopOpacity="0.65" />
                    <Stop offset="1" stopColor="black" stopOpacity="1" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#composerBlurMask)" />
              </Svg>
            }
          >
            <BlurView
              style={StyleSheet.absoluteFill}
              blurTarget={blurTarget}
              blurMethod="dimezisBlurView"
              intensity={45}
              tint={isDark() ? 'dark' : 'light'}
            />
          </MaskedView>
        </Animated.View>
        <View style={styles.composerRow}>
          <View ref={toolsButton} collapsable={false} style={styles.toolsButton}>
            <GlassIconButton
              icon="plus"
              fallback="+"
              label={t("AI 功能")}
              onPress={openTools}
              size={48}
              tint={palette.label}
            />
          </View>
          <View style={styles.composerField}>
            <TextInput
              keyboardAppearance={isDark() ? 'dark' : 'light'}
              ref={inputRef}
              accessibilityLabel={t("聊天消息")}
              placeholder={tf('给 {0} 发消息', currentModel.name)}
              placeholderTextColor={ios ? palette.subtleLabel : palette.tertiaryLabel}
              multiline
              maxLength={8000}
              value={draft}
              onChangeText={setDraft}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? t('停止生成') : t('发送')}
              disabled={!busy && !canSend}
              onPress={busy ? stop : () => send(undefined, editing?.id)}
              style={({ pressed }) => [
                styles.sendButton,
                busy ? styles.stopButton : canSend ? null : styles.sendButtonDisabled,
                pressed ? styles.pressed : null,
              ]}
            >
              <Icon
                name={busy ? 'stop.fill' : 'arrow.up'}
                fallback={busy ? '■' : '↑'}
                size={17}
                color="#FFFFFF"
              />
            </Pressable>
          </View>
        </View>
      </View>

      {ios ? (
        <Modal
          visible={historyVisible}
          animationType="slide"
          statusBarTranslucent
          presentationStyle="pageSheet"
          onRequestClose={() => setHistoryVisible(false)}
        >
          <SafeAreaView style={styles.sheetRoot} edges={['top', 'bottom', 'left', 'right']}>
            {historyContent}
          </SafeAreaView>
        </Modal>
      ) : (
        <Modal
          visible={historyMounted}
          transparent
          statusBarTranslucent
          animationType="none"
          onRequestClose={() => setHistoryVisible(false)}
        >
          <View style={styles.historyOverlay}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: historyProgress }]}>
              <View style={[StyleSheet.absoluteFill, styles.historyScrim]} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('关闭对话历史')}
                onPress={() => setHistoryVisible(false)}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.historyBody,
                styles.historyCard,
                {
                  marginTop: safeAreaInsets.top + 16,
                  transform: [
                    {
                      translateY: historyProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [windowHeight, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {historyContent}
            </Animated.View>
          </View>
        </Modal>
      )}

      <ChatPopover
        visible={modelPickerVisible}
        anchor={modelAnchor}
        onClose={closeModelPicker}
        estimatedHeight={pickerModels.length ? pickerModels.length * 60 + 16 : 88}
        bounds={popoverBounds}
        scrollable
        indexLetters={pickerLetters}
        indexOffsetFor={popoverOffsetFor}
      >
        {pickerModels.length === 0 ? (
          <View style={styles.modelEmpty}>
            <Text style={styles.modelEmptyText}>{t('没有匹配的模型')}</Text>
          </View>
        ) : null}
        {!modelQuery && recommended.length > 0 ? (
          <>
            <Text style={styles.recommendHeader}>{t('推荐模型')}</Text>
            {recommended.map(({ model, tag }, index) => {
              const isSelected = model.id === currentModelId;
              return (
                <Pressable
                  key={`recommend-${model.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityHint={t(tag)}
                  onPress={() => chooseModel(model)}
                  style={({ pressed }) => [
                    styles.popoverRow,
                    index < recommended.length - 1 ? styles.popoverRowBorder : null,
                    pressed ? styles.popoverRowPressed : null,
                  ]}
                >
                  <ModelLogo name={model.name} vendor={model.vendor} size={30} />
                  <View style={styles.popoverMain}>
                    <Text style={styles.popoverName} numberOfLines={1}>
                      {model.name}
                    </Text>
                    <View style={styles.recommendMeta}>
                      <Text style={styles.popoverVendor} numberOfLines={1}>
                        {model.vendor}
                      </Text>
                      <Text style={styles.recommendTag}>{t(tag)}</Text>
                    </View>
                  </View>
                  {isSelected ? (
                    <Icon name="checkmark" fallback="✓" size={16} color={palette.blue} />
                  ) : null}
                </Pressable>
              );
            })}
            <Text style={styles.recommendHeaderSpaced}>{t('全部模型')}</Text>
          </>
        ) : null}
        {pickerModels.map((model, index) => {
          const isSelected = model.id === currentModelId;
          return (
            <Pressable
              key={model.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => chooseModel(model)}
              onLayout={(event) => {
                popoverRowOffsets.current[index] = event.nativeEvent.layout.y;
              }}
              style={({ pressed }) => [
                styles.popoverRow,
                index < pickerModels.length - 1 ? styles.popoverRowBorder : null,
                pressed ? styles.popoverRowPressed : null,
              ]}
            >
              <ModelLogo name={model.name} vendor={model.vendor} size={30} />
              <View style={styles.popoverMain}>
                <Text style={styles.popoverName}>{model.name}</Text>
                <Text style={styles.popoverVendor}>{model.vendor}</Text>
              </View>
              {isSelected ? (
                <Icon name="checkmark" fallback="✓" size={16} color={palette.blue} />
              ) : null}
            </Pressable>
          );
        })}
      </ChatPopover>

      <ChatPopover
        visible={toolsVisible}
        anchor={toolsAnchor}
        onClose={() => setToolsVisible(false)}
        estimatedHeight={chatTools.length * 52 + 12}
        width={232}
        bounds={popoverBounds}
        overlayTop={0}
      >
        {chatTools.map((tool, index) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            onPress={() => {
              setToolsVisible(false);
              // 弹层不再用 Modal，跳转到子页时需主动收起键盘，避免键盘跟到新页面。
              Keyboard.dismiss();
              onOpenTool?.(tool.key);
            }}
            style={({ pressed }) => [
              styles.toolRow,
              index < chatTools.length - 1 ? styles.popoverRowBorder : null,
              pressed ? styles.popoverRowPressed : null,
            ]}
          >
            <Icon name={tool.icon} fallback={tool.fallback} size={21} color={palette.blue} />
            <Text style={styles.toolMenuLabel}>{tool.label}</Text>
          </Pressable>
        ))}
      </ChatPopover>
    </View>
  );
}

function ChatPopover({
  visible,
  anchor,
  onClose,
  estimatedHeight,
  width: preferredWidth = 320,
  bounds,
  overlayTop,
  scrollable = false,
  indexLetters,
  indexOffsetFor,
  children,
}: {
  visible: boolean;
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
  estimatedHeight: number;
  width?: number;
  bounds?: { width: number; height: number };
  /** 遮罩顶部；默认从锚点底部开始（模型选择需要让上方搜索框可点），AI 功能菜单传 0。 */
  overlayTop?: number;
  scrollable?: boolean;
  indexLetters?: string[];
  indexOffsetFor?: (letter: string) => number | undefined;
  children: ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 页面内坐标，尺寸取聊天页自身（键盘弹出时高度不含键盘），保证弹层始终在可见区域内。
  const pageWidth = bounds?.width || windowWidth;
  const pageHeight = bounds?.height || windowHeight;
  const width = Math.min(preferredWidth, pageWidth - 24);
  const left = Math.max(
    12,
    Math.min(pageWidth - width - 12, anchor.x + anchor.width / 2 - width / 2),
  );
  const below = anchor.y + anchor.height + 8;
  const spaceBelow = pageHeight - below - 32;
  const spaceAbove = anchor.y - 24;
  const minUsable = 220;

  let maxHeight: number;
  let top: number;
  if (scrollable) {
    if (spaceBelow >= minUsable) {
      maxHeight = Math.min(estimatedHeight, spaceBelow);
      top = below;
    } else if (spaceAbove >= minUsable) {
      maxHeight = Math.min(estimatedHeight, spaceAbove);
      top = anchor.y - maxHeight - 8;
    } else {
      maxHeight = Math.min(estimatedHeight, pageHeight - 160);
      top = Math.max(16, Math.round((pageHeight - maxHeight) / 2));
    }
  } else {
    maxHeight = estimatedHeight;
    top =
      below + maxHeight > pageHeight - 16
        ? Math.max(16, anchor.y - maxHeight - 8)
        : below;
  }

  useEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      stiffness: 380,
      damping: 32,
      mass: 0.7,
    }).start();
  }, [visible, anim]);

  // 不再用 Modal，安卓返回键需要自己接管，否则会直接退出页面。
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.popoverRoot}>
      {/* 默认遮罩从选择框下方开始，弹层打开时顶部搜索框仍然可以直接点按输入。 */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("关闭菜单")}
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { top: overlayTop ?? anchor.y + anchor.height }]}
      />
      <Animated.View
        style={[
          styles.popover,
          styles.popoverShadow,
          {
            top,
            left,
            width,
            opacity: anim,
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <GlassSurface radius={20} style={styles.popoverCard}>
          <View style={styles.popoverBacking}>
            {scrollable ? (
              <View style={styles.popoverListRow}>
                <ScrollView
                  ref={scrollRef}
                  style={{ maxHeight }}
                  contentContainerStyle={styles.popoverScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {children}
                </ScrollView>
                <AlphabetRail
                  letters={indexLetters ?? []}
                  onSelect={(letter) => {
                    const offset = indexOffsetFor?.(letter);
                    if (offset === undefined) return;
                    scrollRef.current?.scrollTo({ y: Math.max(0, offset - 6), animated: true });
                  }}
                />
              </View>
            ) : (
              children
            )}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function MessageBubble({
  message,
  model,
  onEdit,
  editDisabled,
}: {
  message: ChatMessage;
  model?: Model;
  onEdit?: (message: ChatMessage) => void;
  editDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(message.text);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // 复制失败不打断对话，文本本身仍可长按选择。
    }
  };

  const isUser = message.role === 'user';
  const time = formatMessageTime(message.createdAt);

  const copyButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? t('已复制') : t('复制消息')}
      onPress={copy}
      hitSlop={10}
      style={({ pressed }) => [styles.messageAction, pressed ? styles.pressed : null]}
    >
      <Icon
        name={copied ? 'checkmark' : 'doc.on.doc'}
        size={16}
        color={copied ? palette.blue : palette.secondaryLabel}
      />
    </Pressable>
  );

  const timeText = time ? <Text style={styles.messageTime}>{time}</Text> : null;

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text selectable style={styles.userText}>
            {message.text}
          </Text>
        </View>
        <View style={[styles.messageMeta, styles.messageMetaUser]}>
          {timeText}
          {copyButton}
          {onEdit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("编辑消息")}
              disabled={editDisabled}
              onPress={() => onEdit(message)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.messageAction,
                pressed || editDisabled ? styles.messageActionDim : null,
              ]}
            >
              <Icon name="square.and.pencil" size={16} color={palette.secondaryLabel} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <Text style={styles.assistantMeta}>{model?.name ?? t('助手')}</Text>
      <View style={styles.assistantBubble}>
        <RichText text={message.text} style={styles.assistantText} />
      </View>
      <View style={styles.messageMeta}>
        {copyButton}
        {timeText}
      </View>
    </View>
  );
}

function TypingBubble({ model }: { model: Model }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 3,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const dotOpacity = (index: number) =>
    progress.interpolate({
      inputRange: [index, index + 0.35, index + 0.7],
      outputRange: [0.35, 1, 0.35],
      extrapolate: 'clamp',
    });

  return (
    <View style={styles.assistantRow}>
      <Text style={styles.assistantMeta}>{model.name}</Text>
      <View style={[styles.assistantBubble, styles.typingBubble]}>
        {[0, 1, 2].map((index) => (
          <Animated.View key={index} style={[styles.typingDot, { opacity: dotOpacity(index) }]} />
        ))}
      </View>
    </View>
  );
}

function Icon({
  name,
  size = 20,
  color = palette.blue,
}: {
  name: ComponentProps<typeof SymbolView>['name'];
  fallback?: string;
  size?: number;
  color?: string;
}) {
  return <AppIcon name={name} size={size} color={color} />;
}

function relativeTime(timestamp: number) {
  const difference = Math.max(0, Date.now() - timestamp);
  if (difference < 60 * 1000) return t('刚刚');
  if (difference < 60 * 60 * 1000) {
    const minutes = Math.floor(difference / (60 * 1000));
    if (isEnglish()) return `${minutes} min ago`;
    return tf('{0} 分钟前', minutes);
  }
  if (difference < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(difference / (60 * 60 * 1000));
    if (isEnglish()) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    return tf('{0} 小时前', hours);
  }
  const days = Math.floor(difference / (24 * 60 * 60 * 1000));
  if (isEnglish()) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return tf('{0} 天前', days);
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolButton: {
    minWidth: 74,
    height: 36,
    borderRadius: 18,
  },
  toolGlass: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
  },
  toolLabel: { color: palette.label, fontSize: ios ? 13 : 14, fontWeight: ios ? '600' : '500' },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  modelButton: {
    flex: 1,
    maxWidth: 230,
    height: 36,
    borderRadius: 18,
  },
  modelGlass: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  modelButtonText: { color: palette.label, fontSize: 14, fontWeight: '500', flexShrink: 1 },
  pressed: { opacity: 0.55 },
  messages: { flex: 1 },
  thread: { flex: 1 },
  messageList: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  // 键盘展开时输入条上方有渐变，留出等量空间，滚到底时最后一条不会被压暗。
  messageListKeyboard: { paddingBottom: 50 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: palette.blue,
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#FFFFFF', fontSize: ios ? 17 : 16, lineHeight: ios ? 23 : 22 },
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 5,
    paddingHorizontal: 4,
  },
  messageMetaUser: { justifyContent: 'flex-end' },
  messageTime: { color: palette.secondaryLabel, fontSize: 11.5 },
  messageAction: { padding: 3 },
  messageActionDim: { opacity: 0.4 },
  assistantRow: { alignItems: 'flex-start', maxWidth: '88%' },
  assistantMeta: {
    color: palette.secondaryLabel,
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 4,
    marginBottom: 4,
  },
  assistantBubble: {
    backgroundColor: palette.card,
    borderRadius: ios ? 20 : shape.lg,
    borderBottomLeftRadius: ios ? 6 : shape.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...(ios
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.separatorSoft,
        }
      : elevation.level1),
  },
  assistantText: { color: palette.label, fontSize: ios ? 17 : 16, lineHeight: ios ? 23 : 22 },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.tertiaryLabel },
  welcome: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  welcomeKeyboard: { paddingBottom: 62 },
  welcomeIcon: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  welcomeTitle: { color: palette.label, fontSize: ios ? 22 : 24, fontWeight: ios ? '700' : '600' },
  suggestionList: { marginTop: 20, gap: 8 },
  suggestion: {
    minHeight: ios ? 46 : 56,
    borderRadius: ios ? 14 : shape.xl,
    paddingHorizontal: ios ? 14 : 18,
    paddingVertical: 12,
    backgroundColor: palette.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...(ios
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.separatorSoft,
        }
      : elevation.level1),
  },
  suggestionText: { color: palette.label, fontSize: ios ? 15 : 16, flex: 1 },
  recentHeader: {
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentTitle: { color: palette.secondaryLabel, fontSize: ios ? 13 : 12, fontWeight: '500' },
  link: { color: palette.blue, fontSize: ios ? 13 : 14, fontWeight: '500' },
  recentList: {
    marginTop: 8,
    backgroundColor: palette.card,
    borderRadius: ios ? 14 : shape.xl,
    overflow: 'hidden',
    ...(ios
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.separatorSoft,
        }
      : elevation.level1),
  },
  recentRow: {
    minHeight: ios ? 62 : 68,
    paddingHorizontal: ios ? 14 : 18,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
    marginLeft: ios ? 0 : 18,
  },
  recentRowPressed: { backgroundColor: palette.fill },
  recentMain: { flex: 1, gap: 2 },
  recentName: { color: palette.label, fontSize: ios ? 15 : 16, fontWeight: '500' },
  recentPreview: { color: palette.secondaryLabel, fontSize: 13 },
  recentTime: { color: palette.secondaryLabel, fontSize: 12 },
  composerBar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  composerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    // 模糊层从透明过渡至输入区，底端延伸到输入框背后。
    top: -40,
    height: 48,
  },
  editingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 6,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ios ? 12 : shape.lg,
    backgroundColor: ios ? palette.fill : m3.primaryContainer,
  },
  editingText: {
    flex: 1,
    color: ios ? palette.secondaryLabel : m3.onPrimaryContainer,
    fontSize: 12,
  },
  editingCancel: { color: palette.blue, fontSize: 12, fontWeight: '600' },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  toolsButton: { width: 48, height: 48 },
  composerField: {
    flex: 1,
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 24 : shape.full,
    backgroundColor: palette.card,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 5,
    ...(ios
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.separatorSoft,
        }
      : elevation.level1),
  },
  input: { flex: 1, minHeight: 38, maxHeight: 120, paddingTop: 8, paddingBottom: 8, color: palette.label, fontSize: ios ? 17 : 16, lineHeight: 22 },
  sendButton: {
    width: ios ? 38 : 42,
    height: ios ? 38 : 42,
    borderRadius: ios ? 19 : shape.full,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: { backgroundColor: palette.label },
  sendButtonDisabled: { backgroundColor: ios ? palette.tertiaryLabel : m3.surfaceContainerHighest },
  popoverRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  popover: { position: 'absolute' },
  // iOS 用原生阴影；安卓的 shadow* 不生效，改给外层 elevation（需要一个圆角底色才会投影，
  // 玻璃回退层本身也是同色 card，叠上去看不出来）。
  popoverShadow: ios
    ? {
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
      }
    : {
        elevation: 16,
        backgroundColor: palette.card,
        borderRadius: 20,
      },
  popoverCard: { overflow: 'hidden' },
  popoverScrollContent: { paddingVertical: 0 },
  popoverListRow: { flexDirection: 'row' },
  popoverBacking: {
    backgroundColor: ios ? palette.popoverBacking : palette.card,
    paddingVertical: 4,
  },
  popoverRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  popoverRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
  },
  popoverRowPressed: { backgroundColor: palette.fill },
  popoverMain: { flex: 1, gap: 1 },
  popoverName: { color: palette.label, fontSize: 16, fontWeight: '500' },
  popoverVendor: { color: palette.secondaryLabel, fontSize: 12 },
  // 双端现在共用同一个浮层，分组标题的内缩与行内容（14pt）对齐。
  recommendHeader: {
    color: palette.secondaryLabel,
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  recommendHeaderSpaced: {
    color: palette.secondaryLabel,
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 2,
  },
  recommendMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recommendTag: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: palette.tintBlueSoft,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  toolRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  toolMenuLabel: { color: palette.label, fontSize: 16, fontWeight: ios ? '400' : '500' },
  sheetRoot: { flex: 1, backgroundColor: palette.groupedBackground },
  // 安卓不做整页 sheet：压暗底下的聊天，卡片左右和底部贴边、只有顶部留缺口，和 iOS 的 pageSheet 观感一致。
  historyOverlay: { flex: 1 },
  // 遮罩单独一层，好跟卡片一起做淡入淡出。
  historyScrim: { backgroundColor: palette.overlay },
  historyBody: { flex: 1 },
  historyCard: {
    borderTopLeftRadius: shape.xl,
    borderTopRightRadius: shape.xl,
    overflow: 'hidden',
    backgroundColor: palette.groupedBackground,
  },
  sheetContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  newConversation: {
    minHeight: ios ? 54 : 60,
    borderRadius: ios ? 14 : shape.xl,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.card,
    ...(ios ? {} : elevation.level1),
  },
  newConversationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ios ? palette.tintBlueSoft : m3.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newConversationText: { color: palette.blue, fontSize: ios ? 17 : 16, fontWeight: ios ? '600' : '500' },
  groupLabel: { color: palette.secondaryLabel, fontSize: ios ? 13 : 12, fontWeight: '500', marginLeft: 4, marginTop: 6 },
  historyList: {
    backgroundColor: palette.card,
    borderRadius: ios ? 14 : shape.xl,
    overflow: 'hidden',
    ...(ios ? {} : elevation.level1),
  },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.separator,
    marginLeft: ios ? 0 : 18,
  },
  historyMain: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  historyTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyName: { flexShrink: 1, color: palette.label, fontSize: 16, fontWeight: '500' },
  historyPreview: { color: palette.secondaryLabel, fontSize: 13 },
  historyMeta: { color: palette.secondaryLabel, fontSize: 11, marginTop: 1 },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  historyEmpty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  historyEmptyTitle: { color: palette.label, fontSize: 17, fontWeight: '500' },
  modelSearchChipInput: {
    flex: 1,
    color: palette.label,
    fontSize: 14,
    paddingVertical: 0,
  },
  modelGlassSearch: { justifyContent: 'flex-start' },
  modelEmpty: { paddingVertical: 18, alignItems: 'center' },
  modelEmptyText: { color: palette.secondaryLabel, fontSize: 15, textAlign: 'center', paddingVertical: 18 },
  sheetNote: { color: palette.secondaryLabel, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 4 },
}));
