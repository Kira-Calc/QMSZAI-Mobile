import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  type ViewInstance,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chatOnce } from '../api/client';
import { ModelLogo } from '../components/ModelLogo';
import { cardSurface, pressedDim } from '../material';
import { Badge, GlassPillButton, Group, Row, Sheet, Subpage, palette } from '../ui';
import { themedStyles, isDark } from '../theme';
import { RichText } from '../richText';
import { alphabetOf, letterOf, sortModelNames } from '../modelSort';

const ios = Platform.OS === 'ios';

type FusionReply = { model: string; text: string; error?: string };

type FusionMessage = {
  id: number;
  prompt: string;
  answer: string;
  assistants: string[];
  summary: string;
  replies: FusionReply[];
};

export function FusionScreen({ onBack, models }: { onBack: () => void; models: string[] }) {
  const insets = useSafeAreaInsets();
  const [assistants, setAssistants] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sheet, setSheet] = useState<'assistant' | 'summary' | null>(null);
  const [assistantQuery, setAssistantQuery] = useState('');
  const [summaryQuery, setSummaryQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<FusionMessage[]>([]);
  // 安卓键盘覆盖在窗口上，ScrollView 不会自己缩小，需要手动补底部留白才能滚到按钮。
  const [keyboardInset, setKeyboardInset] = useState(0);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sendButtonRef = useRef<ViewInstance>(null);
  const keyboardHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  // 两个模型弹层各自的 A-Z 索引位置。
  const assistantGroupY = useRef(0);
  const assistantBodyY = useRef(0);
  const assistantRowOffsets = useRef<number[]>([]);
  const summaryGroupY = useRef(0);
  const summaryBodyY = useRef(0);
  const summaryRowOffsets = useRef<number[]>([]);
  const sortedModels = useMemo(() => sortModelNames(models), [models]);
  const filterModels = (list: string[], query: string) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((name) => name.toLowerCase().includes(keyword));
  };
  const assistantModels = useMemo(
    () => filterModels(sortedModels, assistantQuery),
    [sortedModels, assistantQuery],
  );
  const summaryModels = useMemo(
    () => filterModels(sortedModels, summaryQuery),
    [sortedModels, summaryQuery],
  );
  const assistantLetters = useMemo(() => alphabetOf(assistantModels), [assistantModels]);
  const summaryLetters = useMemo(() => alphabetOf(summaryModels), [summaryModels]);
  const offsetIn = (
    letter: string,
    list: string[],
    groupY: React.RefObject<number>,
    bodyY: React.RefObject<number>,
    rows: React.RefObject<number[]>,
  ) => {
    const index = list.findIndex((name) => letterOf(name) === letter);
    if (index < 0) return undefined;
    return groupY.current + bodyY.current + (rows.current[index] ?? 0);
  };

  // 键盘弹起后把「发送并融合」按钮滚到键盘上方。
  // 键盘是覆盖在窗口上的（窗口不会缩小），所以用 measureInWindow 拿按钮的屏幕位置，
  // 再和「窗口高度 - 键盘高度」比较，把超出的部分滚出去。
  const revealSendButton = () => {
    const keyboardHeight = keyboardHeightRef.current;
    if (!keyboardHeight) return;
    sendButtonRef.current?.measureInWindow((_x, y, _width, height) => {
      const keyboardTop = Dimensions.get('window').height - keyboardHeight;
      const overflow = y + height + 24 - keyboardTop;
      if (overflow > 4) {
        scrollRef.current?.scrollTo({ y: scrollOffsetRef.current + overflow, animated: true });
      }
    });
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardHeightRef.current = event.endCoordinates.height;
      // iOS 页面本来就不会被键盘挡住，只有安卓需要补留白。
      setKeyboardInset(ios ? 0 : event.endCoordinates.height);
      [60, 240, 480].forEach((delay) => setTimeout(revealSendButton, delay));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      setKeyboardInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const addAssistant = (name: string) => {
    setAssistants((current) => {
      if (current.includes(name)) {
        const next = current.filter((item) => item !== name);
        if (summary === name) setSummary(next[0] ?? null);
        return next;
      }
      if (current.length >= 3) {
        Alert.alert('最多 3 个助手模型', '请先取消一个已选模型。');
        return current;
      }
      const next = [...current, name];
      if (!summary) setSummary(name);
      return next;
    });
  };

  const canSend = prompt.trim().length > 0 && assistants.length > 0 && summary !== null && !busy;

  const send = async () => {
    if (!canSend) return;
    const text = prompt.trim();
    const summaryModel = summary;
    if (!summaryModel) return;
    setBusy(true);
    try {
      const settled = await Promise.allSettled(
        assistants.map(async (name) => ({
          model: name,
          text: await chatOnce({ model: name, messages: [{ role: 'user', content: text }] }),
        })),
      );

      const replies: FusionReply[] = settled.map((result, index) => {
        const name = assistants[index];
        if (result.status === 'fulfilled') {
          return { model: name, text: result.value.text.trim() };
        }
        const reason = result.reason;
        return {
          model: name,
          text: '',
          error: reason instanceof Error ? reason.message : '调用失败',
        };
      });

      const successful = replies.filter((reply) => reply.text);
      if (!successful.length) {
        throw new Error(replies[0]?.error || '所有助手模型均调用失败');
      }

      const merged = await chatOnce({
        model: summaryModel,
        messages: [
          {
            role: 'system',
            content:
              '你是融合助手。请综合多个模型对同一问题的回答，去重、互补、纠正错误，输出一段结构清晰的中文最终答案。',
          },
          {
            role: 'user',
            content: `问题：${text}\n\n${successful
              .map((reply, index) => `模型 ${index + 1}（${reply.model}）：\n${reply.text}`)
              .join('\n\n')}`,
          },
        ],
      });

      setMessages((current) => [
        {
          id: Date.now(),
          prompt: text,
          assistants: [...assistants],
          summary: summaryModel,
          replies,
          answer: merged.trim() || successful[0].text,
        },
        ...current,
      ]);
      setPrompt('');
    } catch (error) {
      Alert.alert('融合失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setPrompt('');
    setAssistants([]);
    setSummary(null);
  };

  return (
    <Subpage
      title="模型融合"
      onBack={onBack}
      right={messages.length > 0 ? <GlassPillButton label="新建" onPress={reset} /> : null}
    >
      <ScrollView
        ref={scrollRef}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        onContentSizeChange={() => {
          if (keyboardHeightRef.current) revealSendButton();
        }}
        scrollEventThrottle={32}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 24 + insets.bottom + keyboardInset },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>多模型协作</Text>
            <Badge text="beta" tone="info" />
          </View>
        </View>

        <Group header="模型配置">
          <Row
            title="助手模型"
            value={assistants.length > 0 ? `${assistants.length}/3` : '选择模型'}
            chevron
            onPress={() => {
              setAssistantQuery('');
              setSheet('assistant');
            }}
          />
          <Row
            title="总结模型"
            value={summary ?? '选择模型'}
            chevron
            onPress={() => {
              setSummaryQuery('');
              setSheet('summary');
            }}
          />
        </Group>

        {assistants.length > 0 ? (
          <View style={styles.tags}>
            {assistants.map((name) => (
              <View key={name} style={styles.tag}>
                <Text style={styles.tagText}>{name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.inputCard}>
          <TextInput
            keyboardAppearance={isDark() ? 'dark' : 'light'}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="说点什么…"
            placeholderTextColor={palette.tertiaryLabel}
            multiline
            maxLength={500}
            style={styles.input}
          />
          <Text style={styles.counter}>{prompt.length}/500</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          ref={sendButtonRef}
          onPress={send}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend ? styles.disabled : null,
            pressed ? pressedDim : null,
          ]}
        >
          <Text style={styles.sendText}>{busy ? '融合中…' : '发送并融合'}</Text>
        </Pressable>

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>本次会话</Text>
          {messages.length > 0 ? <Text style={styles.sectionMeta}>{messages.length} 条</Text> : null}
        </View>

        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>暂无会话</Text>
          </View>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={styles.resultCard}>
              <Text style={styles.resultPrompt}>{message.prompt}</Text>
              <View style={styles.resultBadges}>
                <Badge text="融合结果" tone="success" />
                <Text style={styles.resultMeta}>总结：{message.summary}</Text>
              </View>
              <RichText text={message.answer} style={styles.resultAnswer} />
              {message.replies.map((reply) => (
                <View key={reply.model} style={styles.replyBlock}>
                  <Text style={styles.replyModel}>{reply.model}</Text>
                  {reply.error ? (
                    <Text style={[styles.replyText, styles.replyError]} numberOfLines={3}>
                      {reply.error}
                    </Text>
                  ) : (
                    <RichText text={reply.text} style={styles.replyText} />
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Sheet
        visible={sheet === 'assistant'}
        title="选择助手模型"
        onClose={() => {
          setSheet(null);
          setAssistantQuery('');
        }}
        indexLetters={assistantLetters}
        indexOffsetFor={(letter) =>
          offsetIn(letter, assistantModels, assistantGroupY, assistantBodyY, assistantRowOffsets)
        }
        searchValue={assistantQuery}
        onSearchChange={setAssistantQuery}
        empty={assistantModels.length === 0}
      >
        <Group
          header="最多选择 3 个"
          onLayout={(event) => {
            assistantGroupY.current = event.nativeEvent.layout.y;
          }}
          onBodyLayout={(event) => {
            assistantBodyY.current = event.nativeEvent.layout.y;
          }}
        >
          {assistantModels.map((name, index) => (
            <Row
              key={name}
              title={name}
              leading={<ModelLogo name={name} size={24} />}
              value={assistants.includes(name) ? '✓' : undefined}
              onLayout={(event) => {
                assistantRowOffsets.current[index] = event.nativeEvent.layout.y;
              }}
              onPress={() => addAssistant(name)}
            />
          ))}
        </Group>
      </Sheet>

      <Sheet
        visible={sheet === 'summary'}
        title="选择总结模型"
        onClose={() => {
          setSheet(null);
          setSummaryQuery('');
        }}
        indexLetters={summaryLetters}
        indexOffsetFor={(letter) =>
          offsetIn(letter, summaryModels, summaryGroupY, summaryBodyY, summaryRowOffsets)
        }
        searchValue={summaryQuery}
        onSearchChange={setSummaryQuery}
        empty={summaryModels.length === 0}
      >
        <Group
          onLayout={(event) => {
            summaryGroupY.current = event.nativeEvent.layout.y;
          }}
          onBodyLayout={(event) => {
            summaryBodyY.current = event.nativeEvent.layout.y;
          }}
        >
          {summaryModels.map((name, index) => (
            <Row
              key={name}
              title={name}
              leading={<ModelLogo name={name} size={24} />}
              value={summary === name ? '✓' : undefined}
              onLayout={(event) => {
                summaryRowOffsets.current[index] = event.nativeEvent.layout.y;
              }}
              onPress={() => {
                setSummary(name);
                setSheet(null);
              }}
            />
          ))}
        </Group>
      </Sheet>
    </Subpage>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  hero: {
    backgroundColor: palette.card,
    padding: ios ? 16 : 18,
    gap: 6,
    ...cardSurface,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginHorizontal: 4,
  },
  tag: {
    backgroundColor: palette.fill,
    borderRadius: ios ? 6 : 8,
    paddingHorizontal: ios ? 8 : 10,
    paddingVertical: ios ? 3 : 4,
  },
  tagText: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  inputCard: {
    backgroundColor: palette.card,
    padding: ios ? 14 : 16,
    gap: 6,
    ...cardSurface,
  },
  input: {
    minHeight: 96,
    color: palette.label,
    fontSize: 16,
    lineHeight: 23,
    padding: 0,
    textAlignVertical: 'top',
  },
  counter: {
    color: palette.tertiaryLabel,
    fontSize: 12,
    textAlign: 'right',
  },
  sendButton: {
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.blue,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionTitle: {
    color: palette.secondaryLabel,
    fontSize: ios ? 13 : 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  sectionMeta: {
    color: palette.tertiaryLabel,
    fontSize: 12,
    marginRight: 4,
  },
  empty: {
    backgroundColor: palette.card,
    padding: 24,
    ...cardSurface,
    alignItems: 'center',
    gap: 5,
  },
  emptyTitle: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: palette.card,
    padding: ios ? 16 : 18,
    gap: 8,
    ...cardSurface,
  },
  resultPrompt: {
    color: palette.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  resultBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultMeta: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  resultAnswer: {
    color: palette.label,
    fontSize: 15,
    lineHeight: 22,
  },
  replyBlock: {
    backgroundColor: palette.fill,
    borderRadius: ios ? 8 : 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  replyModel: {
    color: palette.tertiaryLabel,
    fontSize: 11,
  },
  replyText: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
  },
  replyError: {
    color: palette.red,
  },
}));
