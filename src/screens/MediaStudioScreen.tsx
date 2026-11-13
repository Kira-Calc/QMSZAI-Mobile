import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
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
import { themedStyles, isDark } from '../theme';
import { useKeyboardInsets } from '../useKeyboardInsets';

import {
  fetchVideoCapabilities,
  fetchVoices,
  generateImageSync,
  submitMusicTask,
  submitMusicV3,
  submitVideoTask,
} from '../api/endpoints';
import { speechToFile, writeBase64Audio } from '../api/client';
import type { PricingPayload } from '../api/types';
import type { MediaGeneration, MediaKind, Model, TaskKind } from '../types';
import { ModelLogo } from '../components/ModelLogo';
import { modelsForKind, priceLabelOf, firstMediaUrl, taskIdOf } from '../services/mediaModels';
import { waitForMediaTask } from '../services/mediaTasks';
import {
  addMediaGeneration,
  updateMediaGeneration,
  useMediaGenerations,
} from '../mediaGenerations';
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

// 记录会跨天保留：当天只显示时间，更早的补上月/日。
function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === new Date().toDateString()) return time;
  return tf('{0}/{1} {2}', date.getMonth() + 1, date.getDate(), time);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return t('生成失败，请稍后重试');
}

// 同步接口拿不到真实百分比，用 30 秒缓慢走到 90% 的不确定进度；
// 视频/音乐任务返回 progress 后切换为精确值。
function GenerationProgress({ progress }: { progress?: number }) {
  const animated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (progress !== undefined) return;
    animated.setValue(0);
    const animation = Animated.timing(animated, {
      toValue: 100,
      duration: 30000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, progress]);

  const width =
    progress === undefined
      ? animated.interpolate({ inputRange: [0, 100], outputRange: ['0%', '90%'] })
      : `${Math.max(2, Math.min(100, progress))}%`;

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width }]} />
    </View>
  );
}

