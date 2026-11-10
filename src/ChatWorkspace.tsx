import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModelLogo } from './components/ModelLogo';
import { models } from './data/mockConsole';
import type { Model } from './types';
import { GlassIconButton, GlassSurface, SheetHeader } from './ui';

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
};

const suggestions = [
  '帮我总结一段技术文档',
  '解释一个概念并给出例子',
  '把这段话润色得更专业',
];

const seedConversations: Conversation[] = [
  {
    id: 1,
    title: '缓存穿透与布隆过滤器',
    modelId: 'm3',
    updatedAt: Date.now() - 1000 * 60 * 42,
    messages: [
      {
        id: 1,
        role: 'user',
        text: '用一个具体例子解释缓存穿透，以及布隆过滤器如何缓解。',
      },
      {
        id: 2,
        role: 'assistant',
        modelId: 'm3',
        text: '假设商品详情接口按 ID 查缓存：当请求不存在的 ID 时，缓存永远不会命中，压力会全部落到数据库。布隆过滤器在缓存前记录所有合法 ID，可以快速判断某个 ID 一定不存在，从而直接返回空结果。\n\n这是本地模拟回复，未调用真实模型。',
      },
    ],
  },
  {
    id: 2,
    title: '润色产品介绍',
    modelId: 'm2',
    updatedAt: Date.now() - 1000 * 60 * 60 * 20,
    messages: [
      {
        id: 1,
        role: 'user',
        text: '帮我润色这句产品介绍：我们提供一个统一的大模型接入层。',
      },
      {
        id: 2,
        role: 'assistant',
        modelId: 'm2',
        text: '可以改为：「通过统一的大模型接入层，团队可以用一套接口管理多家模型，降低集成与切换成本。」\n\n这是本地模拟回复，未调用真实模型。',
      },
    ],
  },
];

export type ChatToolKey = 'media' | 'experience' | 'face' | 'fusion' | 'pricing';

const chatTools: {
  key: ChatToolKey;
  icon: ComponentProps<typeof SymbolView>['name'];
  fallback: string;
  label: string;
}[] = [
  { key: 'media', icon: 'sparkles', fallback: '✦', label: 'AI 创作' },
  { key: 'experience', icon: 'text.bubble', fallback: '◌', label: '模型体验' },
  { key: 'face', icon: 'person.crop.square', fallback: '◎', label: '人脸工具' },
  { key: 'fusion', icon: 'arrow.triangle.merge', fallback: '◈', label: '模型融合' },
  { key: 'pricing', icon: 'square.grid.2x2', fallback: '▦', label: '模型广场' },
];

