import { isEnglish, tf } from './i18n';

// 消息气泡下方的时间戳：今天只显示时分，本周显示星期，更早显示日期。
export function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const dayStart = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round((dayStart(now) - dayStart(date)) / 86400000);
  if (dayDiff <= 0) return clock;

  if (isEnglish()) {
    if (dayDiff === 1) return tf('昨天 {0}', clock);
    if (dayDiff < 7) return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${clock}`;
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock}`;
    }
    return `${date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} ${clock}`;
  }

  if (dayDiff === 1) return tf('昨天 {0}', clock);
  if (dayDiff < 7) return tf('星期{0} {1}', '日一二三四五六'[date.getDay()], clock);
  if (date.getFullYear() === now.getFullYear()) return tf('{0}月{1}日 {2}', date.getMonth() + 1, date.getDate(), clock);
  return tf('{0}年{1}月{2}日 {3}', date.getFullYear(), date.getMonth() + 1, date.getDate(), clock);
}
