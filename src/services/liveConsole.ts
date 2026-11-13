import type {
  ApiToken,
  ChatConversation,
  DataSelfPoint,
  PricingItem,
  PricingPayload,
  TaskItem,
  UsageLogItem,
} from '../api/types';
import { formatCompact, formatCurrency, formatDuration, formatQuota, formatRelative, formatUnixTime, quotaToCurrency } from '../api/format';
import type {
  AccountSummary,
  MarketModel,
  MediaKind,
  Model,
  OverviewMetrics,
  TaskKind,
  TaskRecord,
  TaskState,
  Token,
  UsageLog,
  UsageRange,
} from '../types';
import { t, tf } from '../i18n';

const VENDOR_MAP: Array<[RegExp, string]> = [
  [/^gpt|^o[134]\b|^chatgpt|^dall-e|^whisper|^tts-|^text-embedding/i, 'OpenAI'],
  [/^claude/i, 'Anthropic'],
  [/^gemini|^gemma|^imagen|^veo/i, 'Google'],
  [/^deepseek/i, 'DeepSeek'],
  [/^qwen|^qwq|^wanx|^qwen-image/i, '通义千问'],
  [/^glm|^cogview|^cogvideo/i, '智谱'],
  [/^moonshot|^kimi/i, 'Moonshot'],
  [/^doubao|^seed/i, '豆包'],
  [/^llama|^meta/i, 'Meta'],
  [/^mistral|^mixtral|^codestral/i, 'Mistral'],
  [/^grok/i, 'xAI'],
  [/^midjourney|^mj/i, 'Midjourney'],
  [/^suno|^chirp/i, 'Suno'],
  [/^minimax|^abab|^hailuo/i, 'MiniMax'],
  [/^ernie/i, '百度'],
  [/^hunyuan/i, '腾讯'],
  [/^spark/i, '讯飞'],
  [/^step/i, '阶跃星辰'],
  [/^yi-/i, '零一万物'],
];

export function vendorOf(modelName: string) {
  const hit = VENDOR_MAP.find(([pattern]) => pattern.test(modelName));
  if (hit) return t(hit[1]);
  const prefix = modelName.split(/[-/:]/)[0];
  if (!prefix) return t('其他');
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

function pricingFor(pricing: PricingPayload | null, modelName: string) {
  return pricing?.data?.find((item) => item.model_name === modelName) ?? null;
}

// 优先用站点 vendor 表，缺失时按模型名推断。
function vendorNameOf(pricing: PricingPayload | null, item: PricingItem | null, modelName: string) {
  if (item?.vendor_id && pricing?.vendors) {
    const hit = pricing.vendors.find((vendor) => vendor.id === item.vendor_id);
    if (hit?.name) return hit.name;
  }
  return vendorOf(modelName);
}

function groupRatioOf(pricing: PricingPayload | null, group?: string) {
  if (!pricing?.group_ratio) return 1;
  if (group && typeof pricing.group_ratio[group] === 'number') return pricing.group_ratio[group];
  const first = Object.values(pricing.group_ratio)[0];
  return typeof first === 'number' ? first : 1;
}

// 新 API 计费：1M tokens 价格 = model_ratio × 2 × 分组倍率（货币单位）。
function unitPrice(item: PricingItem, ratio: number, completion = false) {
  const base = item.model_ratio * 2 * ratio;
  return completion ? base * (item.completion_ratio || 1) : base;
}

function priceTier(price: number) {
  if (price <= 0) return t('免费');
  if (price < 2) return t('低');
  if (price < 10) return t('中');
  return t('高');
}

export function mapModels(
  playgroundModels: string[],
  pricing: PricingPayload | null,
  group?: string,
): Model[] {
  const ratio = groupRatioOf(pricing, group);
  const names = playgroundModels.length
    ? playgroundModels
    : (pricing?.data ?? []).map((item) => item.model_name);

  return names.map((name) => {
    const item = pricingFor(pricing, name);
    const perCall = item?.quota_type === 1;
    const input = item ? (perCall ? (item.model_price || 0) * ratio : unitPrice(item, ratio)) : 0;
    const output = item && !perCall ? unitPrice(item, ratio, true) : 0;
    const tags: string[] = [];
    if (perCall) tags.push(t('按次'));
    if (item?.supported_endpoint_types?.includes('openai')) tags.push(t('OpenAI 兼容'));
    if (item?.is_foreign) tags.push(t('海外'));
    return {
      id: name,
      name,
      vendor: vendorNameOf(pricing, item, name),
      context: '—',
      latency: '—',
      price: priceTier(input),
      status: 'stable',
      tags,
      note: item?.description ?? '',
      route: item?.enable_groups?.slice(0, 2).join(' / ') || group || 'default',
      inputRate: item ? `${formatCurrency(input, 2)} ${perCall ? t('/ 次') : '/ 1M'}` : '—',
      outputRate: item && !perCall ? `${formatCurrency(output, 2)} / 1M` : '—',
      updatedAt: perCall ? t('按次计费') : t('按 token 计费'),
    } satisfies Model;
  });
}

export function mapMarketModels(
  playgroundModels: string[],
  pricing: PricingPayload | null,
  group?: string,
): MarketModel[] {
  const ratio = groupRatioOf(pricing, group);
  const names = playgroundModels.length
    ? playgroundModels
    : (pricing?.data ?? []).map((item) => item.model_name);

  return names.map((name) => {
    const item = pricingFor(pricing, name);
    const perCall = item?.quota_type === 1;
    const input = item ? (perCall ? (item.model_price || 0) * ratio : unitPrice(item, ratio)) : 0;
    const output = item && !perCall ? unitPrice(item, ratio, true) : 0;
    const isImage = /image|dall-e|mj|flux|stable-diffusion|seedream|cogview|imagen/i.test(name);
    const isVideo = /video|veo|kling|sora|hailuo|vidu|cogvideo/i.test(name);
    const isAudio = /music|suno|tts|speech|audio|voice/i.test(name);
    return {
      id: name,
      name,
      vendor: vendorNameOf(pricing, item, name),
      group: item?.enable_groups?.[0] ?? group ?? 'default',
      category: isVideo ? 'video' : isImage ? 'image' : isAudio ? 'audio' : 'chat',
      context: '—',
      inputPrice: input,
      outputPrice: output,
      cachePrice: !perCall && item?.cache_ratio ? input * item.cache_ratio : undefined,
      tags: item?.is_foreign ? [t('海外')] : [],
      note: item?.description ?? '',
    } satisfies MarketModel;
  });
}

function parseRoutingGroups(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string' && name.length > 0) : [];
  } catch {
    return [];
  }
}

