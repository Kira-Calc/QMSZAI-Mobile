// 测试环境 API 的返回结构（仅保留 App 用到的字段）。

export type PublicStatus = {
  system_name: string;
  logo: string;
  register_enabled: boolean;
  email_verification: boolean;
  sms_verification: boolean;
  turnstile_check: boolean;
  user_agreement_enabled: boolean;
  privacy_policy_enabled: boolean;
  support_email: string;
  support_phone: string;
};

export type SiteStatus = {
  quota_per_unit?: number;
  display_in_currency?: boolean;
  checkin_enabled?: boolean;
  system_name?: string;
  version?: string;
  [key: string]: unknown;
};

export type LoginResult = {
  id?: number;
  username?: string;
  display_name?: string;
  role?: number;
  status?: number;
  group?: string;
  has_password?: boolean;
  phone?: string;
  require_2fa?: boolean;
  need_set_password?: boolean;
};

export type SelfUser = {
  id: number;
  username: string;
  display_name: string;
  email?: string;
  phone?: string;
  role: number;
  status: number;
  quota: number;
  used_quota: number;
  request_count: number;
  group: string;
  aff_code?: string;
  aff_count?: number;
  aff_quota?: number;
  aff_history_quota?: number;
  inviter_id?: number;
  has_password?: boolean;
};

export type CaptchaChar = { char: string; x: number; y: number };

export type CaptchaChallenge = {
  token: string;
  chars: CaptchaChar[];
  target_chars: CaptchaChar[];
  width: number;
  height: number;
};

export type CheckinRecord = {
  checkin_date: string;
  quota_awarded: number;
};

export type CheckinStatus = {
  enabled: boolean;
  max_quota: number;
  min_quota: number;
  stats: {
    checked_in_today: boolean;
    checkin_count: number;
    records: CheckinRecord[];
    total_checkins: number;
    total_quota: number;
  };
};

export type PricingItem = {
  model_name: string;
  description?: string;
  vendor_id?: number;
  icon?: string;
  tags?: string;
  quota_type: number;
  model_ratio: number;
  model_price: number;
  completion_ratio: number;
  cache_ratio?: number;
  enable_groups: string[];
  supported_endpoint_types?: string[];
  is_foreign?: number;
};

export type PricingPayload = {
  data: PricingItem[];
  group_ratio?: Record<string, number>;
  auto_groups?: string[];
  vendors?: Array<{ id: number; name: string; icon?: string }>;
  success?: boolean;
};

export type ChatConversation = {
  ID: number;
  UserID: number;
  Title: string;
  Model: string;
  type?: string;
  IsPinned?: boolean;
  CreatedAt: string;
  UpdatedAt: string;
};

export type ChatMessage = {
  ID: number;
  ConversationID: number;
  Role: 'user' | 'assistant' | 'system';
  Content: string;
  ReasoningContent?: string | null;
  Status?: string;
  Model?: string;
  Tokens?: number;
  CreatedAt: string;
};

export type Paged<T> = {
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

export type UsageLogItem = {
  id: number;
  user_id: number;
  created_at: number;
  type: number;
  content?: string;
  username?: string;
  token_name?: string;
  model_name?: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  is_stream?: boolean;
  channel?: number;
  other?: string;
};

export type UsageLogPage = {
  items: UsageLogItem[];
  total: number;
  page: number;
  page_size: number;
};

export type TaskItem = {
  id: number;
  task_id: string;
  platform?: string;
  user_id: number;
  group?: string;
  channel_id?: number;
  quota: number;
  action?: string;
  status: string;
  fail_reason?: string;
  submit_time: number;
  start_time?: number;
  finish_time?: number;
  progress?: string;
  properties?: Record<string, unknown>;
  data?: unknown;
};

export type TaskPage = {
  items: TaskItem[];
  total: number;
  page: number;
  page_size: number;
};

// /api/data/self 的字段名在文档与实测里不统一，两种写法都兼容。
export type DataSelfPoint = {
  Day?: string;
  ModelName?: string;
  Count?: number;
  Quota?: number;
  TokenUsed?: number;
  day?: string;
  model_name?: string;
  count?: number;
  quota?: number;
  token_used?: number;
  created_at?: number;
};

export type ApiToken = {
  id: number;
  name: string;
  key?: string;
  status: number;
  created_time: number;
  accessed_time: number;
  expired_time: number;
  remain_quota: number;
  unlimited_quota: boolean;
  used_quota: number;
  group?: string;
  model_limits_enabled?: boolean;
  model_limits?: string;
  allow_ips?: string;
  /** 网页端的分组优先级，JSON 字符串数组。 */
  routing_group_order?: string;
  cross_group_retry?: boolean;
  routing_enabled?: boolean;
};

export type ApiTokenPage = {
  items: ApiToken[];
  total: number;
  page: number;
  page_size: number;
};

export type LogStat = {
  quota?: number;
  rpm?: number;
  tpm?: number;
  [key: string]: unknown;
};
