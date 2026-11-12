import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDataSelf,
  fetchNotice,
  fetchPlaygroundModels,
  fetchPricing,
  fetchUserModels,
  fetchTasks,
  fetchTokens,
  fetchUsageLogs,
} from '../api/endpoints';
import type { DataSelfPoint, PricingPayload } from '../api/types';
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

type ConsoleState = {
  models: Model[];
  marketModels: MarketModel[];
  tokens: Token[];
  logs: UsageLog[];
  tasks: TaskRecord[];
  points: DataSelfPoint[];
  logPoints: DataSelfPoint[];
  notice: string;
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
};

const emptyMetrics: Record<UsageRange, OverviewMetrics> = {
  '24h': { requests: '0', reliability: '—', availableModels: '0', averageLatency: '—', issueCount: 0, totalUsage: 0, totalQuota: 1, summary: '' },
  '7d': { requests: '0', reliability: '—', availableModels: '0', averageLatency: '—', issueCount: 0, totalUsage: 0, totalQuota: 1, summary: '' },
  '30d': { requests: '0', reliability: '—', availableModels: '0', averageLatency: '—', issueCount: 0, totalUsage: 0, totalQuota: 1, summary: '' },
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

    const [modelsResult, playgroundResult, pricingResult, logsResult, tasksResult, dataResult, tokensResult, noticeResult] =
      await Promise.allSettled([
        fetchUserModels(),
        fetchPlaygroundModels(),
        fetchPricing(),
        fetchUsageLogs({ page: 1, pageSize: 50 }),
        fetchTasks(1, 50),
        fetchDataSelf(),
        fetchTokens(1, 100),
        fetchNotice(),
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
      const message = first.reason instanceof Error ? first.reason.message : '部分数据加载失败';
      setError(message);
    }

    setModelsLoading(false);
    setLogsLoading(false);
    setTasksLoading(false);
    setTokensLoading(false);
  }, [quotaPerUnit, user, owner]);

  useEffect(() => {
    if (!user) {
      setState(emptyState);
      return;
    }
    refresh();
  }, [refresh, user]);

  const metricsByRange = useMemo(() => {
    const points = state.points.length ? state.points : state.logPoints;
    if (!points.length && !state.models.length) return emptyMetrics;
    return {
      '24h': buildMetrics({ points, modelCount: state.models.length, quotaPerUnit, range: '24h' }),
      '7d': buildMetrics({ points, modelCount: state.models.length, quotaPerUnit, range: '7d' }),
      '30d': buildMetrics({ points, modelCount: state.models.length, quotaPerUnit, range: '30d' }),
    } satisfies Record<UsageRange, OverviewMetrics>;
  }, [state.points, state.logPoints, state.models.length, quotaPerUnit]);

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
        title: '站点公告',
        body: state.notice.trim(),
        time: '公告',
        category: 'system',
        read: false,
      },
    ];
  }, [state.notice]);

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
