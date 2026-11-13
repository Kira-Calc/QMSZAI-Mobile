import { isEnglish, t, tf } from '../i18n';
// 额度与时间格式化。额度单位为 quota，按站点 quota_per_unit 换算成货币。

const DEFAULT_QUOTA_PER_UNIT = 500000;

export function quotaToCurrency(quota: number, quotaPerUnit = DEFAULT_QUOTA_PER_UNIT) {
  const unit = quotaPerUnit > 0 ? quotaPerUnit : DEFAULT_QUOTA_PER_UNIT;
  return quota / unit;
}

export function formatCurrency(value: number, fractionDigits = 2) {
  if (!Number.isFinite(value)) return '¥0.00';
  return `¥${value.toFixed(fractionDigits)}`;
}

export function formatQuota(quota: number, quotaPerUnit = DEFAULT_QUOTA_PER_UNIT, fractionDigits = 2) {
  return formatCurrency(quotaToCurrency(quota, quotaPerUnit), fractionDigits);
}

// 小额额度保留 4 位，避免签到奖励等被显示成 ¥0.00。
export function formatQuotaSmart(quota: number, quotaPerUnit = DEFAULT_QUOTA_PER_UNIT) {
  const value = quotaToCurrency(quota, quotaPerUnit);
  return formatCurrency(value, value > 0 && value < 0.01 ? 4 : 2);
}

export function formatCompact(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (isEnglish()) {
    const abs = Math.abs(value);
    if (abs >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
    if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(Math.round(value));
  }
  if (Math.abs(value) >= 100000000) return tf('{0}亿', (value / 100000000).toFixed(1));
  if (Math.abs(value) >= 10000) return tf('{0}万', (value / 10000).toFixed(1));
  return String(Math.round(value));
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatUnixTime(seconds: number) {
  if (!seconds) return '—';
  const date = new Date(seconds * 1000);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatIsoTime(iso: string) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return formatUnixTime(Math.floor(date.getTime() / 1000));
}

export function formatRelative(seconds: number) {
  if (!seconds) return '—';
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return t('刚刚');
  if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    if (isEnglish()) return `${minutes} min ago`;
    return tf('{0} 分钟前', minutes);
  }
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600);
    if (isEnglish()) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    return tf('{0} 小时前', hours);
  }
  if (diff < 86400 * 30) {
    const days = Math.floor(diff / 86400);
    if (isEnglish()) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    return tf('{0} 天前', days);
  }
  return formatUnixTime(seconds);
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTokens(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value));
}
