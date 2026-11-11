import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  Subpage,
  animateContentChange,
  palette,
  type Tone,
} from '../ui';
import { cardSurface, ripple } from '../material';

const ios = Platform.OS === 'ios';
import type { LogStatus, UsageLog } from '../types';

const statusMeta: Record<LogStatus, { label: string; tone: Tone }> = {
  success: { label: '成功', tone: 'success' },
  error: { label: '失败', tone: 'danger' },
  timeout: { label: '超时', tone: 'warning' },
};

const filters = ['全部', '成功', '异常'] as const;

export function UsageLogsScreen({
  logs,
  onBack,
}: {
  logs: UsageLog[];
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [filterIndex, setFilterIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(6);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<UsageLog | null>(null);

  const filtered = useMemo(() => {
    if (filterIndex === 1) {
      return logs.filter((log) => log.status === 'success');
    }
    if (filterIndex === 2) {
      return logs.filter((log) => log.status !== 'success');
    }
    return logs;
  }, [filterIndex, logs]);

  const visibleLogs = filtered.slice(0, visibleCount);
  const totalCost = filtered.reduce((sum, log) => sum + log.cost, 0);
  const successful = filtered.filter((log) => log.status === 'success');
  const averageLatency =
    successful.length === 0
      ? 0
      : Math.round(successful.reduce((sum, log) => sum + log.latencyMs, 0) / successful.length);

  const loadMore = () => {
    if (loadingMore) {
      return;
    }
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((count) => count + 6);
      setLoadingMore(false);
    }, 450);
  };

  return (
    <Subpage title="用量日志" onBack={onBack}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}

      >
        <Segmented
          values={[...filters]}
          selectedIndex={filterIndex}
          onChange={(index) => {
            animateContentChange();
            setFilterIndex(index);
            setVisibleCount(6);
          }}
        />

        <View style={styles.summary}>
          <Text style={styles.summaryValue}>{filtered.length}</Text>
          <Text style={styles.summaryLabel}>条请求 · 合计 ¥{totalCost.toFixed(2)}</Text>
          <Text style={styles.summaryMeta}>平均延迟 {averageLatency ? `${averageLatency} ms` : '—'}</Text>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            title="没有符合条件的日志"
            message="切换筛选条件，或在真实业务接口接入后查看完整请求记录。"
            icon="doc.text.magnifyingglass"
          />
        ) : (
          <Group header={filterIndex === 2 ? '异常请求' : '最近请求'}>
            {visibleLogs.map((log) => {
              const meta = statusMeta[log.status];
              return (
                <Pressable
                  key={log.id}
                  accessibilityRole="button"
                  onPress={() => setSelected(log)}
                  android_ripple={ripple()}
                  style={({ pressed }) => [styles.logRow, pressed ? styles.logRowPressed : null]}
                >
                  <View style={styles.logTop}>
                    <Text style={styles.logTime}>{log.time}</Text>
                    <Badge text={meta.label} tone={meta.tone} />
                  </View>
                  <Text style={styles.logModel}>{log.modelName}</Text>
                  <View style={styles.logBottom}>
                    <Text style={styles.logMeta}>
                      {log.tokenName} · {log.promptTokens + log.completionTokens} tokens ·{' '}
                      {log.latencyMs} ms
                    </Text>
                    <Text style={styles.logCost}>{log.cost > 0 ? `¥${log.cost.toFixed(3)}` : '—'}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Group>
        )}

        {visibleCount < filtered.length ? (
          <Pressable
            accessibilityRole="button"
            onPress={loadMore}
            disabled={loadingMore}
            style={styles.loadMore}
          >
            {loadingMore ? (
              <ActivityIndicator color={palette.blue} />
            ) : (
              <Text style={[styles.loadMoreText, { color: palette.blue }]}>加载更多</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>

      <Sheet
        visible={selected !== null}
        title="请求详情"
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <>
            <View style={styles.sheetHeading}>
              <Text style={styles.sheetModel}>{selected.modelName}</Text>
              <Badge text={statusMeta[selected.status].label} tone={statusMeta[selected.status].tone} />
            </View>
            <Group>
              <Row title="请求时间" value={selected.time} />
              <Row title="令牌" value={selected.tokenName} />
              <Row title="输入 tokens" value={selected.promptTokens.toLocaleString()} />
              <Row title="输出 tokens" value={selected.completionTokens.toLocaleString()} />
              <Row title="延迟" value={`${selected.latencyMs} ms`} />
              <Row title="费用" value={selected.cost > 0 ? `¥${selected.cost.toFixed(3)}` : '未计费'} />
              <Row title="请求 ID" value={selected.requestId} />
            </Group>
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
    padding: 16,
    gap: 4,
    ...cardSurface,
    borderRadius: ios ? 10 : 28,
  },
  summaryValue: {
    color: palette.label,
    fontSize: 30,
    fontWeight: '600',
  },
  summaryLabel: {
    color: palette.secondaryLabel,
    fontSize: 14,
  },
  summaryMeta: {
    color: palette.secondaryLabel,
    fontSize: 13,
    marginTop: 2,
  },
  logRow: {
    paddingHorizontal: 16,
    paddingVertical: ios ? 12 : 14,
    gap: 4,
  },
  logRowPressed: {
    backgroundColor: palette.fill,
  },
  logTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logTime: {
    color: palette.secondaryLabel,
    fontSize: 13,
  },
  logModel: {
    color: palette.label,
    fontSize: 16,
    fontWeight: '600',
  },
  logBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  logMeta: {
    flex: 1,
    color: palette.secondaryLabel,
    fontSize: 12,
  },
  logCost: {
    color: palette.secondaryLabel,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  loadMore: {
    minHeight: ios ? 44 : 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreText: {
    fontSize: 16,
  },
  sheetHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  sheetModel: {
    color: palette.label,
    fontSize: 22,
    fontWeight: '600',
  },
  sheetNote: {
    color: palette.secondaryLabel,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
