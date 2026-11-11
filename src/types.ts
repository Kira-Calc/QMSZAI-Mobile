export type TabKey = 'overview' | 'chat' | 'models' | 'tokens' | 'account';
export type ModelStatus = 'stable' | 'watch' | 'limited';
export type TokenStatus = 'active' | 'paused' | 'expired';
export type UsageRange = '24h' | '7d' | '30d';

export type Model = {
  id: string;
  name: string;
  vendor: string;
  context: string;
  latency: string;
  price: string;
  status: ModelStatus;
  tags: string[];
  note: string;
  route: string;
  inputRate: string;
  outputRate: string;
  updatedAt: string;
};

export type Token = {
  id: string;
  name: string;
  scope: string;
  usage: number;
  quota: number;
  lastUsed: string;
  status: TokenStatus;
  unlimited?: boolean;
  remainQuota?: number;
  expiredTime?: number;
  group?: string;
};

export type OverviewMetrics = {
  requests: string;
  reliability: string;
  availableModels: string;
  averageLatency: string;
  issueCount: number;
  totalUsage: number;
  totalQuota: number;
  summary: string;
};

export type AccountSummary = {
  workspaceName: string;
  role: string;
  plan: string;
  balance: string;
  endpoint: string;
  mode: string;
};

export type LogStatus = 'success' | 'error' | 'timeout';

export type UsageLog = {
  id: string;
  time: string;
  modelName: string;
  tokenName: string;
  status: LogStatus;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  latencyMs: number;
  requestId: string;
};

export type TaskKind = 'image' | 'video' | 'music' | 'voice' | 'batch';
export type TaskState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type TaskRecord = {
  id: string;
  title: string;
  kind: TaskKind;
  state: TaskState;
  progress: number;
  submittedAt: string;
  elapsed: string;
  cost: number;
  note: string;
};

export type MessageCategory = 'system' | 'billing' | 'security' | 'product';

export type MessageRecord = {
  id: string;
  title: string;
  body: string;
  time: string;
  category: MessageCategory;
  read: boolean;
};

export type MediaKind = 'image' | 'video' | 'music' | 'voice';

export type MediaGeneration = {
  id: string;
  kind: MediaKind;
  prompt: string;
  model: string;
  status: 'running' | 'succeeded' | 'failed';
  createdAt: string;
  summary: string;
  url?: string;
  error?: string;
};

export type MarketModel = {
  id: string;
  name: string;
  vendor: string;
  group: string;
  category: 'chat' | 'image' | 'video' | 'audio' | 'free';
  context: string;
  inputPrice: number;
  outputPrice: number;
  cachePrice?: number;
  tags: string[];
  note: string;
};

export type NewTokenDraft = {
  name: string;
  group: string;
  quota: number;
};
