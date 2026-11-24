import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDataSelf,
  fetchFreeDailyModelUsage,
  fetchNotice,
  fetchPlaygroundModels,
  fetchPricing,
  fetchUserModels,
  fetchTasks,
  fetchTokens,
  fetchUsageLogs,
} from '../api/endpoints';
import type { DataSelfPoint, FreeDailyModelUsage, PricingPayload } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import type {
  MarketModel,
  MessageRecord,
  Model,
  OverviewMetrics,
  TaskRecord,
  Token,
  UsageLog,
  UsageRange,
} from '../types';
import {
  buildAccountSummary,
  buildMetrics,
  mapMarketModels,
  mapModels,
  mapTasks,
  mapTokens,
  mapUsageLogs,
  pointsFromLogs,
} from './liveConsole';
import { t, useLanguage } from '../i18n';

type ConsoleState = {
  models: Model[];
  marketModels: MarketModel[];
  tokens: Token[];
  logs: UsageLog[];
  tasks: TaskRecord[];
  points: DataSelfPoint[];
  logPoints: DataSelfPoint[];
  notice: string;
  freeDaily: FreeDailyModelUsage | null;
};

const emptyState: ConsoleState = {
  models: [],
  marketModels: [],
  tokens: [],
  logs: [],
  tasks: [],
  points: [],
  logPoints: [],
  notice: '',
  freeDaily: null,
};

const emptyMetric: OverviewMetrics = {
  times: '0',
  quotaLabel: '¥0.00',
  tokensLabel: '0',
  rpm: '0.000',
  tpm: '0.000',
  averageLatency: '—',
  issueCount: 0,
};

const emptyMetrics: Record<UsageRange, OverviewMetrics> = {
  '24h': emptyMetric,
  '7d': emptyMetric,
  '30d': emptyMetric,
};

function extractPoints(payload: unknown): DataSelfPoint[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as DataSelfPoint[];
  const record = payload as { data?: unknown };
  if (Array.isArray(record.data)) return record.data as DataSelfPoint[];
  return [];
}

