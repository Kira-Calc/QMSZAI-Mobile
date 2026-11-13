import { t } from '../i18n';
import {
  fetchAudioTask,
  fetchMusicTask,
  fetchMusicV3Task,
  fetchVideoTask,
} from '../api/endpoints';
import { getMediaGenerations, updateMediaGeneration } from '../mediaGenerations';
import type { MediaTaskMode } from '../types';
import { firstMediaUrl, taskErrorOf, taskProgressOf, taskStateOf } from './mediaModels';

// 生成任务轮询放在模块里而不是组件里：离开 AI 创作页、甚至页面卸载后，
// 轮询仍然继续，结果直接写回本机记录。App 重启后由 resumePendingMediaTasks 接上。

const POLL_INTERVAL = 4000;
// 5 分钟：和视频/音乐上游的常规耗时对齐，超时后记录落到失败而不是永远转圈。
const POLL_ATTEMPTS = 75;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const running = new Map<string, Promise<void>>();

function fetchTaskOf(mode: MediaTaskMode, taskId: string) {
  if (mode === 'video') return fetchVideoTask(taskId);
  if (mode === 'music3') return fetchMusicV3Task(taskId);
  if (mode === 'music') return fetchMusicTask(taskId);
  return fetchAudioTask(taskId);
}

async function poll(recordId: string, taskId: string, mode: MediaTaskMode) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL);
    let task: unknown;
    try {
      task = await fetchTaskOf(mode, taskId);
    } catch {
      // 单次查询失败（断网、瞬时 5xx）不算任务失败，继续下一轮。
      continue;
    }
    const state = taskStateOf(task);
    if (state === 'failed') {
      await updateMediaGeneration(recordId, {
        status: 'failed',
        error: taskErrorOf(task) || t('上游任务失败'),
      });
      return;
    }
    if (state === 'succeeded') {
      const url = firstMediaUrl(task);
      await updateMediaGeneration(recordId, {
        status: 'succeeded',
        url: url ?? undefined,
        error: url ? undefined : t('任务已完成，但未找到媒体地址'),
      });
      return;
    }
    const progress = taskProgressOf(task);
    if (progress !== null) {
      await updateMediaGeneration(recordId, { progress });
    }
  }
  // 超时不代表上游失败，但界面不能一直显示「生成中」。
  await updateMediaGeneration(recordId, {
    status: 'failed',
    error: t('任务超时，请稍后在任务页查看结果'),
  });
}

// 同一个记录只允许一条轮询链，重复调用直接复用。
export function waitForMediaTask(recordId: string, taskId: string, mode: MediaTaskMode) {
  const existing = running.get(recordId);
  if (existing) return existing;
  const promise = poll(recordId, taskId, mode).finally(() => {
    running.delete(recordId);
  });
  running.set(recordId, promise);
  return promise;
}

// App 启动/回到前台时调用：把上次没轮询完的任务重新接上。
export function resumePendingMediaTasks() {
  for (const record of getMediaGenerations()) {
    if (record.status !== 'running' || !record.taskId || !record.taskMode) continue;
    void waitForMediaTask(record.id, record.taskId, record.taskMode);
  }
}