export function ChatWorkspace({
  bottomInset = 0,
  onOpenTool,
}: {
  bottomInset?: number;
  onOpenTool?: (tool: ChatToolKey) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(seedConversations);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('m1');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [modelPickerVisible, setModelPickerVisible] = useState(false);
  const [modelAnchor, setModelAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [toolsVisible, setToolsVisible] = useState(false);
  const [toolsAnchor, setToolsAnchor] = useState({ x: 111, y: 170, width: 228, height: 36 });
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const generation = useRef(0);
  const conversationSequence = useRef(3);
  const messageSequence = useRef(3);
  const threadAnim = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const modelButton = useRef<ComponentRef<typeof View>>(null);
  const toolsButton = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const current = conversations.find((item) => item.id === selected);
  const currentModelId = current?.modelId ?? selectedModelId;
  const currentModel = models.find((model) => model.id === currentModelId) ?? models[0];
  const sortedConversations = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  const stop = () => {
    generation.current += 1;
    setBusy(false);
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
    if (conversation) setSelectedModelId(conversation.modelId);
    setDraft('');
    setHistoryVisible(false);
    playThreadTransition();
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

  const openModelPicker = () => {
    if (Platform.OS !== 'ios') {
      setModelPickerVisible(true);
      return;
    }
    modelButton.current?.measureInWindow((x, y, width, height) => {
      setModelAnchor({ x, y, width, height });
      setModelPickerVisible(true);
    });
  };

  const openTools = () => {
    toolsButton.current?.measureInWindow((x, y, width, height) => {
      setToolsAnchor({ x, y, width, height });
      setToolsVisible(true);
    });
  };

  const deleteConversation = (id: number) => {
    Alert.alert('删除对话？', '删除后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (selected === id) stop();
          setConversations((items) => items.filter((conversation) => conversation.id !== id));
          if (selected === id) setSelected(null);
        },
      },
    ]);
  };

  const send = async (preset?: string) => {
    const prompt = (preset ?? draft).trim();
    if (!prompt || busy) return;

    const model = currentModel;
    const conversationId = selected ?? ++conversationSequence.current;
    const userMessage: ChatMessage = { id: ++messageSequence.current, role: 'user', text: prompt };
    const assistantId = ++messageSequence.current;
    const request = ++generation.current;
    const now = Date.now();

    setSelected(conversationId);
    setDraft('');
    setBusy(true);
    setConversations((items) => {
      const exists = items.some((conversation) => conversation.id === conversationId);
      if (!exists) {
        return [
          {
            id: conversationId,
            title: prompt.length > 22 ? `${prompt.slice(0, 22)}…` : prompt,
            modelId: model.id,
            updatedAt: now,
            messages: [userMessage],
          },
          ...items,
        ];
      }
      return items.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              modelId: model.id,
              updatedAt: now,
              messages: [...conversation.messages, userMessage],
            }
          : conversation,
      );
    });

    const reply = `这是 ${model.name} 的模拟回复，未调用真实接口。\n\n你发送了：${prompt}\n\n接入业务 API 后会返回真实结果。`;
    for (let offset = 0; offset < reply.length; offset += 4) {
      await new Promise((resolve) => setTimeout(resolve, 28));
      if (generation.current !== request) return;
      const text = reply.slice(0, offset + 4);
      setConversations((items) =>
        items.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
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
                  { id: assistantId, role: 'assistant', modelId: model.id, text },
                ],
          };
        }),
      );
    }
    setBusy(false);
  };

  const canSend = draft.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { marginBottom: keyboardVisible ? 0 : bottomInset }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          contentContainerStyle={styles.messageList}
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
          contentContainerStyle={styles.welcome}
          keyboardDismissMode="interactive"

        >
          <View style={styles.welcomeIcon}>
            <Icon name="sparkles" fallback="✦" size={40} color="#007AFF" />
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
                <Icon name="arrow.up.right" fallback="↗" size={13} color="#8E8E93" />
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
                        {conversation.messages[conversation.messages.length - 1]?.text ?? '暂无消息'}
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

      <View style={styles.composerBar}>
        <View style={styles.composerRow}>
          <View ref={toolsButton} collapsable={false} style={styles.toolsButton}>
            <GlassIconButton
              icon="plus"
              fallback="+"
              label="AI 功能"
              onPress={openTools}
              size={48}
              tint="#1C1C1E"
            />
          </View>
          <View style={styles.composerField}>
            <TextInput
              accessibilityLabel="聊天消息"
              placeholder={`给 ${currentModel.name} 发消息`}
              placeholderTextColor="#8E8E93"
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
        presentationStyle="pageSheet"
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
                <Icon name="plus.bubble" fallback="＋" size={19} color="#007AFF" />
              </View>
              <Text style={styles.newConversationText}>新建对话</Text>
            </Pressable>

            {sortedConversations.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Icon name="bubble.left.and.bubble.right" fallback="◌" size={32} color="#C7C7CC" />
                <Text style={styles.historyEmptyTitle}>还没有对话</Text>
                <Text style={styles.historyEmptyCopy}>新建对话后，记录会保留在本次运行中。</Text>
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
                              <Icon name="checkmark" fallback="✓" size={15} color="#007AFF" />
                            ) : null}
                          </View>
                          <Text numberOfLines={1} style={styles.historyPreview}>
                            {conversation.messages[conversation.messages.length - 1]?.text ?? '暂无消息'}
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
                  <Icon name="checkmark" fallback="✓" size={16} color="#007AFF" />
                ) : null}
              </Pressable>
            );
          })}
        </ChatPopover>
      ) : (
        <Modal
          visible={modelPickerVisible}
          animationType="slide"
          presentationStyle="pageSheet"
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
              <Text style={styles.sheetNote}>
                切换模型只影响当前对话的模拟回复；接入业务接口前不会产生真实调用或费用。
              </Text>
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
      >
        {chatTools.map((tool, index) => (
          <Pressable
            key={tool.key}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
            onPress={() => {
              setToolsVisible(false);
              onOpenTool?.(tool.key);
            }}
            style={({ pressed }) => [
              styles.toolRow,
              index < chatTools.length - 1 ? styles.popoverRowBorder : null,
              pressed ? styles.popoverRowPressed : null,
            ]}
          >
            <Icon name={tool.icon} fallback={tool.fallback} size={21} color="#007AFF" />
            <Text style={styles.toolMenuLabel}>{tool.label}</Text>
          </Pressable>
        ))}
      </ChatPopover>
    </KeyboardAvoidingView>
  );
}

