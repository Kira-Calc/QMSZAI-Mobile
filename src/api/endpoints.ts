import {
  apiRequest,
  clearSession,
  localizeMessage,
  persistSession,
  pgPostJson,
  pgRequest,
  rawRequest,
  restoreSession,
} from './client';
import type {
  ApiTokenPage,
  CaptchaChallenge,
  ChatConversation,
  ChatMessage,
  CheckinStatus,
  DataSelfPoint,
  LogStat,
  LoginResult,
  Paged,
  PricingPayload,
  PublicStatus,
  SelfUser,
  SiteStatus,
  TaskPage,
  UsageLogPage,
} from './types';

// ---------- 公共 ----------

export function fetchPublicStatus() {
  return apiRequest<PublicStatus>('/api/public/status');
}

export function fetchSiteStatus() {
  return apiRequest<SiteStatus>('/api/status', { auth: true });
}

export function fetchNotice() {
  return apiRequest<string>('/api/notice');
}

// /api/pricing 直接返回 {data, group_ratio, vendors, ...}，不是标准 {success,data} 包裹。
export async function fetchPricing(): Promise<PricingPayload> {
  const response = await rawRequest('/api/pricing', { auth: true });
  let parsed: PricingPayload | null = null;
  try {
    parsed = response.text ? (JSON.parse(response.text) as PricingPayload) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.data)) {
    throw new Error('价格数据加载失败');
  }
  return parsed;
}

// ---------- 认证 ----------

export function generateCaptcha() {
  return apiRequest<CaptchaChallenge>('/api/captcha/generate');
}

export function verifyCaptcha(token: string, clicks: { x: number; y: number }[]) {
  return apiRequest<{ token: string }>('/api/captcha/verify', {
    method: 'POST',
    body: { token, clicks },
  });
}

export function sendSmsCode(phone: string, captchaToken: string) {
  return apiRequest<string | null>(
    `/api/sms/verification?phone=${encodeURIComponent(phone)}&captcha_token=${encodeURIComponent(captchaToken)}`,
  );
}

export function sendResetSms(phone: string, captchaToken: string) {
  return apiRequest<string | null>(
    `/api/reset_password/sms?phone=${encodeURIComponent(phone)}&captcha_token=${encodeURIComponent(captchaToken)}`,
  );
}

type LoginAttempt = {
  result: LoginResult;
  cookie: string | null;
};

// 登录：成功后服务端下发 session Cookie，需先落库再取用户信息。
export async function login(username: string, password: string): Promise<LoginAttempt> {
  const response = await rawRequest('/api/user/login', {
    method: 'POST',
    body: { username, password },
  });
  const parsed = parseEnvelope<LoginResult>(response.status, response.text);
  if (!parsed) throw new Error('登录失败：响应格式异常');
  if (parsed.success === false) throw new Error(localizeMessage(parsed.message || '登录失败'));

  const result = parsed.data ?? {};
  if (!response.cookie && !result.require_2fa && !result.need_set_password) {
    throw new Error('登录会话保存失败，请重试');
  }
  if (response.cookie) {
    await persistSession({ cookie: response.cookie, userId: result.id ?? 0 });
  }
  return { result, cookie: response.cookie };
}

// 2FA 需要沿用登录接口下发的 pending Cookie，成功后服务端会再下发正式会话。
export async function loginWith2FA(code: string): Promise<LoginResult> {
  const response = await rawRequest('/api/user/login/2fa', {
    method: 'POST',
    body: { code },
    auth: true,
  });
  const parsed = parseEnvelope<LoginResult>(response.status, response.text);
  if (!parsed) throw new Error('验证失败：响应格式异常');
  if (parsed.success === false) throw new Error(localizeMessage(parsed.message || '验证码错误'));
  const result = parsed.data ?? {};
  const userId = result.id ?? (await restoreSession())?.userId ?? 0;
  const cookie = response.cookie ?? (await restoreSession())?.cookie;
  if (cookie) await persistSession({ cookie, userId });
  return result;
}

export async function logout() {
  try {
    await apiRequest<null>('/api/user/logout', { auth: true });
  } finally {
    await clearSession();
  }
}

export function registerAccount(input: {
  username?: string;
  password: string;
  phone: string;
  verification_code: string;
  aff_code?: string;
}) {
  return apiRequest<null>('/api/user/register', { method: 'POST', body: input });
}

export function resetPasswordByPhone(input: {
  phone: string;
  code: string;
  new_password: string;
  new_username?: string;
}) {
  return apiRequest<null>('/api/user/reset/phone', { method: 'POST', body: input });
}

