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
  if (dayDiff === 1) return `昨天 ${clock}`;
  if (dayDiff < 7) return `星期${'日一二三四五六'[date.getDay()]} ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}
