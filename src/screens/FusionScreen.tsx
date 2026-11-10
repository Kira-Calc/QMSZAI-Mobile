import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge, GlassPillButton, Group, Row, Sheet, Subpage, palette } from '../ui';

const fusionModels = [
  'GLM-4-Flash_免费',
  'deepseek-flash_官方',
  'claude-sonnet-4.5',
  'gpt-6.1-terra',
  'Qwen3-Max',
];

const presets: Array<{
  key: string;
  assistants: string[];
  summary: string;
}> = [
  { key: '高质量', assistants: ['gpt-6.1-terra', 'claude-sonnet-4.5', 'deepseek-flash_官方'], summary: 'gpt-6.1-terra' },
  { key: '低成本', assistants: ['GLM-4-Flash_免费', 'deepseek-flash_官方'], summary: 'deepseek-flash_官方' },
  { key: '快速', assistants: ['deepseek-flash_官方', 'GLM-4-Flash_免费'], summary: 'GLM-4-Flash_免费' },
];

type FusionMessage = {
  id: number;
  prompt: string;
  answer: string;
  assistants: string[];
  summary: string;
};

export function FusionScreen({ onBack }: { onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const [assistants, setAssistants] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sheet, setSheet] = useState<'assistant' | 'summary' | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<FusionMessage[]>([]);

  const addAssistant = (name: string) => {
    setAssistants((current) => {
      if (current.includes(name)) {
        return current.filter((item) => item !== name);
      }
      if (current.length >= 3) {
        Alert.alert('最多 3 个助手模型', '请先取消一个已选模型。');
        return current;
      }
      return [...current, name];
    });
  };

  const applyPreset = (key: string) => {
    const preset = presets.find((item) => item.key === key);
    if (!preset) {
      return;
    }
    setAssistants(preset.assistants);
    setSummary(preset.summary);
  };

  const activePreset = presets.find(
    (preset) =>
      preset.summary === summary &&
      preset.assistants.length === assistants.length &&
      preset.assistants.every((name) => assistants.includes(name)),
  )?.key;

  const canSend =
    prompt.trim().length > 0 && assistants.length > 0 && summary !== null && !busy;

  const send = () => {
    if (!canSend) {
      return;
    }
    const text = prompt.trim();
    setBusy(true);
    setTimeout(() => {
      setMessages((current) => [
        {
          id: Date.now(),
          prompt: text,
          assistants: [...assistants],
          summary: summary ?? '',
          answer: `${assistants.length} 个助手模型已分别处理该问题，并由 ${summary} 完成汇总。\n\n这是模型融合的模拟结果：不同模型的观点在此合并为一段回答，真实接入后会显示各助手的独立回复、汇总耗时与用量。\n\n当前问题：“${text}”`,
        },
        ...current,
      ]);
      setPrompt('');
      setBusy(false);
    }, 1800);
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
      right={
        messages.length > 0 ? <GlassPillButton label="新建" onPress={reset} /> : null
      }
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle}>多模型协作</Text>
            <Badge text="beta" tone="info" />
          </View>
        </View>

        <View style={styles.presetBlock}>
          <Text style={styles.presetLabel}>快速选择</Text>
          <View style={styles.presets}>
            {presets.map((preset) => {
              const active = activePreset === preset.key;
              return (
                <Pressable
                  key={preset.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => applyPreset(preset.key)}
                  style={[styles.presetChip, active ? styles.presetChipActive : null]}
                >
                  <Text style={[styles.presetText, active ? styles.presetTextActive : null]}>
                    {preset.key}
                  </Text>
                </Pressable>
              );
            })}
            <View style={[styles.presetChip, !activePreset ? styles.presetChipActive : null]}>
              <Text style={[styles.presetText, !activePreset ? styles.presetTextActive : null]}>
                自定义
              </Text>
            </View>
          </View>
        </View>

        <Group
          header="模型配置"
        >
          <Row
            title="助手模型"
            value={assistants.length > 0 ? `${assistants.length}/3` : '选择模型'}
            chevron
            onPress={() => setSheet('assistant')}
          />
          <Row
            title="总结模型"
            value={summary ?? '选择模型'}
            chevron
            onPress={() => setSheet('summary')}
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
          onPress={send}
          style={[styles.sendButton, !canSend ? styles.disabled : null]}
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
            <Text style={styles.emptyCopy}>选择模型并输入问题，融合结果会显示在这里。</Text>
          </View>
        ) : (
          messages.map((message) => (
            <View key={message.id} style={styles.resultCard}>
              <Text style={styles.resultPrompt}>{message.prompt}</Text>
              <View style={styles.resultBadges}>
                <Badge text="融合结果" tone="success" />
                <Text style={styles.resultMeta}>总结：{message.summary}</Text>
              </View>
              <Text style={styles.resultAnswer}>{message.answer}</Text>
              <Text style={styles.resultModels}>
                助手：{message.assistants.join('、')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <Sheet
        visible={sheet === 'assistant'}
        title="选择助手模型"
        onClose={() => setSheet(null)}
      >
        <Group header="最多选择 3 个">
          {fusionModels.map((name) => (
            <Row
              key={name}
              title={name}
              value={assistants.includes(name) ? '✓' : undefined}
              onPress={() => addAssistant(name)}
            />
          ))}
        </Group>
      </Sheet>

      <Sheet visible={sheet === 'summary'} title="选择总结模型" onClose={() => setSheet(null)}>
        <Group>
          {fusionModels.map((name) => (
            <Row
              key={name}
              title={name}
              value={summary === name ? '✓' : undefined}
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

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  resetText: {
    fontSize: 16,
  },
  hero: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 16,
    gap: 6,
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
  presetBlock: {
    gap: 8,
  },
  presetLabel: {
    color: palette.secondaryLabel,
    fontSize: 13,
    marginLeft: 16,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChipActive: {
    backgroundColor: palette.blue,
  },
  presetText: {
    color: palette.secondaryLabel,
    fontSize: 14,
  },
  presetTextActive: {
    color: '#FFFFFF',
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  inputCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
    gap: 6,
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
    minHeight: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: palette.blue,
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
    fontSize: 13,
    marginLeft: 16,
  },
  sectionMeta: {
    color: palette.tertiaryLabel,
    fontSize: 12,
    marginRight: 16,
  },
  empty: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 24,
    alignItems: 'center',
    gap: 5,
  },
  emptyTitle: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyCopy: {
    color: palette.secondaryLabel,
    fontSize: 13,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: palette.card,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 16,
    gap: 8,
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
  resultModels: {
    color: palette.tertiaryLabel,
    fontSize: 12,
  },
});
