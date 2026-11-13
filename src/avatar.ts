import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useSyncExternalStore } from 'react';

// 头像目前只存在本机：new-api 的用户表没有 avatar 列，`PUT /api/user/self` 只保存
// username / password / display_name，也没有上传路由（2026-11 对照后端源码确认）。
//
// 等后端补上头像字段后，改动只涉及本文件：
// 1. `GET /api/user/self` 返回 avatar 时，在 `useAvatar` 里用远端值兜底；
// 2. `saveAvatar` 之后把文件/链接回传给服务端（新增一个 `PUT /api/user/self` 或上传接口）。
// 本机的存储结构与 UI 都不用动。
const STORAGE_KEY = 'qmszai.avatar';
const DIRECTORY = 'avatars';

let avatars: Record<string, string> = {};
let hydrated = false;
let hydrating: Promise<void> | null = null;

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

function avatarDirectory() {
  const directory = new Directory(Paths.document, DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function exists(uri: string) {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function initAvatars() {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        // 沙盒文件被清掉时不要留一个打不开的头像。
        avatars = Object.fromEntries(
          Object.entries(parsed).filter(([, uri]) => typeof uri === 'string' && exists(uri)),
        );
        emit();
      }
    } catch {
      // 读失败就当没设置过头像。
    } finally {
      hydrated = true;
      hydrating = null;
    }
  })();
  return hydrating;
}

async function persist(next: Record<string, string>) {
  avatars = next;
  emit();
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function discard(uri?: string) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // 旧文件删不掉不影响新头像。
  }
}

export async function saveAvatar(userId: number | string, sourceUri: string) {
  await initAvatars();
  const key = String(userId);
  const target = new File(avatarDirectory(), `${key}-${Date.now()}.jpg`);
  new File(sourceUri).copySync(target);
  const previous = avatars[key];
  await persist({ ...avatars, [key]: target.uri });
  discard(previous);
  return target.uri;
}

export async function removeAvatar(userId: number | string) {
  await initAvatars();
  const key = String(userId);
  const previous = avatars[key];
  const next = { ...avatars };
  delete next[key];
  await persist(next);
  discard(previous);
}

// 空串表示没有头像，交给调用方回退到首字母。
export function useAvatar(userId?: number | string) {
  useEffect(() => {
    void initAvatars();
  }, []);
  const key = userId === undefined || userId === null ? '' : String(userId);
  return useSyncExternalStore(subscribe, () => (key ? avatars[key] ?? '' : ''));
}
