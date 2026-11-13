import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardSurface, ripple } from '../material';
import { themedStyles } from '../theme';

const ios = Platform.OS === 'ios';
import {
  Badge,
  EmptyState,
  Group,
  ProgressBar,
  Row,
  Segmented,
  Sheet,
  animateContentChange,
  Subpage,
  palette,
  type Tone,
} from '../ui';
import type { TaskKind, TaskRecord, TaskState } from '../types';
import { t, tf } from '../i18n';


function matchesFilter(task: TaskRecord, index: number) {
  if (index === 1) {
    return task.state === 'running' || task.state === 'queued';
  }
  if (index === 2) {
    return task.state === 'succeeded';
  }
  if (index === 3) {
    return task.state === 'failed' || task.state === 'cancelled';
  }
  return true;
}

export function TasksScreen({
  tasks,
  onBack,
  onCancel,
  onRetry,
}: {
  tasks: TaskRecord[];
  onBack: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [selected, setSelected] = useState<TaskRecord | null>(null);

  // 文案随语言切换，放在渲染期求值。
  const kindLabel: Record<TaskKind, string> = {
    image: t('图像'),
    video: t('视频'),
    music: t('音乐'),
    voice: t('语音'),
    batch: t('批次'),
  };
  const stateMeta: Record<TaskState, { label: string; tone: Tone }> = {
    queued: { label: t('排队中'), tone: 'neutral' },
    running: { label: t('进行中'), tone: 'info' },
    succeeded: { label: t('已完成'), tone: 'success' },
    failed: { label: t('失败'), tone: 'danger' },
    cancelled: { label: t('已取消'), tone: 'warning' },
  };
  const filters = [t('全部'), t('进行中'), t('已完成'), t('失败')];

  const filtered = useMemo(
    () => tasks.filter((task) => matchesFilter(task, filterIndex)),
    [filterIndex, tasks],
  );

  const running = tasks.filter((task) => task.state === 'running').length;
  const queued = tasks.filter((task) => task.state === 'queued').length;
  const current = selected ? tasks.find((task) => task.id === selected.id) ?? selected : null;

  const confirmCancel = (task: TaskRecord) => {
    if (!onCancel) return;
    Alert.alert(t('取消任务？'), t('已生成的部分结果会被丢弃，此操作无法撤销。'), [
      { text: t('保留'), style: 'cancel' },
      {
        text: t('取消任务'),
        style: 'destructive',
        onPress: () => {
          onCancel(task.id);
          setSelected(null);
        },
      },
    ]);
  };

  const retry = (task: TaskRecord) => {
    onRetry?.(task.id);
    setSelected(null);
  };

  return (
    <Subpage title={t("任务")} onBack={onBack}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}>
        <Segmented
          values={[...filters]}
          selectedIndex={filterIndex}
          onChange={(index) => {
            animateContentChange();
            setFilterIndex(index);
          }}
        />

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {running} {t('个进行中')}{queued > 0 ? tf(' · {0} 个排队', queued) : ''}
          </Text>
        </View>

        {filtered.length === 0 ? (
          <EmptyState title={t("没有任务")} icon="square.stack.3d.up" />
        ) : (
          <Group header={t("异步任务")}>
            {filtered.map((task) => {
              const state = stateMeta[task.state];
              return (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(task)}
                  android_ripple={ripple()}
                  style={({ pressed }) => [styles.taskRow, pressed ? styles.taskRowPressed : null]}
                >
                  <View style={styles.taskTop}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Badge text={state.label} tone={state.tone} />
                  </View>
                  <View style={styles.taskMetaRow}>
                    <Text style={styles.taskMeta}>
                      {kindLabel[task.kind]} {t('· 提交于')} {task.submittedAt}
                    </Text>
                    <Text style={styles.taskMeta}>
                      {task.state === 'running' ? `${task.progress}%` : task.elapsed}
                    </Text>
                  </View>
                  {task.state === 'running' ? (
                    <ProgressBar percent={task.progress} tone="info" />
                  ) : null}
                </Pressable>
              );
            })}
          </Group>
        )}
      </ScrollView>

      <Sheet visible={current !== null} title={t("任务详情")} onClose={() => setSelected(null)}>
        {current ? (
          <>
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetTitle}>{current.title}</Text>
              <Badge
                text={stateMeta[current.state].label}
                tone={stateMeta[current.state].tone}
              />
            </View>
            {current.state === 'running' || current.state === 'queued' ? (
              <View style={styles.sheetProgress}>
                <ProgressBar percent={current.progress} tone="info" />
                <Text style={styles.sheetProgressText}>{t('已完成')} {current.progress}%</Text>
              </View>
            ) : null}
            <Group>
              <Row title={t("类型")} value={kindLabel[current.kind]} />
              <Row title={t("提交时间")} value={current.submittedAt} />
              <Row title={t("耗时")} value={current.elapsed} />
              <Row title={t("费用")} value={current.cost > 0 ? `¥${current.cost.toFixed(2)}` : '—'} />
            </Group>
            {current.note ? (
              <Group header={t("说明")}>
                <View style={styles.note}>
                  <Text style={styles.noteText}>{current.note}</Text>
                </View>
              </Group>
            ) : null}
            {onCancel && (current.state === 'running' || current.state === 'queued') ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmCancel(current)}
                style={[styles.action, styles.destructiveAction]}
              >
                <Text style={styles.destructiveText}>{t('取消任务')}</Text>
              </Pressable>
            ) : onRetry && (current.state === 'failed' || current.state === 'cancelled') ? (
              <Pressable accessibilityRole="button" onPress={() => retry(current)} style={styles.action}>
                <Text style={[styles.actionText, { color: palette.blue }]}>{t('重试任务')}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
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
  summary: {
    backgroundColor: palette.card,
    padding: 16,
    gap: 4,
    ...cardSurface,
    borderRadius: ios ? 10 : 28,
  },
  summaryTitle: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  taskRow: {
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
    gap: 8,
  },
  taskRowPressed: {
    backgroundColor: palette.fill,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    flex: 1,
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  taskMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskMeta: {
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  sheetTitle: {
    flex: 1,
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
  },
  sheetProgress: {
    backgroundColor: palette.card,
    padding: 16,
    gap: 8,
    ...cardSurface,
    borderRadius: ios ? 10 : 28,
  },
  sheetProgressText: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  note: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noteText: {
    color: palette.secondaryLabel,
    fontSize: 14,
    lineHeight: 21,
  },
  action: {
    minHeight: ios ? 48 : 52,
    borderRadius: ios ? 10 : 26,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 17,
  },
  destructiveAction: {
    borderWidth: 1,
    borderColor: palette.red,
    backgroundColor: 'transparent',
  },
  destructiveText: {
    color: palette.red,
    fontSize: 17,
  },
}));