export function checkPhone(phone: string) {
  return apiRequest<{ exists: boolean; has_password: boolean }>(
    `/api/user/check_phone?phone=${encodeURIComponent(phone)}`,
  );
}

// ---------- 用户 ----------

export async function fetchSelf(): Promise<SelfUser> {
  const session = await restoreSession();
  if (!session) throw new Error('未登录');
  return apiRequest<SelfUser>('/api/user/self', { auth: true });
}

export function updateSelf(input: {
  username: string;
  display_name?: string;
  password?: string;
  original_password?: string;
}) {
  return apiRequest<SelfUser>('/api/user/self', { method: 'PUT', body: input, auth: true });
}

// 实测 playground-models 只返回 auto 分组的极少数模型，主列表用 /api/user/models。
export function fetchUserModels() {
  return apiRequest<string[]>('/api/user/models', { auth: true });
}

export function fetchPlaygroundModels() {
  return apiRequest<string[]>('/api/user/playground-models', { auth: true });
}

export function fetchUserGroups() {
  return apiRequest<Record<string, { ratio: number; desc: string }>>('/api/user/groups', { auth: true });
}

export type VoiceOption = { label: string; value: string };

export function fetchVoices(model: string) {
  return apiRequest<Array<VoiceOption | string>>(
    `/api/user/model/voices?model=${encodeURIComponent(model)}`,
    { auth: true },
  );
}

export function fetchVideoCapabilities(model: string) {
  return apiRequest<{
    aspect_ratios: string[];
    durations: number[];
    resolutions: string[];
    is_default: boolean;
    model: string;
  }>(`/api/video/model-capabilities?model=${encodeURIComponent(model)}`, { auth: true });
}

// ---------- Playground 媒体 ----------

export type MediaTask = {
  task_id?: string;
  id?: string;
  status?: string;
  progress?: string | number;
  fail_reason?: string;
  data?: unknown;
  result?: unknown;
  [key: string]: unknown;
};

export type ImageSyncResult = {
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  created?: number;
  request_id?: string;
  [key: string]: unknown;
};

export function generateImageSync(input: {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
}) {
  return pgRequest<ImageSyncResult>('/pg/images/sync', {
    method: 'POST',
    body: input,
    timeout: 180000,
  });
}

export function submitVideoTask(input: {
  model: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
}) {
  return pgRequest<MediaTask>('/pg/video/generations', { method: 'POST', body: input });
}

// 实测 POST /pg/video/fetch 返回空数组，改为路径查询。
export function fetchVideoTask(taskId: string) {
  return pgRequest<MediaTask>(`/pg/video/fetch/${encodeURIComponent(taskId)}`);
}

// music-3.0 走独立渠道：同步返回 base64 音频，且 lyrics 必填。
export function submitMusicV3(input: {
  model: string;
  prompt: string;
  lyrics: string;
  duration?: number;
}) {
  return pgPostJson<{
    audio?: string;
    status?: string;
    task_id?: string;
    result_url?: string;
  }>('/pg/music-3.0/submit', input);
}

export function fetchMusicV3Task(taskId: string) {
  return pgRequest<{
    audio?: string;
    status?: string;
    task_id?: string;
  }>(`/pg/music-3.0/fetch/${encodeURIComponent(taskId)}`);
}

export function submitMusicTask(input: { model: string; prompt: string; duration?: number }) {
  return pgRequest<MediaTask>('/pg/music/submit', { method: 'POST', body: input });
}

export function fetchMusicTask(taskId: string) {
  return pgRequest<MediaTask>(`/pg/music/fetch/${encodeURIComponent(taskId)}`);
}

export function submitAudioTask(input: { model: string; prompt: string; voice?: string }) {
  return pgRequest<MediaTask>('/pg/audio/submit', { method: 'POST', body: input });
}

export function fetchAudioTask(taskId: string) {
  return pgRequest<MediaTask>(`/pg/audio/fetch/${encodeURIComponent(taskId)}`);
}

export function fetchCheckin() {
  return apiRequest<CheckinStatus>('/api/user/checkin', { auth: true });
}

export function submitCheckin() {
  return apiRequest<{ quota_awarded: number; checkin_date: string }>('/api/user/checkin', {
    method: 'POST',
    auth: true,
  });
}

export function fetchAffCode() {
  return apiRequest<string>('/api/user/aff', { auth: true });
}

// ---------- 会话历史 ----------

export function fetchConversations(limit = 20, offset = 0) {
  return apiRequest<Paged<ChatConversation>>(
    `/api/chat/conversations?limit=${limit}&offset=${offset}`,
    { auth: true },
  );
}

