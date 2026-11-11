import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { cardSurface, pressedSurface, softShadow } from '../material';
import { useKeyboardInsets } from '../useKeyboardInsets';

const ios = Platform.OS === 'ios';

import { GlassPillButton, Group, Sheet, Subpage, palette } from '../ui';
import { streamChat } from '../api/client';

type ChatMessage = { id: number; role: 'user' | 'assistant'; text: string };

const suggestions = ['用三句话介绍阡陌数智', '帮我写一条模型上架公告', '把这段文字改写得更简洁'];

export function ModelExperienceScreen({ onBack, models }: { onBack: () => void; models: string[] }) {
  const insets = useSafeAreaInsets();
  const { inset: keyboardInset } = useKeyboardInsets();
  const [model, setModel] = useState(models[0] ?? '');

  useEffect(() => {
    setModel((current) => (models.includes(current) ? current : models[0] ?? ''));
  }, [models]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [clearedNotice, setClearedNotice] = useState(false);
  const sequence = useRef(0);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const stop = () => {
    generation.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  };

  const send = () => {
    const prompt = draft.trim();
    if (!prompt || busy) {
      return;
    }
    const generationId = generation.current + 1;
    generation.current = generationId;
    const userMessage: ChatMessage = { id: ++sequence.current, role: 'user', text: prompt };
    const assistantId = ++sequence.current;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', text: '' },
    ]);
    setDraft('');
    setClearedNotice(false);
    setBusy(true);

    const history = messages.map((message) => ({ role: message.role, content: message.text }));
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';
    streamChat(
      { model, messages: [...history, { role: 'user', content: prompt }] },
      {
        onDelta: (delta) => {
          if (generation.current !== generationId) return;
          accumulated += delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, text: accumulated } : message,
            ),
          );
        },
        onDone: () => {
          if (generation.current !== generationId) return;
          setBusy(false);
        },
      },
      controller.signal,
    )
      .then(() => {
        if (generation.current === generationId) setBusy(false);
      })
      .catch((error) => {
        if (generation.current !== generationId) return;
        setBusy(false);
        if (error instanceof Error && error.name === 'AbortError') return;
        Alert.alert('发送失败', error instanceof Error ? error.message : '请稍后重试');
      });
  };

  const clear = () => {
    Alert.alert('清空会话？', '当前对话仅保存在本次运行中，清空后无法恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          stop();
          setMessages([]);
          setClearedNotice(true);
        },
      },
    ]);
  };

  return (
    <Subpage
      title="模型体验"
      onBack={onBack}
      right={
        messages.length > 0 ? <GlassPillButton label="清空" onPress={clear} /> : null
      }
    >
      <KeyboardAvoidingView
        style={[styles.flex, { marginBottom: keyboardInset }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={56}
      >
        <View style={styles.modelBar}>
          <View style={styles.modelInfo}>
            <Text style={styles.modelLabel}>当前模型</Text>
            <Text style={styles.modelName}>{model}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setModelSheet(true)}
            style={styles.switchButton}
          >
            <Text style={[styles.switchText, { color: palette.blue }]}>切换</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.messages,
            messages.length === 0 ? styles.messagesEmpty : null,
          ]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <SymbolView
                name="bubble.left.and.bubble.right"
                tintColor={palette.tertiaryLabel}
                style={styles.emptyIcon}
              />
              <Text style={styles.emptyTitle}>开始与模型对话</Text>
              <View style={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    accessibilityRole="button"
                    onPress={() => setDraft(suggestion)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      pressed ? pressedSurface : null,
                    ]}
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
              {clearedNotice ? <Text style={styles.clearedText}>会话已清空</Text> : null}
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubbleRow,
                  message.role === 'user' ? styles.bubbleRowUser : null,
                ]}
              >
                <View
                  style={[
                    styles.bubble,
                    message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      message.role === 'user' ? styles.bubbleTextUser : null,
                    ]}
                  >
                    {message.text || '…'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={[styles.composer, { marginBottom: Math.max(insets.bottom, 20) }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`向 ${model} 提问`}
            placeholderTextColor={palette.tertiaryLabel}
            multiline
            style={styles.composerInput}
          />
          {busy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="停止生成"
              onPress={stop}
              style={styles.stopButton}
            >
              <View style={styles.stopSquare} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="发送"
              accessibilityState={{ disabled: draft.trim().length === 0 }}
              disabled={draft.trim().length === 0}
              onPress={send}
              style={[styles.sendButton, draft.trim().length === 0 ? styles.sendDisabled : null]}
            >
              <AppIcon name="arrow.up" size={18} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={modelSheet} title="选择模型" onClose={() => setModelSheet(false)}>
        <Group header="可用模型">
          {models.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              onPress={() => {
                setModel(item);
                setModelSheet(false);
                stop();
              }}
              style={({ pressed }) => [styles.modelRow, pressed ? styles.modelRowPressed : null]}
            >
              <View style={styles.modelRowMain}>
                <Text style={styles.modelRowName}>{item}</Text>
              </View>
              <Text style={styles.checkmark}>{item === model ? '✓' : ''}</Text>
            </Pressable>
          ))}
        </Group>
      </Sheet>
    </Subpage>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  clearText: {
    fontSize: 16,
  },
  modelBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: ios ? 10 : 12,
    backgroundColor: palette.card,
    ...cardSurface,
  },
  modelInfo: {
    flex: 1,
  },
  modelLabel: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  modelName: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  switchButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  switchText: {
    fontSize: 16,
  },
  messages: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  messagesEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    marginBottom: 4,
  },
  emptyTitle: {
    color: palette.label,
    fontSize: 18,
    fontWeight: '600',
  },
  suggestions: {
    width: '100%',
    gap: 8,
    marginTop: 12,
  },
  suggestion: {
    overflow: 'hidden',
    backgroundColor: palette.card,
    paddingHorizontal: ios ? 14 : 18,
    paddingVertical: ios ? 11 : 14,
    ...cardSurface,
    borderRadius: ios ? 10 : 28,
  },
  suggestionText: {
    color: palette.blue,
    fontSize: 14,
  },
  clearedText: {
    color: palette.secondaryLabel,
    fontSize: 13,
    marginTop: 6,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: ios ? 16 : 20,
    paddingHorizontal: ios ? 14 : 16,
    paddingVertical: ios ? 10 : 12,
  },
  bubbleAssistant: {
    backgroundColor: palette.card,
    borderTopLeftRadius: 4,
    ...softShadow,
  },
  bubbleUser: {
    backgroundColor: palette.blue,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    color: palette.label,
    fontSize: 16,
    lineHeight: 23,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: ios ? 22 : 28,
    backgroundColor: palette.card,
    ...softShadow,
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 108,
    color: palette.label,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: ios ? 34 : 42,
    height: ios ? 34 : 42,
    borderRadius: ios ? 17 : 21,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.35,
  },
  sendIcon: {
    width: 18,
    height: 18,
  },
  sendText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  stopButton: {
    width: ios ? 34 : 42,
    height: ios ? 34 : 42,
    borderRadius: ios ? 17 : 21,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 11,
    height: 11,
    borderRadius: 2,
    backgroundColor: palette.label,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
  },
  modelRowPressed: {
    backgroundColor: palette.fill,
  },
  modelRowMain: {
    flex: 1,
    gap: 2,
  },
  modelRowName: {
    color: palette.label,
    fontSize: 16,
  },
  modelRowNote: {
    color: palette.secondaryLabel,
    fontSize: 12,
    lineHeight: 17,
  },
  checkmark: {
    width: 16,
    color: palette.blue,
    fontSize: 15,
  },
});