export function mapTokens(items: ApiToken[], quotaPerUnit: number): Token[] {
  return items.map((item) => {
    const expired = item.expired_time > 0 && item.expired_time * 1000 < Date.now();
    const total = item.unlimited_quota ? item.used_quota : item.used_quota + item.remain_quota;
    const routingGroups = parseRoutingGroups(item.routing_group_order);
    const modelLimits = (item.model_limits ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return {
      id: String(item.id),
      name: item.name || tf('令牌 {0}', item.id),
      scope: routingGroups.length > 0 ? routingGroups.join(' → ') : item.group || t('所有分组'),
      usage: item.used_quota ?? 0,
      quota: total > 0 ? total : 1,
      lastUsed: item.accessed_time ? formatRelative(item.accessed_time) : t('从未使用'),
      status: expired ? 'expired' : item.status === 1 ? 'active' : 'paused',
      unlimited: Boolean(item.unlimited_quota),
      remainQuota: item.remain_quota ?? 0,
      expiredTime: item.expired_time ?? -1,
      group: item.group ?? '',
      routingGroups,
      modelLimits,
      allowIps: item.allow_ips ?? '',
    } satisfies Token;
  });
}

export function mapUsageLogs(items: UsageLogItem[], quotaPerUnit: number): UsageLog[] {
  // 登录、管理、系统类日志不是用量记录，混进来会被误判为失败请求。
  return items
    .filter((item) => Boolean(item.model_name) || item.type === 2 || item.type === 5)
    .map((item) => {
      const failed = item.type === 5 || (item.content ?? '').toLowerCase().includes('error');
      const status: UsageLog['status'] = failed ? 'error' : 'success';
      return {
        id: String(item.id),
        time: formatUnixTime(item.created_at),
        modelName: item.model_name || '—',
        tokenName: item.token_name || '—',
        status,
        promptTokens: item.prompt_tokens ?? 0,
        completionTokens: item.completion_tokens ?? 0,
        cost: quotaToCurrency(item.quota ?? 0, quotaPerUnit),
        latencyMs: (item.use_time ?? 0) * 1000,
        requestId: item.content || `#${item.id}`,
      } satisfies UsageLog;
    });
}

const TASK_KIND_MAP: Array<[RegExp, TaskKind]> = [
  [/image|mj|draw/i, 'image'],
  [/video/i, 'video'],
  [/music|suno/i, 'music'],
  [/audio|voice|speech|tts/i, 'voice'],
];

function taskKindOf(task: TaskItem): TaskKind {
  const key = `${task.platform ?? ''} ${task.action ?? ''}`;
  const hit = TASK_KIND_MAP.find(([pattern]) => pattern.test(key));
  return hit ? hit[1] : 'batch';
}

const TASK_STATE_MAP: Record<string, TaskState> = {
  SUCCESS: 'succeeded',
  FAILURE: 'failed',
  FAILED: 'failed',
  QUEUED: 'queued',
  SUBMITTED: 'queued',
  NOT_START: 'queued',
  IN_PROGRESS: 'running',
  RUNNING: 'running',
};

export function mapTasks(items: TaskItem[], quotaPerUnit: number): TaskRecord[] {
  return items.map((task) => {
    const status = String(task.status ?? '').toUpperCase();
    const state = TASK_STATE_MAP[status] ?? 'queued';
    const progressValue = Number(task.progress);
    const progress = Number.isFinite(progressValue) && progressValue > 0
      ? Math.min(100, progressValue)
      : state === 'succeeded'
        ? 100
        : state === 'running'
          ? 45
          : 0;
    // 只有拿到 finish_time 才算真实耗时；已完成但没有 finish_time 时留空，
    // 否则会用「现在」减提交时间，数字会随页面停留不断变大。
    const endStamp =
      task.finish_time || (state === 'running' ? Math.floor(Date.now() / 1000) : 0);
    const elapsedSeconds = endStamp ? endStamp - (task.start_time || task.submit_time) : 0;
    return {
      id: task.task_id || String(task.id),
      title: task.action ? `${task.platform ?? t('任务')} · ${task.action}` : `${task.platform ?? t('任务')} #${task.id}`,
      kind: taskKindOf(task),
      state,
      progress,
      submittedAt: formatRelative(task.submit_time),
      elapsed: elapsedSeconds > 0 ? formatDuration(elapsedSeconds * 1000) : '—',
      cost: quotaToCurrency(task.quota ?? 0, quotaPerUnit),
      note: task.fail_reason || '',
    } satisfies TaskRecord;
  });
}

export function mapMediaKind(kind: TaskKind): MediaKind {
  return kind === 'batch' ? 'image' : kind;
}

function dayKeyOf(point: DataSelfPoint) {
  const day = point.Day ?? point.day;
  if (day) return day.slice(0, 10);
  if (point.created_at) {
    return new Date(point.created_at * 1000).toISOString().slice(0, 10);
  }
  return '';
}

function countOf(point: DataSelfPoint) {
  return point.Count ?? point.count ?? 0;
}

function quotaOf(point: DataSelfPoint) {
  return point.Quota ?? point.quota ?? 0;
}

function tokenUsedOf(point: DataSelfPoint) {
  return point.TokenUsed ?? point.token_used ?? 0;
}

// /api/data/self 可能为空（站点未生成聚合数据），用用量日志兜底。
export function pointsFromLogs(items: UsageLogItem[]): DataSelfPoint[] {
  return items
    .filter((item) => item.type === 2 || item.type === 5 || item.model_name)
    .map((item) => ({
      created_at: item.created_at,
      count: 1,
      quota: item.quota ?? 0,
      token_used: (item.prompt_tokens ?? 0) + (item.completion_tokens ?? 0),
    }));
}

export function buildMetrics(input: {
  points: DataSelfPoint[];
  modelCount: number;
  quotaPerUnit: number;
  range: UsageRange;
}): OverviewMetrics {
  const { points, modelCount, range } = input;
  const windowDays = range === '24h' ? 1 : range === '7d' ? 7 : 30;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (windowDays - 1));

  const inRange = points.filter((point) => {
    const day = dayKeyOf(point);
    if (!day) return false;
    return new Date(`${day}T00:00:00`).getTime() >= cutoff.getTime();
  });
  const source = inRange;

  const requests = source.reduce((sum, point) => sum + countOf(point), 0);
  const quota = source.reduce((sum, point) => sum + quotaOf(point), 0);
  const tokens = source.reduce((sum, point) => sum + tokenUsedOf(point), 0);

  return {
    requests: formatCompact(requests),
    reliability: requests > 0 ? '100%' : '—',
    availableModels: String(modelCount),
    averageLatency: '—',
    issueCount: 0,
    totalUsage: quota,
    totalQuota: Math.max(quota, 1),
    summary: `${formatQuota(quota, input.quotaPerUnit)} · ${formatCompact(tokens)} tokens`,
  };
}

export function buildAccountSummary(input: {
  username: string;
  role: number;
  group: string;
  quota: number;
  quotaPerUnit: number;
}): AccountSummary {
  return {
    workspaceName: input.username,
    role: input.role === 1 ? t('普通用户') : tf('角色 {0}', input.role),
    plan: input.group || 'default',
    balance: formatQuota(input.quota, input.quotaPerUnit),
    endpoint: 'test.qmszai.cn',
    mode: t('在线'),
  };
}

export function conversationTitle(conversation: ChatConversation) {
  return conversation.Title?.trim() || tf('对话 {0}', conversation.ID);
}
