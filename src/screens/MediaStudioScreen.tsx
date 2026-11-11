import { useRef, useState } from 'react';
import {
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

import {
  Badge,
  EmptyState,
  Group,
  Row,
  Segmented,
  Sheet,
  animateContentChange,
  Subpage,
  palette,
  type Tone,
} from '../ui';
import { cardSurface, pressedDim, pressedSurface, softShadow } from '../material';
import { useKeyboardInsets } from '../useKeyboardInsets';

const ios = Platform.OS === 'ios';
import type { MediaGeneration, MediaKind, TaskKind } from '../types';

type ParamConfig = { key: string; label: string; options: string[]; value: string };

type MediaConfig = {
  label: string;
  model: string;
  cost: number;
  taskKind: TaskKind;
  action: string;
  promptLabel: string;
  placeholder: string;
  params: ParamConfig[];
};

const configs: Record<MediaKind, MediaConfig> = {
  image: {
    label: '图片',
    model: 'image-01',
    cost: 0.2,
    taskKind: 'image',
    action: '生成图片',
    promptLabel: '图片描述',
    placeholder: '例如：雨后的山间小屋，暖色灯光，电影感构图',
    params: [
      { key: '尺寸', label: '尺寸', options: ['1024 x 1024', '768 x 1024', '1024 x 768'], value: '1024 x 1024' },
      { key: '品质', label: '品质', options: ['标准', '高清'], value: '标准' },
      { key: '风格', label: '风格', options: ['鲜明 (Vivid)', '自然 (Natural)'], value: '鲜明 (Vivid)' },
      { key: '数量', label: '数量', options: ['1 张', '2 张', '4 张'], value: '1 张' },
    ],
  },
  video: {
    label: '视频',
    model: 'cogvideox-3',
    cost: 2.6,
    taskKind: 'video',
    action: '生成视频',
    promptLabel: '视频描述',
    placeholder: '例如：镜头缓慢推进，展示城市清晨的街道与行人',
    params: [
      { key: '时长', label: '时长（秒）', options: ['5 秒', '10 秒'], value: '5 秒' },
      { key: '宽高比', label: '宽高比', options: ['16:9', '9:16', '1:1'], value: '16:9' },
      { key: '分辨率', label: '分辨率', options: ['1280x720', '720x1280'], value: '1280x720' },
    ],
  },
  music: {
    label: '音乐',
    model: 'music-2.5',
    cost: 1.2,
    taskKind: 'music',
    action: '生成音乐',
    promptLabel: '音乐描述',
    placeholder: '例如：轻快的民谣，木吉他与口琴，适合清晨通勤',
    params: [
      { key: '风格', label: '风格', options: ['流行', '民谣', '电子', '古典'], value: '流行' },
      { key: '情绪', label: '情绪', options: ['温暖', '明亮', '安静', '振奋'], value: '温暖' },
      { key: '格式', label: '输出格式', options: ['MP3', 'WAV'], value: 'MP3' },
    ],
  },
  voice: {
    label: '语音',
    model: 'speech-01-hd',
    cost: 0.05,
    taskKind: 'voice',
    action: '生成语音',
    promptLabel: '合成文本',
    placeholder: '输入要朗读的文字，最多 4096 字',
    params: [
      { key: '音色', label: '音色', options: ['沉稳高管', '温柔女声', '清朗男声', '活力主播'], value: '沉稳高管' },
      { key: '语速', label: '语速', options: ['0.8x', '1.0x', '1.2x', '1.5x'], value: '1.0x' },
    ],
  },
};

const kindOrder: MediaKind[] = ['image', 'video', 'music', 'voice'];

const voicePresets = ['晨间播报', '产品介绍', '有声书片段'];

const initialValues = kindOrder.reduce<Record<MediaKind, Record<string, string>>>(
  (accumulator, kind) => {
    accumulator[kind] = Object.fromEntries(
      configs[kind].params.map((param) => [param.key, param.value]),
    );
    return accumulator;
  },
  {} as Record<MediaKind, Record<string, string>>,
);

const initialPrompts: Record<MediaKind, string> = {
  image: '',
  video: '',
  music: '',
  voice: '',
};

export function MediaStudioScreen({
  onBack,
  onCreateTask,
}: {
  onBack: () => void;
  onCreateTask: (input: { title: string; kind: TaskKind; cost: number }) => void;
}) {
  const insets = useSafeAreaInsets();
  const { inset: keyboardInset } = useKeyboardInsets();
  const [kind, setKind] = useState<MediaKind>('image');
  const [prompts, setPrompts] = useState(initialPrompts);
  const [lyrics, setLyrics] = useState('');
  const [values, setValues] = useState(initialValues);
  const [picker, setPicker] = useState<{
    key: string;
    label: string;
    options: string[];
  } | null>(null);
  const [generations, setGenerations] = useState<MediaGeneration[]>([]);
  const [selected, setSelected] = useState<MediaGeneration | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);

  const config = configs[kind];
  const prompt = prompts[kind];
  const currentValues = values[kind];
  const canSubmit = prompt.trim().length > 0 && !busy;

  const setPrompt = (text: string) => {
    setPrompts((current) => ({ ...current, [kind]: text }));
  };

  const setParam = (key: string, value: string) => {
    setValues((current) => ({
      ...current,
      [kind]: { ...current[kind], [key]: value },
    }));
  };

  const summary = () => {
    if (kind === 'image') {
      return `${currentValues['尺寸']} · ${currentValues['数量']}`;
    }
    if (kind === 'video') {
      return `${currentValues['时长']} · ${currentValues['宽高比']} · ${currentValues['分辨率']}`;
    }
    if (kind === 'music') {
      return `${currentValues['风格']} · ${currentValues['情绪']}${lyrics.trim() ? ' · 含歌词' : ' · 纯音乐'}`;
    }
    return `${currentValues['音色']} · 语速 ${currentValues['语速']}`;
  };

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    const id = `gen-${++sequence.current}`;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const record: MediaGeneration = {
      id,
      kind,
      prompt: prompt.trim(),
      model: config.model,
      status: 'running',
      createdAt: time,
      cost: config.cost,
      summary: summary(),
    };
    setGenerations((current) => [record, ...current]);
    onCreateTask({
      title: `${config.label}：${prompt.trim().slice(0, 18)}${prompt.trim().length > 18 ? '…' : ''}`,
      kind: config.taskKind,
      cost: config.cost,
    });
    setBusy(true);
    setTimeout(() => {
      setGenerations((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'succeeded',
                summary: `${item.summary} · 模拟结果已生成`,
              }
            : item,
        ),
      );
      setBusy(false);
    }, 2200);
  };

  const statusMeta: Record<MediaGeneration['status'], { label: string; tone: Tone }> = {
    running: { label: '生成中', tone: 'info' },
    succeeded: { label: '已完成', tone: 'success' },
    failed: { label: '失败', tone: 'danger' },
  };

  return (
    <Subpage title="AI 创作" onBack={onBack}>
      <KeyboardAvoidingView
        style={[styles.flex, { marginBottom: keyboardInset }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={60}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Segmented
            values={kindOrder.map((item) => configs[item].label)}
            selectedIndex={kindOrder.indexOf(kind)}
            onChange={(index) => {
              animateContentChange();
              setKind(kindOrder[index]);
            }}
          />

          <View style={styles.hero}>
            <Text style={styles.heroTitle}>{config.action.replace('生成', '用 AI 生成')}</Text>
          </View>

          {kind === 'voice' ? (
            <View style={styles.presets}>
              {voicePresets.map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  onPress={() => setPrompt(`${preset}：欢迎使用阡陌数智语音合成，这是一段用于移动端演示的示例文本。`)}
                  style={({ pressed }) => [
                    styles.presetChip,
                    pressed ? pressedSurface : null,
                  ]}
                >
                  <Text style={styles.presetText}>{preset}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.inputCard}>
            <View style={styles.inputHeader}>
              <Text style={styles.inputLabel}>{config.promptLabel}</Text>
              <Text style={styles.counter}>
                {prompt.length}/{kind === 'voice' ? 4096 : 1000}
              </Text>
            </View>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder={config.placeholder}
              placeholderTextColor={palette.tertiaryLabel}
              multiline
              style={styles.promptInput}
            />
          </View>

          {kind === 'music' ? (
            <View style={styles.inputCard}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>歌词（可选）</Text>
                <Text style={styles.counter}>{lyrics.length}/3500</Text>
              </View>
              <TextInput
                value={lyrics}
                onChangeText={setLyrics}
                placeholder={'支持 [Intro]、[Verse]、[Chorus]、[Bridge]、[Outro] 标签'}
                placeholderTextColor={palette.tertiaryLabel}
                multiline
                style={[styles.promptInput, styles.lyricsInput]}
              />
            </View>
          ) : null}

          <Group header="生成参数" footer={`模型 ${config.model} · 预计消耗 ¥${config.cost.toFixed(2)}`}>
            <Row title="模型" value={config.model} />
            {config.params.map((param) => (
              <Row
                key={param.key}
                title={param.label}
                value={currentValues[param.key]}
                chevron
                onPress={() =>
                  setPicker({
                    key: param.key,
                    label: param.label,
                    options: param.options,
                  })
                }
              />
            ))}
          </Group>

          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>本次生成记录</Text>
            {generations.length > 0 ? (
              <Text style={styles.sectionMeta}>{generations.length} 条</Text>
            ) : null}
          </View>

          {generations.length === 0 ? (
            <EmptyState
              title="还没有生成记录"
              message="提交后这里会显示进度与结果；记录仅保留在本次运行中。"
              icon="sparkles"
            />
          ) : (
            <Group>
              {generations.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(item)}
                  style={({ pressed }) => [styles.genRow, pressed ? styles.genRowPressed : null]}
                >
                  <View style={styles.genTop}>
                    <Text style={styles.genTitle} numberOfLines={1}>
                      {item.prompt}
                    </Text>
                    <Badge
                      text={statusMeta[item.status].label}
                      tone={statusMeta[item.status].tone}
                    />
                  </View>
                  <Text style={styles.genMeta}>
                    {configs[item.kind].label} · {item.model} · {item.createdAt}
                  </Text>
                  <View style={styles.genBottom}>
                    <Text style={styles.genSummary} numberOfLines={1}>
                      {item.summary}
                    </Text>
                    <Text style={styles.genCost}>¥{item.cost.toFixed(2)}</Text>
                  </View>
                </Pressable>
              ))}
            </Group>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 8 + insets.bottom }]}>
          <View style={styles.footerMeta}>
            <Text style={styles.footerCost}>¥{config.cost.toFixed(2)}</Text>
            <Text style={styles.footerHint}>模拟计费</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.submitButton,
              !canSubmit ? styles.submitDisabled : null,
              pressed ? pressedDim : null,
            ]}
          >
            <Text style={styles.submitText}>{busy ? '正在提交…' : config.action}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={picker !== null} title={picker?.label ?? ''} onClose={() => setPicker(null)}>
        {picker ? (
          <Group>
            {picker.options.map((option) => (
              <Row
                key={option}
                title={option}
                value={currentValues[picker.key] === option ? '✓' : undefined}
                onPress={() => {
                  setParam(picker.key, option);
                  setPicker(null);
                }}
              />
            ))}
          </Group>
        ) : null}
      </Sheet>

      <Sheet visible={selected !== null} title="生成详情" onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <View style={styles.detailHeading}>
              <Text style={styles.detailTitle}>{selected.prompt}</Text>
              <Badge
                text={statusMeta[selected.status].label}
                tone={statusMeta[selected.status].tone}
              />
            </View>
            <Group>
              <Row title="类型" value={configs[selected.kind].label} />
              <Row title="模型" value={selected.model} />
              <Row title="参数" value={selected.summary} />
              <Row title="提交时间" value={selected.createdAt} />
              <Row title="费用" value={`¥${selected.cost.toFixed(2)}`} />
            </Group>
            <Text style={styles.detailNote}>
              演示模式不会生成真实媒体文件。接入真实接口后，可在此预览、下载或重新生成。
            </Text>
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  hero: {
    backgroundColor: palette.card,
    padding: ios ? 16 : 18,
    gap: 5,
    ...cardSurface,
  },
  heroTitle: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    borderRadius: ios ? 16 : 18,
    overflow: 'hidden',
    backgroundColor: palette.card,
    paddingHorizontal: ios ? 12 : 16,
    paddingVertical: ios ? 7 : 9,
    ...softShadow,
  },
  presetText: {
    color: palette.blue,
    fontSize: 13,
  },
  inputCard: {
    backgroundColor: palette.card,
    paddingHorizontal: ios ? 16 : 18,
    paddingVertical: ios ? 12 : 14,
    gap: 8,
    ...cardSurface,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  counter: {
    color: palette.tertiaryLabel,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  promptInput: {
    minHeight: 92,
    color: palette.label,
    fontSize: 16,
    lineHeight: 23,
    padding: 0,
    textAlignVertical: 'top',
  },
  lyricsInput: {
    minHeight: 64,
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
  genRow: {
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
    gap: 5,
  },
  genRowPressed: {
    backgroundColor: palette.fill,
  },
  genTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  genTitle: {
    flex: 1,
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  genMeta: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  genBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  genSummary: {
    flex: 1,
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  genCost: {
    color: palette.secondaryLabel,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: palette.groupedBackground,
  },
  footerMeta: {
    flex: 1,
  },
  footerCost: {
    color: palette.label,
    fontSize: 17,
    fontWeight: '600',
  },
  footerHint: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  submitButton: {
    minWidth: 168,
    overflow: 'hidden',
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  detailHeading: {
    gap: 8,
    paddingHorizontal: 4,
  },
  detailTitle: {
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 29,
  },
  detailNote: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
