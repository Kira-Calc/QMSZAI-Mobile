import {
  accountSummary,
  initialTokens,
  messageRecords,
  metricsByRange,
  models,
  taskRecords,
  usageLogs,
} from '../data/mockConsole';
import type { DashboardSnapshot, NewTokenDraft, Token } from '../types';

export const mockConsoleAdapter = {
  getInitialSnapshot(): DashboardSnapshot {
    return {
      models,
      tokens: initialTokens,
      metricsByRange,
      account: accountSummary,
      logs: usageLogs,
      tasks: taskRecords,
      messages: messageRecords,
    };
  },

  createToken(draft: NewTokenDraft, sequence: number): Token {
    return {
      id: `local-${sequence}`,
      name: draft.name,
      owner: draft.owner,
      scope: draft.scope,
      usage: 0,
      quota: draft.quota,
      lastUsed: 'Never',
      status: 'active',
    };
  },
};
