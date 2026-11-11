import { BlurView, BlurTargetView } from 'expo-blur';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentType, type ReactElement, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  Animated,
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
  type ViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';

import { ModelLogo } from './components/ModelLogo';
import {
  appendMessage,
  createConversation as createConversationRequest,
  deleteConversation as deleteConversationRequest,
  fetchConversationMessages,
  fetchConversations,
} from './api/endpoints';
import { streamChat } from './api/client';
import type { ChatConversation } from './api/types';
import type { Model } from './types';
import { GlassIconButton, GlassSurface, SheetHeader, palette } from './ui';
import { AppIcon } from './components/AppIcon';
import { elevation, m3, shape } from './material';
import { useKeyboardInsets } from './useKeyboardInsets';

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
};

type Conversation = {
  id: number;
  title: string;
  messages: ChatMessage[];
  modelId: string;
  updatedAt: number;
  loaded?: boolean;
};

const suggestions = [
  '帮我总结一段技术文档',
  '解释一个概念并给出例子',
  '把这段话润色得更专业',
];

const seedConversations: Conversation[] = [];

const fallbackModel: Model = {
  id: '',
  name: '选择模型',
  vendor: '',
  context: '—',
  latency: '—',
  price: '—',
  status: 'stable',
  tags: [],
  note: '',
  route: '—',
  inputRate: '—',
  outputRate: '—',
  updatedAt: '—',
};

function toConversation(item: ChatConversation): Conversation {
  const updatedAt = Date.parse(item.UpdatedAt);
  return {
    id: item.ID,
    title: item.Title?.trim() || `对话 ${item.ID}`,
    modelId: item.Model || '',
    updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt,
    messages: [],
    loaded: false,
  };
}

export type ChatToolKey = 'media' | 'experience' | 'fusion' | 'pricing';

const chatTools: {
  key: ChatToolKey;
  icon: ComponentProps<typeof SymbolView>['name'];
  fallback: string;
  label: string;
}[] = [
  { key: 'media', icon: 'sparkles', fallback: '✦', label: 'AI 创作' },
  { key: 'experience', icon: 'text.bubble', fallback: '◌', label: '模型体验' },
  { key: 'fusion', icon: 'arrow.triangle.merge', fallback: '◈', label: '模型融合' },
  { key: 'pricing', icon: 'square.grid.2x2', fallback: '▦', label: '模型广场' },
];

