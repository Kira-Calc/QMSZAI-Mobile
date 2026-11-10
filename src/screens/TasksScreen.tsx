import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

const kindLabel: Record<TaskKind, string> = {
  image: '图像',
  video: '视频',
  music: '音乐',
  voice: '语音',
  batch: '批次',
};

const stateMeta: Record<TaskState, { label: string; tone: Tone }> = {
  queued: { label: '排队中', tone: 'neutral' },
  running: { label: '进行中', tone: 'info' },
  succeeded: { label: '已完成', tone: 'success' },
  failed: { label: '失败', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'warning' },
};

const filters = ['全部', '进行中', '已完成', '失败'] as const;

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
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [selected, setSelected] = useState<TaskRecord | null>(null);

  const filtered = useMemo(
    () => tasks.filter((task) => matchesFilter(task, filterIndex)),
    [filterIndex, tasks],
  );

  const running = tasks.filter((task) => task.state === 'running').length;
  const queued = tasks.filter((task) => task.state === 'queued').length;
  const current = selected ? tasks.find((task) => task.id === selected.id) ?? selected : null;

  const confirmCancel = (task: TaskRecord) => {
    Alert.alert('取消任务？', '已生成的部分结果会被丢弃，此操作无法撤销。', [
      { text: '保留', style: 'cancel' },
      {
        text: '取消任务',
        style: 'destructive',
        onPress: () => {
          onCancel(task.id);
          setSelected(null);
        },
      },
    ]);
  };

  const retry = (task: TaskRecord) => {
    onRetry(task.id);
    setSelected(null);
  };

  return (
    <Subpage title="任务" onBack={onBack}>
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
            {running} 个进行中
            {queued > 0 ? ` · ${queued} 个排队` : ''}
          </Text>
          <Text style={styles.summaryMeta}>进度为演示数据，会随停留时间推进；仅保存在本次运行中。</Text>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            title="没有任务"
            message="切换筛选条件，或在图像、视频与批次流程中提交新任务。"
            icon="square.stack.3d.up"
          />
        ) : (
          <Group header="异步任务">
            {filtered.map((task) => {
              const state = stateMeta[task.state];
              return (
                <Pressable
                  key={task.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(task)}
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
                      {kindLabel[task.kind]} · 提交于 {task.submittedAt}
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

      <Sheet visible={current !== null} title="任务详情" onClose={() => setSelected(null)}>
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
                <Text style={styles.sheetProgressText}>已完成 {current.progress}%</Text>
              </View>
            ) : null}
            <Group>
              <Row title="类型" value={kindLabel[current.kind]} />
              <Row title="提交时间" value={current.submittedAt} />
              <Row title="耗时" value={current.elapsed} />
              <Row title="费用" value={current.cost > 0 ? `¥${current.cost.toFixed(2)}` : '—'} />
            </Group>
            <Group header="说明">
              <View style={styles.note}>
                <Text style={styles.noteText}>{current.note}</Text>
              </View>
            </Group>
            {current.state === 'running' || current.state === 'queued' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmCancel(current)}
                style={[styles.action, styles.destructiveAction]}
              >
                <Text style={styles.destructiveText}>取消任务</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => retry(current)} style={styles.action}>
                <Text style={[styles.actionText, { color: palette.blue }]}>
                  {current.state === 'succeeded' ? '重新生成' : '重试任务'}
                </Text>
              </Pressable>
            )}
          </>
        ) : null}
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
  summary: {
    backgroundColor: palette.card,
    borderRadius: 10,
    padding: 16,
    gap: 4,
  },
  summaryTitle: {
    color: palette.label,
    fontSize: 20,
    fontWeight: '600',
  },
  summaryMeta: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
  },
  taskRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 7,
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
    borderRadius: 10,
    backgroundColor: palette.card,
    padding: 16,
    gap: 8,
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
    minHeight: 48,
    borderRadius: 10,
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
});