const MEDIA_EXTENSION = /\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|m4a|aac)(?:[?#]|$)/i;

function mediaExtension(item: MediaGeneration) {
  const match = item.url?.match(MEDIA_EXTENSION);
  if (match) return match[1].toLowerCase();
  return item.kind === 'image' ? 'jpg' : item.kind === 'video' ? 'mp4' : 'mp3';
}

function mediaMime(item: MediaGeneration) {
  const extension = mediaExtension(item);
  if (extension === 'png') return 'image/png';
  if (['jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
    return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
  }
  if (['mp4', 'm4v'].includes(extension)) return 'video/mp4';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'm4a') return 'audio/mp4';
  return 'audio/mpeg';
}

// iOS 分享面板按 UTI 决定「存储到文件」等动作，安卓只用 mime。
function mediaUti(item: MediaGeneration) {
  const extension = mediaExtension(item);
  const map: Record<string, string> = {
    png: 'public.png',
    jpg: 'public.jpeg',
    jpeg: 'public.jpeg',
    webp: 'org.webmproject.webp',
    gif: 'com.compuserve.gif',
    mp4: 'public.mpeg-4',
    m4v: 'public.mpeg-4',
    mov: 'com.apple.quicktime-movie',
    webm: 'org.webmproject.webm',
    mp3: 'public.mp3',
    wav: 'com.microsoft.waveform-audio',
    m4a: 'public.mpeg-4-audio',
    aac: 'public.aac-audio',
  };
  return map[extension] ?? 'public.data';
}

// 远端结果先落到缓存；语音/音乐 base64 结果本身就是 file://。
async function localMediaFile(item: MediaGeneration) {
  if (!item.url) throw new Error(t('结果还没有生成'));
  if (item.url.startsWith('file://')) return new File(item.url);
  const destination = new File(
    Paths.cache,
    `qmszai-${item.id}-${Date.now()}.${mediaExtension(item)}`,
  );
  return File.downloadFileAsync(item.url, destination, { idempotent: true });
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      style={styles.previewVideo}
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

function GeneratedPreview({ item }: { item: MediaGeneration }) {
  if (item.status !== 'succeeded' || !item.url) return null;
  if (item.kind === 'image') {
    return (
      <Image
        source={{ uri: item.url }}
        style={styles.previewImage}
        resizeMode="contain"
        accessibilityLabel={t('生成结果')}
      />
    );
  }
  if (item.kind === 'video') return <VideoPreview uri={item.url} />;
  return null;
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
  const generations = useMediaGenerations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
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

  // 记录不再按当前类型过滤：否则切到别的类型或重新进入页面后，
  // 刚生成的记录看起来就像丢了。每行都带类型标签，混合展示也能分清。
  const visibleGenerations = generations;
  const selected = selectedId ? generations.find((item) => item.id === selectedId) ?? null : null;

  const updateRecord = (id: string, patch: Partial<MediaGeneration>) => {
    void updateMediaGeneration(id, patch);
  };

  // 中断的记录没有具体错误信息，统一显示为「生成已中断」。
  const errorText = (item: MediaGeneration) =>
    item.interrupted && !item.error ? t('生成已中断') : item.error;

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    if (!model) {
      Alert.alert(t('暂无可用模型'), t('当前分组没有该类别的模型'));
      return;
    }

    const id = `gen-${Date.now().toString(36)}-${++sequence.current}`;
    const baseSummary = summary();
    const record: MediaGeneration = {
      id,
      kind,
      prompt: text,
      model,
      status: 'running',
      createdAt: new Date().toISOString(),
      summary: baseSummary,
    };
    await addMediaGeneration(record);
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
        // 先落任务号再轮询：记录里有了它，离开页面或重启 App 都能接着查。
        updateRecord(id, { taskId, taskMode: 'video' });
        await waitForMediaTask(id, taskId, 'video');
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
            updateRecord(id, { taskId, taskMode: 'music3' });
            await waitForMediaTask(id, taskId, 'music3');
          }
        } else {
          const task = await submitMusicTask({
            model,
            prompt: text,
            duration,
          });
          const taskId = taskIdOf(task);
          if (!taskId) throw new Error(t('未返回任务号'));
          updateRecord(id, { taskId, taskMode: 'music' });
          await waitForMediaTask(id, taskId, 'music');
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

  const copyUrl = async (url: string) => {
    await Clipboard.setStringAsync(url);
    Alert.alert(t('已复制链接'));
  };

  // 图片/视频优先写入系统相册；音频或相册权限不可用时回退到系统分享面板。
  const saveResult = async (item: MediaGeneration) => {
    if (!item.url || downloading) return;
    setDownloading(true);
    try {
      const file = await localMediaFile(item);
      if (item.kind === 'image' || item.kind === 'video') {
        try {
          const permission = await MediaLibrary.requestPermissionsAsync(true, [
            item.kind === 'image' ? 'photo' : 'video',
          ]);
          if (!permission.granted) throw new Error(t('没有相册权限'));
          await MediaLibrary.Asset.create(file.uri);
          Alert.alert(t('已保存到相册'));
          return;
        } catch {
          // 权限被拒或写入失败时继续走分享面板，用户仍可存到文件。
        }
      }
      if (!(await Sharing.isAvailableAsync())) throw new Error(t('当前设备不支持保存'));
      await Sharing.shareAsync(file.uri, {
        mimeType: mediaMime(item),
        dialogTitle: t('保存或分享'),
        UTI: mediaUti(item),
      });
    } catch (error) {
      Alert.alert(t('下载失败'), errorMessage(error));
    } finally {
      setDownloading(false);
    }
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
            <Text style={styles.sectionTitle}>{t('生成记录')}</Text>
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
                  onPress={() => setSelectedId(item.id)}
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
                    {configs[item.kind].label} · {item.model} · {timeLabel(item.createdAt)}
                  </Text>
                  {item.status === 'running' ? (
                    <View style={styles.genProgressRow}>
                      <View style={styles.genProgressTrack}>
                        <GenerationProgress progress={item.progress} />
                      </View>
                      {item.progress !== undefined ? (
                        <Text style={styles.genProgressValue}>{Math.round(item.progress)}%</Text>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.genBottom}>
                    <Text style={styles.genSummary} numberOfLines={1}>
                      {errorText(item) || item.summary}
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
                leading={
                  picker.key === t('模型') ? <ModelLogo name={option} size={24} /> : undefined
                }
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

      <Sheet
        visible={selectedId !== null}
        title={t("生成详情")}
        onClose={() => setSelectedId(null)}
        footer={
          selected?.status === 'succeeded' && selected.url ? (
            <Pressable
              accessibilityRole="button"
              disabled={downloading}
              onPress={() => saveResult(selected)}
              style={({ pressed }) => [
                styles.downloadButton,
                downloading ? styles.submitDisabled : null,
                pressed ? pressedDim : null,
              ]}
            >
              <Text style={styles.downloadText}>
                {downloading ? t('下载中…') : t('下载')}
              </Text>
            </Pressable>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <View style={styles.detailHeading}>
              <Text style={styles.detailTitle}>{selected.prompt}</Text>
              <Badge
                text={statusMeta[selected.status].label}
                tone={statusMeta[selected.status].tone}
              />
            </View>
            {selected.status === 'running' ? (
              <View style={styles.detailProgress}>
                <GenerationProgress progress={selected.progress} />
                {selected.progress !== undefined ? (
                  <Text style={styles.genProgressValue}>{Math.round(selected.progress)}%</Text>
                ) : null}
              </View>
            ) : null}
            <GeneratedPreview item={selected} />
            <Group>
              <Row title={t("类型")} value={configs[selected.kind].label} />
              <Row title={t("模型")} value={selected.model} />
              <Row title={t("参数")} value={selected.summary} />
              <Row title={t("提交时间")} value={timeLabel(selected.createdAt)} />
              {errorText(selected) ? <Row title={t("错误")} value={errorText(selected)} /> : null}
            </Group>
            {selected.url && selected.status === 'succeeded' ? (
              <Group>
                {selected.kind === 'voice' ? (
                  <Row title={t("播放语音")} chevron onPress={() => playAudio(selected.url!)} />
                ) : selected.kind === 'music' ? (
                  <Row title={t("播放音乐")} chevron onPress={() => playAudio(selected.url!)} />
                ) : null}
                {selected.url.startsWith('http') ? (
                  <Row title={t("复制链接")} onPress={() => copyUrl(selected.url!)} />
                ) : null}
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
  genProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 1,
  },
  genProgressTrack: {
    flex: 1,
  },
  genProgressValue: {
    minWidth: 32,
    color: palette.secondaryLabel,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: palette.fill,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: palette.blue,
  },
  detailProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: -2,
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
  downloadButton: {
    width: '100%',
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 12 : 26,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadText: {
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
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: ios ? 12 : 16,
    backgroundColor: palette.fill,
  },
  previewVideo: {
    width: '100%',
    aspectRatio: 16 / 9,
    overflow: 'hidden',
    borderRadius: ios ? 12 : 16,
    backgroundColor: '#000000',
  },
}));