export function useConsoleData() {
  const { user, quotaPerUnit } = useAuth();
  // 映射层会把「按次计费」「令牌 #1」等文案写进数据，切换语言后需要重新取一次。
  const language = useLanguage();
  const [state, setState] = useState<ConsoleState>(emptyState);
  const [pricing, setPricing] = useState<PricingPayload | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const owner = user?.display_name || user?.username || '';

  const refreshTokens = useCallback(async () => {
    setTokensLoading(true);
    try {
      const page = await fetchTokens(1, 100);
      if (mounted.current) {
        setState((current) => ({ ...current, tokens: mapTokens(page.items ?? [], quotaPerUnit) }));
      }
    } catch {
      if (mounted.current) setState((current) => ({ ...current, tokens: [] }));
    } finally {
      if (mounted.current) setTokensLoading(false);
    }
  }, [quotaPerUnit, owner]);

  const refreshLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const page = await fetchUsageLogs({ page: 1, pageSize: 50 });
      if (mounted.current) {
        setState((current) => ({
          ...current,
          logs: mapUsageLogs(page.items ?? [], quotaPerUnit),
          logPoints: pointsFromLogs(page.items ?? []),
        }));
      }
    } catch {
      /* 保留已有数据 */
    } finally {
      if (mounted.current) setLogsLoading(false);
    }
  }, [quotaPerUnit]);

  const refreshTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const page = await fetchTasks(1, 50);
      if (mounted.current) {
        setState((current) => ({ ...current, tasks: mapTasks(page.items ?? [], quotaPerUnit) }));
      }
    } catch {
      /* 保留已有数据 */
    } finally {
      if (mounted.current) setTasksLoading(false);
    }
  }, [quotaPerUnit]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    setModelsLoading(true);
    setLogsLoading(true);
    setTasksLoading(true);

    // 网页端看板的统计来自 /api/data/self 的日期区间，不带参数会返回空数组，
    // 所以这里固定取最近 30 天（按天聚合），由前端再按 24h / 7d / 30d 过滤。
    const now = Math.floor(Date.now() / 1000);
    const [modelsResult, playgroundResult, pricingResult, logsResult, tasksResult, dataResult, tokensResult, noticeResult, freeDailyResult] =
      await Promise.allSettled([
        fetchUserModels(),
        fetchPlaygroundModels(),
        fetchPricing(),
        fetchUsageLogs({ page: 1, pageSize: 50 }),
        fetchTasks(1, 50),
        fetchDataSelf({ start: now - 30 * 24 * 3600, end: now, granularity: 'day' }),
        fetchTokens(1, 100),
        fetchNotice(),
        fetchFreeDailyModelUsage(),
      ]);
    if (!mounted.current) return;

    const nextPricing = pricingResult.status === 'fulfilled' ? pricingResult.value : null;
    const userModels = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
    const playground = playgroundResult.status === 'fulfilled' ? playgroundResult.value : [];
    // 以 /api/user/models 为主；playground 仅作兜底。
    const available = userModels.length ? userModels : playground;

    setPricing(nextPricing);
    setState((current) => ({
      models:
        available.length || nextPricing
          ? mapModels(available, nextPricing, user.group)
          : current.models,
      marketModels:
        available.length || nextPricing
          ? mapMarketModels(available, nextPricing, user.group)
          : current.marketModels,
      tokens:
        tokensResult.status === 'fulfilled'
          ? mapTokens(tokensResult.value.items ?? [], quotaPerUnit)
          : current.tokens,
      logs:
        logsResult.status === 'fulfilled'
          ? mapUsageLogs(logsResult.value.items ?? [], quotaPerUnit)
          : current.logs,
      tasks:
        tasksResult.status === 'fulfilled'
          ? mapTasks(tasksResult.value.items ?? [], quotaPerUnit)
          : current.tasks,
      points: dataResult.status === 'fulfilled' ? extractPoints(dataResult.value) : current.points,
      logPoints:
        logsResult.status === 'fulfilled'
          ? pointsFromLogs(logsResult.value.items ?? [])
          : current.logPoints,
      notice: noticeResult.status === 'fulfilled' ? noticeResult.value ?? '' : current.notice,
      freeDaily: freeDailyResult.status === 'fulfilled' ? freeDailyResult.value : current.freeDaily,
    }));

    const failures = [
      modelsResult,
      pricingResult,
      logsResult,
      tasksResult,
      tokensResult,
    ].filter((result) => result.status === 'rejected');
    if (failures.length) {
      const first = failures[0] as PromiseRejectedResult;
      const message = first.reason instanceof Error ? first.reason.message : t('部分数据加载失败');
      setError(message);
    }

    setModelsLoading(false);
    setLogsLoading(false);
    setTasksLoading(false);
    setTokensLoading(false);
  }, [quotaPerUnit, user, owner, language]);

  useEffect(() => {
    if (!user) {
      setState(emptyState);
      return;
    }
    refresh();
  }, [refresh, user]);

  const metricsByRange = useMemo(() => {
    // /api/data/self 有区间数据时优先用它（与网页端看板一致），否则退回用量日志。
    const points = state.points.length ? state.points : state.logPoints;
    if (!points.length) return emptyMetrics;
    return {
      '24h': buildMetrics({ points, quotaPerUnit, range: '24h' }),
      '7d': buildMetrics({ points, quotaPerUnit, range: '7d' }),
      '30d': buildMetrics({ points, quotaPerUnit, range: '30d' }),
    } satisfies Record<UsageRange, OverviewMetrics>;
  }, [state.points, state.logPoints, quotaPerUnit]);

  const account = useMemo(() => {
    if (!user) return null;
    return buildAccountSummary({
      username: user.display_name || user.username,
      role: user.role,
      group: user.group,
      quota: user.quota,
      quotaPerUnit,
    });
  }, [user, quotaPerUnit]);

  const messages = useMemo<MessageRecord[]>(() => {
    if (!state.notice.trim()) return [];
    return [
      {
        id: 'notice',
        title: t('站点公告'),
        body: state.notice.trim(),
        time: t('公告'),
        category: 'system',
        read: false,
      },
    ];
  }, [state.notice, language]);

  return {
    ...state,
    messages,
    pricing,
    metricsByRange,
    account,
    error,
    modelsLoading,
    logsLoading,
    tasksLoading,
    tokensLoading,
    refresh,
    refreshTokens,
    refreshLogs,
    refreshTasks,
  };
}
