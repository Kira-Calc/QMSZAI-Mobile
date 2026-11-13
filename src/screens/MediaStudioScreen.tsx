import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { themedStyles, isDark } from '../theme';
import { useKeyboardInsets } from '../useKeyboardInsets';

import {
  fetchAudioTask,
  fetchMusicTask,
  fetchMusicV3Task,
  fetchVideoCapabilities,
  fetchVideoTask,
  fetchVoices,
  generateImageSync,
  submitMusicTask,
  submitMusicV3,
  submitVideoTask,
} from '../api/endpoints';
import { speechToFile, writeBase64Audio } from '../api/client';
import type { PricingPayload } from '../api/types';
import type { MediaGeneration, MediaKind, Model, TaskKind } from '../types';
import {
  firstMediaUrl,
  modelsForKind,
  priceLabelOf,
  taskErrorOf,
  taskIdOf,
  taskProgressOf,
  taskStateOf,
} from '../services/mediaModels';
import { t, tf } from '../i18n';

const ios = Platform.OS === 'ios';

type ParamConfig = { key: string; label: string; options: string[] };

type MediaConfig = {
  label: string;
  taskKind: TaskKind;
  action: string;
  hero: string;
  promptLabel: string;
  placeholder: string;
};

// 文案随语言切换，必须在渲染时求值。
function buildConfigs(): Record<MediaKind, MediaConfig> {
  return {
    image: {
      label: t('图片'),
      taskKind: 'image',
      action: t('生成图片'),
      hero: t('用 AI 生成图片'),
      promptLabel: t('图片描述'),
      placeholder: t('例如：雨后的山间小屋，暖色灯光，电影感构图'),
    },
    video: {
      label: t('视频'),
      taskKind: 'video',
      action: t('生成视频'),
      hero: t('用 AI 生成视频'),
      promptLabel: t('视频描述'),
      placeholder: t('例如：镜头缓慢推进，展示城市清晨的街道与行人'),
    },
    music: {
      label: t('音乐'),
      taskKind: 'music',
      action: t('生成音乐'),
      hero: t('用 AI 生成音乐'),
      promptLabel: t('音乐描述'),
      placeholder: t('例如：轻快的民谣，木吉他与口琴，适合清晨通勤'),
    },
    voice: {
      label: t('语音'),
      taskKind: 'voice',
      action: t('生成语音'),
      hero: t('用 AI 生成语音'),
      promptLabel: t('合成文本'),
      placeholder: t('输入要朗读的文字，最多 4096 字'),
    },
  };
}

const kindOrder: MediaKind[] = ['image', 'video', 'music', 'voice'];

const defaultValues: Record<MediaKind, Record<string, string>> = {
  image: { 尺寸: '1024x1024', 数量: '1' },
  video: { 时长: '5', 宽高比: '16:9', 分辨率: '720P' },
  music: { 时长: '30' },
  voice: { 音色: '' },
};

const initialPrompts: Record<MediaKind, string> = {
  image: '',
  video: '',
  music: '',
  voice: '',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return t('生成失败，请稍后重试');
}