export function ChatWorkspace({
  bottomInset = 0,
  onOpenTool,
  models,
}: {
  bottomInset?: number;
  onOpenTool?: (tool: ChatToolKey) => void;
  models: Model[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [modelAnchor, setModelAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [toolsVisible, setToolsVisible] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState({ x: 111, y: 170, width: 228, height: 36 });
  const { visible: keyboardVisible, inset: keyboardInset } = useKeyboardInsets(true);
  const safeAreaInsets = useSafeAreaInsets();
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

  // 键盘开合都会改变输入条位置，弹层锚点随之失效，直接关闭，避免菜单停在旧位置。
  // 安卓模型选择器是底部弹窗，本身会收起键盘，不能跟着关。
  useEffect(() => {
    setToolsVisible(false);
    if (Platform.OS === 'ios') setModelPickerVisible(false);
  }, [keyboardVisible]);

  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const threadAnim = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
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

  // 首次进入拉取会话列表；会话消息按需加载。
  useEffect(() => {
    let active = true;
    fetchConversations(50, 0)
      .then((page) => {
        if (!active) return;
        setConversations((page.items ?? []).map(toConversation));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
    setModelPickerVisible(false);
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

  const openModelPicker = () => {
    if (Platform.OS !== 'ios') {
      setModelPickerVisible(true);
      return;
    }
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
    Alert.alert('删除对话？', '删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
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

  const send = async (preset?: string) => {
    const prompt = (preset ?? draft).trim();
    if (!prompt || busy || !currentModel) return;
    if (!currentModel.id) {
      Alert.alert('请先选择模型');
      return;
    }

    const model = currentModel;
    let conversationId = selected;
    const request = ++generation.current;
    const now = Date.now();
    const userMessage: ChatMessage = { id: Date.now(), role: 'user', text: prompt };
    const assistantId = userMessage.id + 1;

    setDraft('');
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
                  messages: [...conversation.messages, userMessage],
                }
              : conversation,
          ),
        );
      }

      const activeId = conversationId;
      appendMessage(activeId, 'user', prompt).catch(() => undefined);

      const history = (conversations.find((item) => item.id === activeId)?.messages ?? [])
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
                    { id: assistantId, role: 'assistant' as const, modelId: model.id, text },
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
      Alert.alert('发送失败', error instanceof Error ? error.message : '请稍后重试');
      if (conversationId !== null) {
        const target = conversationId;
        setConversations((items) =>
          items.map((conversation) =>
            conversation.id === target
              ? {
                  ...conversation,
                  messages: conversation.messages.filter(
                    (message) => message.id !== userMessage.id && message.id !== assistantId,
                  ),
                }
              : conversation,
          ),
        );
      }
    } finally {
      if (abortRef.current) abortRef.current = null;
    }
  };

  const canSend = draft.trim().length > 0 && !busy;

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
          accessibilityLabel="查看对话历史"
          onPress={() => setHistoryVisible(true)}
          style={({ pressed }) => [styles.toolButton, pressed ? styles.pressed : null]}
        >
          <GlassSurface radius={18} interactive style={styles.toolGlass}>
            <Icon name="clock.arrow.circlepath" fallback="◷" size={17} />
            <Text style={styles.toolLabel}>历史</Text>
            {conversations.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{conversations.length}</Text>
              </View>
            ) : null}
          </GlassSurface>
        </Pressable>

        <Pressable
          ref={modelButton}
          accessibilityRole="button"
          accessibilityLabel={`当前模型 ${currentModel.name}，点击切换`}
          onPress={openModelPicker}
          style={({ pressed }) => [styles.modelButton, pressed ? styles.pressed : null]}
        >
          <GlassSurface radius={18} interactive style={styles.modelGlass}>
            <ModelLogo name={currentModel.name} size={22} />
            <Text numberOfLines={1} style={styles.modelButtonText}>
              {currentModel.name}
            </Text>
            <Icon name="chevron.up.chevron.down" fallback="⌄" size={11} color="#6C6C70" />
          </GlassSurface>
        </Pressable>

        <GlassIconButton
          icon="square.and.pencil"
          fallback="✎"
          label="新建对话"
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
            <MessageBubble key={message.id} message={message} model={models.find((item) => item.id === message.modelId)} />
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
          <Text style={styles.welcomeTitle}>开始新的对话</Text>

          <View style={styles.suggestionList}>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion}
                accessibilityRole="button"
                onPress={() => send(suggestion)}
                style={({ pressed }) => [styles.suggestion, pressed ? styles.pressed : null]}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
                <Icon name="arrow.up.right" fallback="↗" size={13} color={ios ? '#8E8E93' : palette.secondaryLabel} />
              </Pressable>
            ))}
          </View>

          {sortedConversations.length > 0 ? (
            <>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>最近对话</Text>
                <Pressable accessibilityRole="button" onPress={() => setHistoryVisible(true)}>
                  <Text style={styles.link}>查看全部</Text>
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
                          '暂无消息'}
                      </Text>
                    </View>
                    <Text style={styles.recentTime}>{relativeTime(conversation.updatedAt)}</Text>
                    <Icon name="chevron.right" fallback="›" size={12} color="#C7C7CC" />
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
              tint="light"
            />
          </MaskedView>
        </Animated.View>
        <View style={styles.composerRow}>
          <View ref={toolsButton} collapsable={false} style={styles.toolsButton}>
            <GlassIconButton
              icon="plus"
              fallback="+"
              label="AI 功能"
              onPress={openTools}
              size={48}
              tint={ios ? '#1C1C1E' : palette.label}
            />
          </View>
          <View style={styles.composerField}>
            <TextInput
              accessibilityLabel="聊天消息"
              placeholder={`给 ${currentModel.name} 发消息`}
              placeholderTextColor={ios ? '#8E8E93' : palette.tertiaryLabel}
              multiline
              maxLength={8000}
              value={draft}
              onChangeText={setDraft}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={busy ? '停止生成' : '发送'}
              disabled={!busy && !canSend}
              onPress={busy ? stop : () => send()}
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

      <Modal
        visible={historyVisible}
        animationType="slide"
        statusBarTranslucent
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setHistoryVisible(false)}
      >
        <SafeAreaView style={styles.sheetRoot} edges={['top', 'bottom', 'left', 'right']}>
          <SheetHeader title="对话历史" onClose={() => setHistoryVisible(false)} />

          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Pressable
              accessibilityRole="button"
              onPress={startNewConversation}
              style={({ pressed }) => [styles.newConversation, pressed ? styles.pressed : null]}
            >
              <View style={styles.newConversationIcon}>
                <Icon name="plus.bubble" fallback="＋" size={19} color={palette.blue} />
              </View>
              <Text style={styles.newConversationText}>新建对话</Text>
            </Pressable>

            {sortedConversations.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Icon name="bubble.left.and.bubble.right" fallback="◌" size={32} color="#C7C7CC" />
                <Text style={styles.historyEmptyTitle}>还没有对话</Text>
                <Text style={styles.historyEmptyCopy}>对话记录会保存在账号中。</Text>
              </View>
            ) : (
              <>
                <Text style={styles.groupLabel}>最近</Text>
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
                            {conversation.messages[conversation.messages.length - 1]?.text ??
                          conversation.modelId ??
                          '暂无消息'}
                          </Text>
                          <Text style={styles.historyMeta}>
                            {conversation.messages.length} 条消息 · {model?.name ?? '未知模型'} ·{' '}
                            {relativeTime(conversation.updatedAt)}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`删除 ${conversation.title}`}
                          onPress={() => deleteConversation(conversation.id)}
                          hitSlop={8}
                          style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}
                        >
                          <Icon name="trash" fallback="⌫" size={17} color="#FF3B30" />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {Platform.OS === 'ios' ? (
        <ChatPopover
          visible={modelPickerVisible}
          anchor={modelAnchor}
          onClose={() => setModelPickerVisible(false)}
          estimatedHeight={models.length * 60 + 16}
          bounds={popoverBounds}
          scrollable
        >
          {models.map((model, index) => {
            const isSelected = model.id === currentModelId;
            return (
              <Pressable
                key={model.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => chooseModel(model)}
                style={({ pressed }) => [
                  styles.popoverRow,
                  index < models.length - 1 ? styles.popoverRowBorder : null,
                  pressed ? styles.popoverRowPressed : null,
                ]}
              >
                <ModelLogo name={model.name} size={30} />
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
      ) : (
        <Modal
          visible={modelPickerVisible}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setModelPickerVisible(false)}
        >
          <SafeAreaView style={styles.sheetRoot} edges={['top', 'bottom', 'left', 'right']}>
            <SheetHeader title="选择模型" onClose={() => setModelPickerVisible(false)} />

            <ScrollView contentContainerStyle={styles.sheetContent}>
              <View style={styles.modelList}>
                {models.map((model, index) => {
                  const isSelected = model.id === currentModelId;
                  return (
                    <Pressable
                      key={model.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => chooseModel(model)}
                      style={({ pressed }) => [
                        styles.modelRow,
                        index < models.length - 1 ? styles.historyRowBorder : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      <ModelLogo name={model.name} size={30} />
                      <View style={styles.modelMain}>
                        <Text style={styles.modelName}>{model.name}</Text>
                        <Text style={styles.modelVendor}>{model.vendor}</Text>
                        <View style={styles.modelChips}>
                          <Text style={styles.modelChip}>{model.context} 上下文</Text>
                          <Text style={styles.modelChip}>{model.latency} 延迟</Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <View style={styles.checkCircle}>
                          <Icon name="checkmark" fallback="✓" size={14} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      <ChatPopover
        visible={toolsVisible}
        anchor={toolsAnchor}
        onClose={() => setToolsVisible(false)}
        estimatedHeight={chatTools.length * 52 + 12}
        width={232}
        bounds={popoverBounds}
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
  scrollable = false,
  children,
}: {
  visible: boolean;
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
  estimatedHeight: number;
  width?: number;
  bounds?: { width: number; height: number };
  scrollable?: boolean;
  children: ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭菜单"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
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
              <ScrollView
                style={{ maxHeight }}
                contentContainerStyle={styles.popoverScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

function MessageBubble({ message, model }: { message: ChatMessage; model?: Model }) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text selectable style={styles.userText}>
            {message.text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <Text style={styles.assistantMeta}>{model?.name ?? '助手'}</Text>
      <View style={styles.assistantBubble}>
        <Text selectable style={styles.assistantText}>
          {message.text}
        </Text>
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
  if (difference < 60 * 1000) return '刚刚';
  if (difference < 60 * 60 * 1000) return `${Math.floor(difference / (60 * 1000))} 分钟前`;
  if (difference < 24 * 60 * 60 * 1000) return `${Math.floor(difference / (60 * 60 * 1000))} 小时前`;
  return `${Math.floor(difference / (24 * 60 * 60 * 1000))} 天前`;
}

const styles = StyleSheet.create({
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
          borderColor: 'rgba(60,60,67,0.10)',
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
          borderColor: 'rgba(60,60,67,0.10)',
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
          borderColor: 'rgba(60,60,67,0.10)',
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
          borderColor: 'rgba(60,60,67,0.12)',
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
  sendButtonDisabled: { backgroundColor: ios ? '#C7C7CC' : m3.surfaceContainerHighest },
  popoverRoot: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 },
  popover: { position: 'absolute' },
  popoverShadow: {
    shadowColor: '#000000',
    shadowOpacity: ios ? 0.18 : 0,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  popoverCard: { overflow: 'hidden' },
  popoverScrollContent: { paddingVertical: 0 },
  popoverBacking: {
    backgroundColor: ios ? 'rgba(255,255,255,0.95)' : palette.card,
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
  toolRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  toolMenuLabel: { color: palette.label, fontSize: 16, fontWeight: ios ? '400' : '500' },
  sheetRoot: { flex: 1, backgroundColor: palette.groupedBackground },
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
    backgroundColor: ios ? '#EAF2FF' : m3.primaryContainer,
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
  historyEmptyCopy: { color: palette.secondaryLabel, fontSize: 13, textAlign: 'center' },
  modelList: { backgroundColor: palette.card, borderRadius: ios ? 14 : shape.xl, overflow: 'hidden' },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    minHeight: 74,
  },
  modelMain: { flex: 1, gap: 3 },
  modelName: { color: palette.label, fontSize: 17, fontWeight: '500' },
  modelVendor: { color: palette.secondaryLabel, fontSize: 13 },
  modelChips: { flexDirection: 'row', gap: 6, marginTop: 2 },
  modelChip: {
    color: palette.secondaryLabel,
    fontSize: 11,
    fontWeight: '500',
    backgroundColor: ios ? 'rgba(118,118,128,0.10)' : m3.surfaceContainerHigh,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: ios ? 6 : shape.sm,
    overflow: 'hidden',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetNote: { color: palette.secondaryLabel, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 4 },
});