function ChatPopover({
  visible,
  anchor,
  onClose,
  estimatedHeight,
  width: preferredWidth = 320,
  scrollable = false,
  children,
}: {
  visible: boolean;
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
  estimatedHeight: number;
  width?: number;
  scrollable?: boolean;
  children: ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const width = Math.min(preferredWidth, windowWidth - 24);
  const left = Math.max(
    12,
    Math.min(windowWidth - width - 12, anchor.x + anchor.width / 2 - width / 2),
  );
  const below = anchor.y + anchor.height + 8;
  const spaceBelow = windowHeight - below - 32;
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
      maxHeight = Math.min(estimatedHeight, windowHeight - 160);
      top = Math.max(16, Math.round((windowHeight - maxHeight) / 2));
    }
  } else {
    maxHeight = estimatedHeight;
    top =
      below + maxHeight > windowHeight - 24
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

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.popoverRoot}>
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
    </Modal>
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
      <Text style={styles.assistantMeta}>{model?.name ?? '演示助手'}</Text>
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
  fallback,
  size = 20,
  color = '#007AFF',
}: {
  name: ComponentProps<typeof SymbolView>['name'];
  fallback: string;
  size?: number;
  color?: string;
}) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={name} tintColor={color} style={{ width: size, height: size }} />;
  }
  return <Text style={{ fontSize: size * 0.85, color, lineHeight: size }}>{fallback}</Text>;
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
  toolLabel: { color: '#1C1C1E', fontSize: 13, fontWeight: '600' },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: '#007AFF',
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
  modelButtonText: { color: '#1C1C1E', fontSize: 14, fontWeight: '600', flexShrink: 1 },
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
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: '#007AFF',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#FFFFFF', fontSize: 17, lineHeight: 23 },
  assistantRow: { alignItems: 'flex-start', maxWidth: '88%' },
  assistantMeta: {
    color: '#8E8E93',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
    marginBottom: 4,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.10)',
  },
  assistantText: { color: '#1C1C1E', fontSize: 17, lineHeight: 23 },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#8E8E93' },
  welcome: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  welcomeIcon: {
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  welcomeTitle: { color: '#1C1C1E', fontSize: 22, fontWeight: '700' },
  suggestionList: { marginTop: 20, gap: 8 },
  suggestion: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.10)',
  },
  suggestionText: { color: '#1C1C1E', fontSize: 15, flex: 1 },
  recentHeader: {
    marginTop: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentTitle: { color: '#6C6C70', fontSize: 13, fontWeight: '600' },
  link: { color: '#007AFF', fontSize: 13, fontWeight: '600' },
  recentList: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.10)',
  },
  recentRow: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recentRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
  },
  recentRowPressed: { backgroundColor: 'rgba(118,118,128,0.08)' },
  recentMain: { flex: 1, gap: 2 },
  recentName: { color: '#1C1C1E', fontSize: 15, fontWeight: '600' },
  recentPreview: { color: '#8E8E93', fontSize: 13 },
  recentTime: { color: '#8E8E93', fontSize: 12 },
  composerBar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  toolsButton: { width: 48, height: 48 },
  composerField: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 16,
    paddingRight: 5,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,60,67,0.12)',
  },
  input: { flex: 1, minHeight: 38, maxHeight: 120, paddingTop: 8, paddingBottom: 8, color: '#1C1C1E', fontSize: 17, lineHeight: 22 },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: { backgroundColor: '#1C1C1E' },
  sendButtonDisabled: { backgroundColor: '#C7C7CC' },
  popoverRoot: { flex: 1 },
  popover: { position: 'absolute' },
  popoverShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  popoverCard: { overflow: 'hidden' },
  popoverScrollContent: { paddingVertical: 0 },
  popoverBacking: {
    backgroundColor: 'rgba(255,255,255,0.95)',
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
    borderBottomColor: 'rgba(60,60,67,0.12)',
  },
  popoverRowPressed: { backgroundColor: 'rgba(118,118,128,0.10)' },
  popoverMain: { flex: 1, gap: 1 },
  popoverName: { color: '#1C1C1E', fontSize: 16, fontWeight: '600' },
  popoverVendor: { color: '#8E8E93', fontSize: 12 },
  toolRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  toolMenuLabel: { color: '#1C1C1E', fontSize: 16 },
  sheetRoot: { flex: 1, backgroundColor: '#F2F2F7' },
  sheetContent: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  newConversation: {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  newConversationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newConversationText: { color: '#007AFF', fontSize: 17, fontWeight: '600' },
  groupLabel: { color: '#6C6C70', fontSize: 13, fontWeight: '600', marginLeft: 4, marginTop: 6 },
  historyList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
  },
  historyRow: { flexDirection: 'row', alignItems: 'center' },
  historyRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60,60,67,0.12)',
  },
  historyMain: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 3 },
  historyTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyName: { flexShrink: 1, color: '#1C1C1E', fontSize: 16, fontWeight: '600' },
  historyPreview: { color: '#6C6C70', fontSize: 13 },
  historyMeta: { color: '#8E8E93', fontSize: 11, marginTop: 1 },
  deleteButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  historyEmpty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  historyEmptyTitle: { color: '#1C1C1E', fontSize: 17, fontWeight: '600' },
  historyEmptyCopy: { color: '#8E8E93', fontSize: 13, textAlign: 'center' },
  modelList: { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    minHeight: 74,
  },
  modelMain: { flex: 1, gap: 3 },
  modelName: { color: '#1C1C1E', fontSize: 17, fontWeight: '600' },
  modelVendor: { color: '#6C6C70', fontSize: 13 },
  modelChips: { flexDirection: 'row', gap: 6, marginTop: 2 },
  modelChip: {
    color: '#6C6C70',
    fontSize: 11,
    fontWeight: '500',
    backgroundColor: 'rgba(118,118,128,0.10)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetNote: { color: '#8E8E93', fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 4 },
});
