import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { MediaGeneration } from './types';

// AI 创作记录落在本机：组件卸载、退出页面、重启 App 都不能丢。
// 记录按账号隔离：换账号登录时清空，避免把上一个账号的生成结果留在本机。
const STORAGE_KEY = 'qmszai.media.generations';
const ACCOUNT_KEY = 'qmszai.media.generations.account';
const LIMIT = 60;

let generations: MediaGeneration[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
let account: string | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isRecord(value: unknown): value is MediaGeneration {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.kind === 'string' &&
    typeof item.prompt === 'string' &&
    typeof item.model === 'string' &&
    typeof item.status === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.summary === 'string'
  );
}

// 没有任务号的「生成中」记录活不过重启：同步请求随进程结束，再也不会有人更新它。
function revive(item: MediaGeneration): MediaGeneration {
  if (item.status !== 'running' || item.taskId) return item;
  return { ...item, status: 'failed', interrupted: true };
}

let writeQueue: Promise<void> = Promise.resolve();

// 串行写入：进度更新很频繁，保证最后落盘的一定是最新状态。
function persist() {
  const snapshot = JSON.stringify(generations);
  writeQueue = writeQueue
    .then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot))
    .catch(() => {});
  return writeQueue;
}

export async function initMediaGenerations() {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const [raw, savedAccount] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(ACCOUNT_KEY),
      ]);
      account = savedAccount;
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          generations = parsed.filter(isRecord).slice(0, LIMIT).map(revive);
        }
      }
    } catch {
      // 存储损坏时从空列表开始，不让页面白屏。
    } finally {
      hydrated = true;
      hydrating = null;
      emit();
    }
  })();
  return hydrating;
}

// 切换账号时清掉上一位用户的记录；同一账号重复调用不会动数据。
export async function bindMediaGenerationAccount(id: number | string) {
  await initMediaGenerations();
  const key = String(id);
  if (account === key) return;
  account = key;
  generations = [];
  emit();
  await Promise.all([
    AsyncStorage.setItem(ACCOUNT_KEY, key),
    AsyncStorage.removeItem(STORAGE_KEY),
  ]);
}

export function getMediaGenerations() {
  return generations;
}

export async function addMediaGeneration(record: MediaGeneration) {
  await initMediaGenerations();
  generations = [record, ...generations.filter((item) => item.id !== record.id)].slice(0, LIMIT);
  emit();
  await persist();
}

export async function updateMediaGeneration(id: string, patch: Partial<MediaGeneration>) {
  await initMediaGenerations();
  if (!generations.some((item) => item.id === id)) return;
  generations = generations.map((item) => (item.id === id ? { ...item, ...patch } : item));
  emit();
  await persist();
}

export function useMediaGenerations() {
  return useSyncExternalStore(subscribe, getMediaGenerations, getMediaGenerations);
}
