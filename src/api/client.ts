import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { isEnglish, t } from '../i18n';

// 测试环境。生产切换时只改这里。
export const API_BASE_URL = 'https://test.qmszai.cn';

const COOKIE_KEY = 'qmszai_session_cookie';
const USER_KEY = 'qmszai_session_user';

export type Session = {
  // 完整 Cookie 头，形如 "session=xxx"
  cookie: string;
  userId: number;
};

let session: Session | null = null;
let restoring: Promise<Session | null> | null = null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getSession(): Session | null {
  return session;
}

export function setSession(next: Session | null) {
  session = next;
}

export async function restoreSession(): Promise<Session | null> {
  if (session) return session;
  if (restoring) return restoring;
  restoring = (async () => {
    try {
      const [cookie, userId] = await Promise.all([
        SecureStore.getItemAsync(COOKIE_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      if (!cookie || !userId) return null;
      const parsedUserId = Number(userId);
      if (!Number.isFinite(parsedUserId) || parsedUserId < 0) return null;
      session = { cookie, userId: parsedUserId };
      return session;
    } catch {
      return null;
    } finally {
      restoring = null;
    }
  })();
  return restoring;
}

export async function persistSession(next: Session): Promise<void> {
  session = next;
  await Promise.all([
    SecureStore.setItemAsync(COOKIE_KEY, next.cookie),
    SecureStore.setItemAsync(USER_KEY, String(next.userId)),
  ]);
}

export async function clearSession(): Promise<void> {
  session = null;
  await Promise.all([
    SecureStore.deleteItemAsync(COOKIE_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

function authHeaders(): Record<string, string> {
  if (!session) return {};
  if (Platform.OS === 'ios') {
    // iOS 的 NSURLSession 会接管 Cookie 头：手工设置的 Cookie 会被原生 Cookie jar 覆盖/丢弃，
    // 导致服务端收不到会话而返回 401。因此 iOS 只带 New-Api-User，Cookie 交给原生 jar
    // （登录响应里的 Set-Cookie 会自动写入，重启后依然有效）。
    return session.userId > 0 ? { 'New-Api-User': String(session.userId) } : {};
  }
  // 2FA 待验证阶段只下发 Cookie，还没有可靠的用户 ID。
  if (session.userId > 0) {
    return { Cookie: session.cookie, 'New-Api-User': String(session.userId) };
  }
  return { Cookie: session.cookie };
}

function parseSessionCookie(rawHeaders: string): string | null {
  // Set-Cookie 可能有多条，RN 上会合并成一个字符串返回。
  const matches = rawHeaders.match(/(?:^|[\r\n,;])\s*set-cookie\s*:\s*([^\r\n]*)/gi);
  const candidates = matches ?? [];
  for (const line of candidates) {
    const value = line.replace(/^\s*set-cookie\s*:\s*/i, '');
    const sessionMatch = value.match(/(?:^|[;,\s])session=([^;,\s]+)/i);
    if (sessionMatch) return `session=${sessionMatch[1]}`;
  }
  // 兜底：响应头里直接出现 session=...
  const loose = rawHeaders.match(/(?:^|[;,\s])session=([^;,\s]+)/i);
  return loose ? `session=${loose[1]}` : null;
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  // 需要登录态（带 Cookie 与 New-Api-User）
  auth?: boolean;
  timeout?: number;
};

export type RawResponse = {
  status: number;
  text: string;
  headers: string;
  cookie: string | null;
};

// XHR 而非 fetch：需要可靠读到 Set-Cookie 与完整响应头。
export function rawRequest(path: string, options: RequestOptions = {}): Promise<RawResponse> {
  const { method = 'GET', body, auth = false, timeout = 30000 } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_BASE_URL}${path}`);
    xhr.timeout = timeout;
    xhr.setRequestHeader('Accept', 'application/json');
    if (body !== undefined) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    if (auth) {
      const headers = authHeaders();
      Object.keys(headers).forEach((key) => xhr.setRequestHeader(key, headers[key]));
    }

    xhr.onload = () => {
      const headers = xhr.getAllResponseHeaders() ?? '';
      resolve({
        status: xhr.status,
        text: xhr.responseText ?? '',
        headers,
        cookie: parseSessionCookie(headers),
      });
    };
    xhr.onerror = () => reject(new ApiError(t('网络连接失败，请检查网络后重试'), 0));
    xhr.ontimeout = () => reject(new ApiError(t('请求超时，请稍后重试'), 0));

    xhr.send(body === undefined ? null : JSON.stringify(body));
  });
}

type Envelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

// 后端部分提示仍是英文，展示前做本地化。
const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/username or password is incorrect/i, '账号或密码错误'],
  [/user has been banned/i, '账号已被禁用'],
  [/email verification is enabled/i, '请填写手机号与短信验证码'],
  [/invalid parameters/i, '参数不正确'],
  [/user quota is not enough|insufficient_user_quota/i, '额度不足，请先签到或充值'],
  [/model .*not found|invalid model/i, '模型不可用，请更换模型'],
  [/too many requests/i, '请求过于频繁，请稍后再试'],
  [/unauthorized|未提供 access token/i, '登录状态已失效，请重新登录'],
];

export function localizeMessage(message: string): string {
  if (!message) return message;
  // 英文界面直接使用服务端原文，避免把英文提示再映射一次。
  if (isEnglish()) return message;
  const hit = MESSAGE_MAP.find(([pattern]) => pattern.test(message));
  return hit ? hit[1] : message;
}

function extractError(message: string, status: number, text: string): string {
  if (message) return localizeMessage(message);
  try {
    const parsed = JSON.parse(text);
    const apiMessage = parsed?.message ?? parsed?.error?.message ?? parsed?.error;
    if (typeof apiMessage === 'string' && apiMessage) return localizeMessage(apiMessage);
  } catch {
    // ignore
  }
  if (status === 401) return t('登录状态已失效，请重新登录');
  if (status === 403) return t('没有权限或额度不足');
  if (status === 429) return t('操作过于频繁，请稍后重试');
  return t('服务暂时不可用，请稍后重试');
}

// /api/*：统一 {success,message,data} 包裹，业务失败时 HTTP 仍可能是 200。
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, options);
  let parsed: Envelope<T> | null = null;
  try {
    parsed = response.text ? (JSON.parse(response.text) as Envelope<T>) : null;
  } catch {
    parsed = null;
  }

  if (response.status === 401) {
    throw new ApiError(extractError(parsed?.message ?? '', response.status, response.text), 401);
  }
  if (!parsed) {
    if (response.status >= 200 && response.status < 300) {
      return undefined as T;
    }
    throw new ApiError(extractError('', response.status, response.text), response.status);
  }
  if (parsed.success === false) {
    throw new ApiError(extractError(parsed.message ?? '', response.status, response.text), response.status);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(extractError(parsed.message ?? '', response.status, response.text), response.status);
  }
  return parsed.data as T;
}

// /pg/*：上游原生格式（无 success 包裹），错误为 {error:{message}}。
export async function pgRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await rawRequest(path, { ...options, auth: true });
  let parsed: unknown = null;
  try {
    parsed = response.text ? JSON.parse(response.text) : null;
  } catch {
    parsed = null;
  }

  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(extractError('', response.status, response.text), response.status);
  }
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const error = (parsed as { error?: { message?: string } | string | null }).error;
    if (error) {
      const message = typeof error === 'string' ? error : error.message;
      throw new ApiError(message || t('请求失败'), response.status);
    }
  }
  return parsed as T;
}

export type StreamHandlers = {
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onDone?: (meta: { finishReason?: string }) => void;
};

// 语音合成返回音频二进制，异步 /pg/audio/submit 在测试环境上游报错，
// 因此直接走同步 /pg/audio/speech，把结果写入缓存文件供播放。
export async function speechToFile(body: {
  model: string;
  input: string;
  voice?: string;
}): Promise<{ uri: string; mime: string }> {
  const headers = authHeaders();
  const response = await expoFetch(`${API_BASE_URL}/pg/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/*',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(extractError('', response.status, text), response.status);
  }

  const buffer = await response.arrayBuffer();
  const mime = response.headers.get('content-type') || 'audio/mpeg';
  const ext = mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : 'mp3';
  const file = new File(Paths.cache, `tts-${Date.now()}.${ext}`);
  await file.write(new Uint8Array(buffer));
  return { uri: file.uri, mime };
}

const BASE64_TABLE = (() => {
  const table = new Int16Array(128).fill(-1);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < chars.length; i += 1) table[chars.charCodeAt(i)] = i;
  return table;
})();

// 大段 base64（音乐约 2MB）在原生写入里不稳定，先自行解码成字节。
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  let length = Math.floor((clean.length * 3) / 4);
  if (clean.endsWith('==')) length -= 2;
  else if (clean.endsWith('=')) length -= 1;
  const bytes = new Uint8Array(Math.max(0, length));
  let offset = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const aRaw = BASE64_TABLE[clean.charCodeAt(i)] ?? -1;
    const bRaw = BASE64_TABLE[clean.charCodeAt(i + 1)] ?? -1;
    const cRaw = BASE64_TABLE[clean.charCodeAt(i + 2)] ?? -1;
    const dRaw = BASE64_TABLE[clean.charCodeAt(i + 3)] ?? -1;
    const a = aRaw < 0 ? 0 : aRaw;
    const b = bRaw < 0 ? 0 : bRaw;
    const c = cRaw < 0 ? 64 : cRaw;
    const d = dRaw < 0 ? 64 : dRaw;
    bytes[offset++] = (a << 2) | (b >> 4);
    if (c !== 64) bytes[offset++] = ((b & 15) << 4) | (c >> 2);
    if (d !== 64) bytes[offset++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, offset);
}

// 大响应（音乐 base64 约 4MB）走 expo/fetch，避免 XHR 大包卡住。
export async function pgPostJson<T>(
  path: string,
  body: unknown,
  timeoutMs = 180000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await expoFetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ApiError(extractError('', response.status, text), response.status);
    }
    const parsed = JSON.parse(text) as { data?: T; error?: { message?: string } };
    if (parsed?.error?.message) throw new ApiError(parsed.error.message, response.status);
    return (parsed?.data ?? parsed) as T;
  } finally {
    clearTimeout(timer);
  }
}

// 把接口返回的 base64 音频写入缓存文件。
export async function writeBase64Audio(base64: string, ext = 'mp3'): Promise<{ uri: string; mime: string }> {
  const file = new File(Paths.cache, `audio-${Date.now()}.${ext}`);
  await file.write(decodeBase64(base64));
  const mime = ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
  return { uri: file.uri, mime };
}

// 非流式对话，供多模型融合等一次性调用。
export async function chatOnce(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  const headers = authHeaders();
  const response = await expoFetch(`${API_BASE_URL}/pg/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify({ ...body, stream: false }),
    signal,
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new ApiError(extractError('', response.status, text), response.status);
  }
  try {
    const parsed = JSON.parse(text);
    const content = parsed?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (typeof parsed?.error?.message === 'string') throw new ApiError(parsed.error.message, response.status);
    return '';
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(t('模型返回格式异常'), response.status);
  }
}

// SSE 流式对话。expo/fetch 提供可读流，普通 fetch 在 RN 上拿不到增量。
export async function streamChat(
  body: Record<string, unknown>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers = authHeaders();
  const response = await expoFetch(`${API_BASE_URL}/pg/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(extractError('', response.status, text), response.status);
  }
  if (!response.body) {
    throw new ApiError(t('当前设备不支持流式响应'), 0);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finishReason: string | undefined;

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const chunk = JSON.parse(payload);
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        handlers.onDelta?.(delta.content);
      }
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        handlers.onReasoning?.(delta.reasoning_content);
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    } catch {
      // 忽略无法解析的心跳或半包
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
        newlineIndex = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) handleLine(buffer.trim());
  } finally {
    reader.releaseLock();
  }

  handlers.onDone?.({ finishReason });
}