export function createConversation(title: string, model: string) {
  return apiRequest<ChatConversation>('/api/chat/conversations', {
    method: 'POST',
    body: { title, model },
    auth: true,
  });
}

export function updateConversation(id: number, patch: { title?: string; pinned?: boolean }) {
  return apiRequest<ChatConversation>(`/api/chat/conversations/${id}`, {
    method: 'PUT',
    body: patch,
    auth: true,
  });
}

export function deleteConversation(id: number) {
  return apiRequest<{ message: string }>(`/api/chat/conversations/${id}`, {
    method: 'DELETE',
    auth: true,
  });
}

export function fetchConversationMessages(id: number, limit = 50, offset = 0) {
  return apiRequest<Paged<ChatMessage>>(
    `/api/chat/conversations/${id}/messages?limit=${limit}&offset=${offset}`,
    { auth: true },
  );
}

export function appendMessage(id: number, role: 'user' | 'assistant', content: string, extra?: Record<string, unknown>) {
  return apiRequest<ChatMessage>(`/api/chat/conversations/${id}/messages`, {
    method: 'POST',
    body: { role, content, ...extra },
    auth: true,
  });
}

// ---------- 数据查询 ----------

export function fetchUsageLogs(params: { page?: number; pageSize?: number; type?: number; start?: number; end?: number } = {}) {
  const query = new URLSearchParams();
  query.set('p', String(params.page ?? 1));
  query.set('page_size', String(params.pageSize ?? 20));
  query.set('type', String(params.type ?? 0));
  if (params.start) query.set('start_timestamp', String(params.start));
  if (params.end) query.set('end_timestamp', String(params.end));
  return apiRequest<UsageLogPage>(`/api/log/self?${query.toString()}`, { auth: true });
}

export function fetchLogStat() {
  return apiRequest<LogStat>('/api/log/self/stat', { auth: true });
}

export function fetchTasks(page = 1, pageSize = 20) {
  return apiRequest<TaskPage>(`/api/task/self?p=${page}&page_size=${pageSize}`, { auth: true });
}

export function fetchDataSelf() {
  return apiRequest<{ data?: DataSelfPoint[] } | DataSelfPoint[]>('/api/data/self', { auth: true });
}

// ---------- API 令牌 ----------

export function fetchTokens(page = 1, pageSize = 100) {
  return apiRequest<ApiTokenPage>(`/api/token/?p=${page}&page_size=${pageSize}`, { auth: true });
}

export function createToken(input: {
  name: string;
  remain_quota: number;
  /** 金额（元），与 remain_quota 一起下发，和网页端一致。 */
  remain_amount?: number;
  expired_time: number;
  unlimited_quota: boolean;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string;
  /** 首个分组（服务端旧字段）。 */
  group?: string;
  /** 分组优先级：JSON 字符串数组，与网页端 routing_group_order 一致。 */
  routing_group_order?: string;
}) {
  return apiRequest<null>('/api/token/', { method: 'POST', body: input, auth: true });
}

// 普通 PUT 会按整条令牌覆盖写入，必须带上完整字段；只改启停用 status_only。
export function updateToken(
  id: number,
  patch: {
    name: string;
    remain_quota: number;
    remain_amount?: number;
    expired_time: number;
    unlimited_quota: boolean;
    model_limits_enabled?: boolean;
    model_limits?: string;
    allow_ips?: string;
    group?: string;
    routing_group_order?: string;
  },
) {
  return apiRequest<null>('/api/token/', {
    method: 'PUT',
    body: {
      id,
      name: patch.name,
      remain_quota: patch.remain_quota,
      remain_amount: patch.remain_amount ?? 0,
      expired_time: patch.expired_time,
      unlimited_quota: patch.unlimited_quota,
      model_limits_enabled: patch.model_limits_enabled ?? false,
      model_limits: patch.model_limits ?? '',
      allow_ips: patch.allow_ips ?? '',
      group: patch.group ?? '',
      routing_group_order: patch.routing_group_order ?? '',
    },
    auth: true,
  });
}

export function setTokenStatus(id: number, status: number) {
  return apiRequest<null>('/api/token/?status_only=true', {
    method: 'PUT',
    body: { id, status },
    auth: true,
  });
}

export function deleteToken(id: number) {
  return apiRequest<null>(`/api/token/${id}`, { method: 'DELETE', auth: true });
}

function parseEnvelope<T>(status: number, text: string) {
  try {
    return text ? (JSON.parse(text) as { success?: boolean; message?: string; data?: T }) : null;
  } catch {
    return null;
  }
}
