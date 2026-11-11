import type { PricingItem, PricingPayload } from '../api/types';
import type { MediaKind, Model } from '../types';

const IMAGE_PATTERN =
  /(^|[-_/])(image|imagen|dall-e|dalle|flux|mj|midjourney|seedream|cogview|kolors)([-_/]|$)|wand-vega-image|qwen-image/i;
const VIDEO_PATTERN = /video|veo|kling|sora|hailuo|vidu|cogvideo|t2v|i2v|seedance/i;
const MUSIC_PATTERN = /music|suno|chirp|udio|song/i;
const VOICE_PATTERN = /(^|[-_/])(tts|speech|audio|voice|vocal)/i;
const NON_VOICE_PATTERN = /to-text|transcription|whisper|speech-to/i;

function matchesKind(name: string, kind: MediaKind) {
  if (VIDEO_PATTERN.test(name)) return kind === 'video';
  if (MUSIC_PATTERN.test(name)) return kind === 'music';
  if (IMAGE_PATTERN.test(name)) return kind === 'image';
  if (VOICE_PATTERN.test(name) && !NON_VOICE_PATTERN.test(name)) return kind === 'voice';
  return false;
}

export function modelsForKind(models: Model[], kind: MediaKind) {
  return models.filter((model) => matchesKind(model.id || model.name, kind)).map((model) => model.id);
}

export function pricingOf(pricing: PricingPayload | null, modelName: string): PricingItem | null {
  return pricing?.data?.find((item) => item.model_name === modelName) ?? null;
}

function groupRatioOf(pricing: PricingPayload | null, group?: string) {
  if (!pricing?.group_ratio) return 1;
  if (group && typeof pricing.group_ratio[group] === 'number') return pricing.group_ratio[group];
  const first = Object.values(pricing.group_ratio)[0];
  return typeof first === 'number' ? first : 1;
}

// 按次计费用 model_price；按 token 计费用 model_ratio × 2 × 分组倍率（货币 / 1M）。
export function priceLabelOf(
  pricing: PricingPayload | null,
  modelName: string,
  group?: string,
) {
  const item = pricingOf(pricing, modelName);
  if (!item) return '按站点计费';
  const ratio = groupRatioOf(pricing, group);
  if (item.quota_type === 1) {
    const price = (item.model_price || 0) * ratio;
    return price > 0 ? `¥${price.toFixed(2)} / 次` : '按站点计费';
  }
  const price = (item.model_ratio || 0) * 2 * ratio;
  return price > 0 ? `¥${price.toFixed(2)} / 1M tokens` : '按站点计费';
}

const MEDIA_EXTENSION = /\.(png|jpe?g|webp|gif|mp4|mov|webm|mp3|wav|m4a|ogg|flac)(\?|$)/i;

function collectUrls(payload: unknown, output: string[], depth = 0) {
  if (depth > 8 || payload === null || payload === undefined) return;
  if (typeof payload === 'string') {
    const value = payload.trim();
    if (/^https?:\/\//i.test(value)) output.push(value);
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectUrls(item, output, depth + 1));
    return;
  }
  if (typeof payload === 'object') {
    Object.values(payload as Record<string, unknown>).forEach((value) =>
      collectUrls(value, output, depth + 1),
    );
  }
}

// 上游返回结构随渠道不同，统一从响应里找出第一个媒体链接。
export function firstMediaUrl(payload: unknown): string | null {
  const urls: string[] = [];
  collectUrls(payload, urls);
  if (!urls.length) return null;
  return urls.find((url) => MEDIA_EXTENSION.test(url)) ?? urls[0];
}

export function taskIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const direct = record.task_id ?? record.taskId ?? record.id;
  if (typeof direct === 'string' && direct) return direct;
  if (typeof direct === 'number') return String(direct);
  const nested = record.data;
  if (nested && typeof nested === 'object') {
    const inner = taskIdOf(nested);
    if (inner) return inner;
  }
  return null;
}

const SUCCESS_STATES = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'FINISHED', 'DONE'];
const FAILURE_STATES = ['FAILURE', 'FAILED', 'FAIL', 'ERROR', 'CANCELLED', 'CANCELED'];

// /pg/*/fetch/:id 返回 {code, message, data:{status, url}}，状态在 data 里。
function nestedDataOf(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {};
  const data = (payload as Record<string, unknown>).data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

export function taskStateOf(payload: unknown): 'running' | 'succeeded' | 'failed' {
  if (!payload || typeof payload !== 'object') return 'running';
  const record = payload as Record<string, unknown>;
  const inner = nestedDataOf(payload);
  const status = String(record.status ?? record.state ?? inner.status ?? inner.state ?? '').toUpperCase();
  if (SUCCESS_STATES.includes(status)) return 'succeeded';
  if (FAILURE_STATES.includes(status)) return 'failed';
  const code = String(record.code ?? '').toLowerCase();
  if (code && code !== 'success' && code !== '0') return 'failed';
  return 'running';
}

export function taskProgressOf(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const raw = record.progress ?? (record.data as Record<string, unknown> | undefined)?.progress;
  const value = typeof raw === 'string' ? Number.parseFloat(raw.replace('%', '')) : Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

export function taskErrorOf(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const inner = nestedDataOf(payload);
  const direct = record.fail_reason ?? record.error ?? record.message ?? inner.fail_reason ?? inner.error;
  if (typeof direct === 'string' && direct) return direct;
  if (direct && typeof direct === 'object') {
    const message = (direct as { message?: string }).message;
    if (message) return message;
  }
  return '';
}