export function MediaStudioScreen({
  onBack,
  models,
  pricing,
  group,
}: {
  onBack: () => void;
  models: Model[];
  pricing: PricingPayload | null;
  group?: string;
}) {
  const insets = useSafeAreaInsets();
  const { inset: keyboardInset } = useKeyboardInsets();
  // 文案随语言切换，放在渲染期求值。
  const configs = buildConfigs();
  const voicePresets = [t('晨间播报'), t('产品介绍'), t('有声书片段')];
  const [kind, setKind] = useState<MediaKind>('image');
  const [prompts, setPrompts] = useState(initialPrompts);
  const [lyrics, setLyrics] = useState('');
  const [values, setValues] = useState(defaultValues);
  const [selectedModels, setSelectedModels] = useState<Record<MediaKind, string>>({
    image: '',
    video: '',
    music: '',
    voice: '',
  });
  const [picker, setPicker] = useState<{
    key: string;
    label: string;
    options: string[];
  } | null>(null);
  const [generations, setGenerations] = useState<MediaGeneration[]>([]);
  const [selected, setSelected] = useState<MediaGeneration | null>(null);
  const [busy, setBusy] = useState(false);
  const [voices, setVoices] = useState<Array<{ label: string; value: string }>>([]);
  const [capabilities, setCapabilities] = useState<{
    aspect_ratios: string[];
    durations: number[];
    resolutions: string[];
  } | null>(null);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const playAudio = async (uri: string) => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
      playerRef.current?.remove();
      const player = createAudioPlayer({ uri });
      playerRef.current = player;
      player.play();
    } catch (error) {
      Alert.alert(t('播放失败'), errorMessage(error));
    }
  };

  const config = configs[kind];
  const prompt = prompts[kind];
  const currentValues = values[kind];
  const availableModels = (() => {
    const list = modelsForKind(models, kind);
    // music-2.x 上游已停止新用户服务，优先选 music-3.0。
    if (kind === 'music') {
      return [...list].sort(
        (a, b) => Number(b.startsWith('music-3')) - Number(a.startsWith('music-3')),
      );
    }
    return list;
  })();
  const model = selectedModels[kind] || availableModels[0] || '';

  useEffect(() => {
    if (!availableModels.length) return;
    if (!availableModels.includes(selectedModels[kind])) {
      setSelectedModels((current) => ({ ...current, [kind]: availableModels[0] }));
    }
  }, [availableModels, kind, selectedModels]);

  useEffect(() => {
    if (kind !== 'voice' || !model) return;
    let active = true;
    fetchVoices(model)
      .then((list) => {
        if (!active) return;
        // 站点返回 {label,value}：界面显示 label，提交时用 value。
        const next = (Array.isArray(list) ? list : [])
          .map((item) => {
            if (typeof item === 'string') return { label: item, value: item };
            if (item && typeof item === 'object') {
              const record = item as Record<string, string | undefined>;
              const value = record.value || record.name || record.voice || record.id || '';
              return value ? { label: record.label || value, value } : null;
            }
            return null;
          })
          .filter((item): item is { label: string; value: string } => Boolean(item));
        setVoices(next);
        if (next.length) {
          setValues((current) => {
            const labels = next.map((item) => item.label);
            return {
              ...current,
              voice: {
                ...current.voice,
                音色: labels.includes(current.voice.音色) ? current.voice.音色 : next[0].label,
              },
            };
          });
        }
      })
      .catch(() => {
        if (active) setVoices([]);
      });
    return () => {
      active = false;
    };
  }, [kind, model]);

  useEffect(() => {
    if (kind !== 'video' || !model) return;
    let active = true;
    fetchVideoCapabilities(model)
      .then((result) => {
        if (!active || !result) return;
        const next = {
          aspect_ratios: result.aspect_ratios?.length ? result.aspect_ratios : ['16:9'],
          durations: result.durations?.length ? result.durations : [5],
          resolutions: result.resolutions?.length ? result.resolutions : ['720P'],
        };
        setCapabilities(next);
        // 站点返回的分辨率形如 1280x720，需要把默认值换成列表内的合法项。
        setValues((current) => {
          const video = current.video;
          const resolution = next.resolutions.includes(video.分辨率)
            ? video.分辨率
            : next.resolutions.find((item) => item.includes('720')) ?? next.resolutions[0];
          const duration = next.durations.map(String).includes(video.时长)
            ? video.时长
            : String(next.durations[0]);
          const aspect = next.aspect_ratios.includes(video.宽高比)
            ? video.宽高比
            : next.aspect_ratios[0];
          return { ...current, video: { ...video, 分辨率: resolution, 时长: duration, 宽高比: aspect } };
        });
      })
      .catch(() => {
        if (active) setCapabilities(null);
      });
    return () => {
      active = false;
    };
  }, [kind, model]);

  const params: ParamConfig[] = (() => {
    if (kind === 'image') {
      return [
        { key: t('尺寸'), label: t('尺寸'), options: ['1024x1024', '1024x768', '768x1024'] },
        { key: t('数量'), label: t('数量'), options: ['1', '2', '4'] },
      ];
    }
    if (kind === 'video') {
      return [
        {
          key: t('时长'),
          label: t('时长（秒）'),
          options: (capabilities?.durations ?? [5, 10]).map(String),
        },
        {
          key: t('宽高比'),
          label: t('宽高比'),
          options: capabilities?.aspect_ratios ?? ['16:9', '9:16', '1:1'],
        },
        {
          key: t('分辨率'),
          label: t('分辨率'),
          options: capabilities?.resolutions ?? ['720P', '1080P'],
        },
      ];
    }
    if (kind === 'music') {
      return [{ key: t('时长'), label: t('时长（秒）'), options: ['30', '60', '90'] }];
    }
    return [
      {
        key: t('音色'),
        label: t('音色'),
        options: voices.length ? voices.map((item) => item.label) : ['default'],
      },
    ];
  })();

  const setPrompt = (text: string) => {
    setPrompts((current) => ({ ...current, [kind]: text }));
  };

  const setParam = (key: string, value: string) => {
    setValues((current) => ({
      ...current,
      [kind]: { ...current[kind], [key]: value },
    }));
  };

  const voiceValue = (label: string) =>
    voices.find((item) => item.label === label)?.value ?? (label === 'default' ? '' : label);

  const summary = () => {
    if (kind === 'image') {
      return tf('{0} · {1} 张', currentValues.尺寸, currentValues.数量);
    }
    if (kind === 'video') {
      return tf('{0} 秒 · {1} · {2}', currentValues.时长, currentValues.宽高比, currentValues.分辨率);
    }
    if (kind === 'music') {
      return lyrics.trim() ? tf('{0} 秒 · 含歌词', currentValues.时长) : tf('{0} 秒 · 纯音乐', currentValues.时长);
    }
    return currentValues.音色 ? tf('音色 {0}', currentValues.音色) : t('默认音色');
  };

  // 记录按当前类型展示，避免图片记录混进视频/音乐列表。
  const visibleGenerations = generations.filter((item) => item.kind === kind);

  const updateRecord = (id: string, patch: Partial<MediaGeneration>) => {
    if (!mounted.current) return;
    setGenerations((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
    setSelected((current) => (current && current.id === id ? { ...current, ...patch } : current));
  };

  const waitForTask = async (
    taskKind: 'video' | 'music' | 'voice',
    taskId: string,
    recordId: string,
    baseSummary: string,
    overrideFetch?: (id: string) => Promise<unknown>,
  ) => {
    const fetchTask =
      overrideFetch ??
      (taskKind === 'video' ? fetchVideoTask : taskKind === 'music' ? fetchMusicTask : fetchAudioTask);
    for (let attempt = 0; attempt < 75; attempt += 1) {
      await sleep(4000);
      if (!mounted.current) return;
      const task = await fetchTask(taskId);
      const state = taskStateOf(task);
      if (state === 'failed') {
        throw new Error(taskErrorOf(task) || t('上游任务失败'));
      }
      if (state === 'succeeded') {
        const url = firstMediaUrl(task);
        updateRecord(recordId, {
          status: 'succeeded',
          url: url ?? undefined,
          summary: baseSummary,
          error: url ? undefined : t('任务已完成，但未找到媒体地址'),
        });
        return;
      }
      const progress = taskProgressOf(task);
      if (progress !== null) {
        updateRecord(recordId, { summary: `${baseSummary} · ${Math.round(progress)}%` });
      }
    }
    throw new Error(t('任务超时，请稍后在任务页查看结果'));
  };

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    if (!model) {
      Alert.alert(t('暂无可用模型'), t('当前分组没有该类别的模型'));
      return;
    }

    const id = `gen-${++sequence.current}`;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const baseSummary = summary();
    const record: MediaGeneration = {
      id,
      kind,
      prompt: text,
      model,
      status: 'running',
      createdAt: time,
      summary: baseSummary,
    };
    setGenerations((current) => [record, ...current]);
    setBusy(true);

    try {
      if (kind === 'image') {
        const result = await generateImageSync({
          model,
          prompt: lyrics.trim() ? `${text}\n\n${lyrics.trim()}` : text,
          n: Number.parseInt(currentValues.数量, 10) || 1,
          size: currentValues.尺寸,
        });
        const url = result?.data?.[0]?.url ?? firstMediaUrl(result);
        if (!url) throw new Error(t('未返回图片地址'));
        updateRecord(id, { status: 'succeeded', url, summary: baseSummary });
      } else if (kind === 'video') {
        const task = await submitVideoTask({
          model,
          prompt: text,
          duration: Number.parseInt(currentValues.时长, 10) || undefined,
          aspect_ratio: currentValues.宽高比,
          resolution: currentValues.分辨率,
        });
        const taskId = taskIdOf(task);
        if (!taskId) throw new Error(t('未返回任务号'));
        await waitForTask('video', taskId, id, baseSummary);
      } else if (kind === 'music') {
        const duration = Number.parseInt(currentValues.时长, 10) || undefined;
        if (model.startsWith('music-3')) {
          // music-3.0 同步返回 base64 音频，lyrics 必填，缺失时用描述兜底。
          const result = await submitMusicV3({
            model,
            prompt: text,
            lyrics: lyrics.trim() || text,
            duration,
          });
          const audio = result?.audio || result?.result_url;
          if (audio) {
            const file = await writeBase64Audio(audio);
            updateRecord(id, {
              status: 'succeeded',
              url: file.uri,
              summary: baseSummary,
            });
          } else {
            const taskId = taskIdOf(result);
            if (!taskId) throw new Error(t('未返回音频'));
            await waitForTask('music', taskId, id, baseSummary, fetchMusicV3Task);
          }
        } else {
          const task = await submitMusicTask({
            model,
            prompt: text,
            duration,
          });
          const taskId = taskIdOf(task);
          if (!taskId) throw new Error(t('未返回任务号'));
          await waitForTask('music', taskId, id, baseSummary);
        }
      } else {
        const audio = await speechToFile({
          model,
          input: text,
          voice: voiceValue(currentValues.音色) || undefined,
        });
        updateRecord(id, { status: 'succeeded', url: audio.uri, summary: baseSummary });
      }
    } catch (error) {
      updateRecord(id, { status: 'failed', error: errorMessage(error) });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const statusMeta: Record<MediaGeneration['status'], { label: string; tone: Tone }> = {
    running: { label: t('生成中'), tone: 'info' },
    succeeded: { label: t('已完成'), tone: 'success' },
    failed: { label: t('失败'), tone: 'danger' },
  };

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('无法打开链接'));
    }
  };

  const copyUrl = async (url: string) => {
    await Clipboard.setStringAsync(url);
    Alert.alert(t('已复制链接'));
  };

  const canSubmit = prompt.trim().length > 0 && !busy && Boolean(model);

  return (
    <Subpage title={t("AI 创作")} onBack={onBack}>
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
            <Text style={styles.heroTitle}>{config.hero}</Text>
          </View>

          {kind === 'voice' ? (
            <View style={styles.presets}>
              {voicePresets.map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  onPress={() => setPrompt(tf('{0}：欢迎使用阡陌数智语音合成。', preset))}
                  style={({ pressed }) => [styles.presetChip, pressed ? pressedSurface : null]}
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
              keyboardAppearance={isDark() ? 'dark' : 'light'}
              value={prompt}
              onChangeText={setPrompt}
              placeholder={config.placeholder}
              placeholderTextColor={palette.tertiaryLabel}
              multiline
              style={styles.promptInput}
            />
          </View>

          {kind === 'music' || kind === 'image' ? (
            <View style={styles.inputCard}>
              <View style={styles.inputHeader}>
                <Text style={styles.inputLabel}>{kind === 'music' ? t('歌词（可选）') : t('附加描述（可选）')}</Text>
                <Text style={styles.counter}>{lyrics.length}/3500</Text>
              </View>
              <TextInput
                keyboardAppearance={isDark() ? 'dark' : 'light'}
                value={lyrics}
                onChangeText={setLyrics}
                placeholder={
                  kind === 'music'
                    ? t('支持 [Intro]、[Verse]、[Chorus]、[Bridge]、[Outro] 标签')
                    : t('补充构图、光线或风格细节')
                }
                placeholderTextColor={palette.tertiaryLabel}
                multiline
                style={[styles.promptInput, styles.lyricsInput]}
              />
            </View>
          ) : null}

          <Group header={t("生成参数")}>
            <Row
              title={t("模型")}
              value={model || t('暂无可用模型')}
              chevron={availableModels.length > 0}
              onPress={() =>
                availableModels.length
                  ? setPicker({ key: t('模型'), label: t('模型'), options: availableModels })
                  : undefined
              }
            />
            {params.map((param) => (
              <Row
                key={param.key}
                title={param.label}
                value={currentValues[param.key] || '—'}
                chevron
                onPress={() =>
                  setPicker({ key: param.key, label: param.label, options: param.options })
                }
              />
            ))}
          </Group>

          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>{t('本次生成记录')}</Text>
            {visibleGenerations.length > 0 ? (
              <Text style={styles.sectionMeta}>{visibleGenerations.length} {t('条')}</Text>
            ) : null}
          </View>

          {visibleGenerations.length === 0 ? (
            <EmptyState title={t("还没有生成记录")} icon="sparkles" />
          ) : (
            <Group>
              {visibleGenerations.map((item) => (
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
                      {item.error || item.summary}
                    </Text>
                    <Text style={styles.genCost}>{item.url ? t('查看') : ''}</Text>
                  </View>
                </Pressable>
              ))}
            </Group>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: 8 + insets.bottom }]}>
          <View style={styles.footerMeta}>
            <Text style={styles.footerCost} numberOfLines={1}>
              {model || t('暂无模型')}
            </Text>
            <Text style={styles.footerHint}>{priceLabelOf(pricing, model, group)}</Text>
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
            <Text style={styles.submitText}>{busy ? t('生成中…') : config.action}</Text>
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
                value={
                  picker.key === t('模型')
                    ? model === option
                      ? '✓'
                      : undefined
                    : currentValues[picker.key] === option
                      ? '✓'
                      : undefined
                }
                onPress={() => {
                  if (picker.key === t('模型')) {
                    setSelectedModels((current) => ({ ...current, [kind]: option }));
                  } else {
                    setParam(picker.key, option);
                  }
                  setPicker(null);
                }}
              />
            ))}
          </Group>
        ) : null}
      </Sheet>

      <Sheet visible={selected !== null} title={t("生成详情")} onClose={() => setSelected(null)}>
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
              <Row title={t("类型")} value={configs[selected.kind].label} />
              <Row title={t("模型")} value={selected.model} />
              <Row title={t("参数")} value={selected.summary} />
              <Row title={t("提交时间")} value={selected.createdAt} />
              {selected.error ? <Row title={t("错误")} value={selected.error} /> : null}
            </Group>
            {selected.url ? (
              <Group>
                {selected.kind === 'voice' ? (
                  <Row title={t("播放语音")} chevron onPress={() => playAudio(selected.url!)} />
                ) : selected.kind === 'music' ? (
                  <Row title={t("播放音乐")} chevron onPress={() => playAudio(selected.url!)} />
                ) : (
                  <>
                    <Row title={t("打开结果")} chevron onPress={() => openUrl(selected.url!)} />
                    <Row title={t("复制链接")} onPress={() => copyUrl(selected.url!)} />
                  </>
                )}
              </Group>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Subpage>
  );
}

const styles = themedStyles(() => StyleSheet.create({
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
    color: palette.blue,
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
    fontSize: 15,
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
    alignItems: 'flex-start',
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
}));
