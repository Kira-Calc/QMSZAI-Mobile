import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiError, clearSession, getSession, restoreSession } from '../api/client';
import {
  fetchPublicStatus,
  fetchSelf,
  fetchSiteStatus,
  login as loginRequest,
  loginWith2FA,
  logout as logoutRequest,
} from '../api/endpoints';
import type { PublicStatus, SelfUser, SiteStatus } from '../api/types';
import { t } from '../i18n';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

export type SignInOutcome =
  | { kind: 'signedIn' }
  | { kind: 'need2fa' }
  | { kind: 'needPassword'; username: string };

type AuthContextValue = {
  status: AuthStatus;
  user: SelfUser | null;
  publicStatus: PublicStatus | null;
  siteStatus: SiteStatus | null;
  quotaPerUnit: number;
  displayInCurrency: boolean;
  signIn: (username: string, password: string) => Promise<SignInOutcome>;
  signIn2FA: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  reloadSite: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_QUOTA_PER_UNIT = 500000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<SelfUser | null>(null);
  const [publicStatus, setPublicStatus] = useState<PublicStatus | null>(null);
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const pendingUsername = useRef<string>('');

  const loadSite = useCallback(async () => {
    const [publicResult, siteResult] = await Promise.allSettled([
      fetchPublicStatus(),
      getSession() ? fetchSiteStatus() : Promise.resolve(null),
    ]);
    if (publicResult.status === 'fulfilled') setPublicStatus(publicResult.value);
    if (siteResult.status === 'fulfilled' && siteResult.value) setSiteStatus(siteResult.value);
  }, []);

  const loadUser = useCallback(async () => {
    const self = await fetchSelf();
    setUser(self);
    setStatus('signedIn');
    return self;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await restoreSession();
        // 公共配置先拿，未登录也能判断注册/短信开关。
        const publicResult = await fetchPublicStatus().catch(() => null);
        if (cancelled) return;
        if (publicResult) setPublicStatus(publicResult);

        if (!session) {
          setStatus('signedOut');
          return;
        }
        try {
          const self = await fetchSelf();
          if (cancelled) return;
          setUser(self);
          setStatus('signedIn');
        } catch (error) {
          if (cancelled) return;
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            await clearSession();
          }
          setStatus('signedOut');
          return;
        }
        const siteResult = await fetchSiteStatus().catch(() => null);
        if (!cancelled && siteResult) setSiteStatus(siteResult);
      } catch {
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      await loadUser();
    } catch {
      // 保持现有状态，由调用方决定是否提示
    }
  }, [loadUser]);

  const signIn = useCallback(
    async (username: string, password: string): Promise<SignInOutcome> => {
      const { result } = await loginRequest(username.trim(), password);
      if (result.require_2fa) {
        pendingUsername.current = username.trim();
        return { kind: 'need2fa' };
      }
      if (result.need_set_password) {
        pendingUsername.current = username.trim();
        return { kind: 'needPassword', username: username.trim() };
      }
      await loadUser();
      const siteResult = await fetchSiteStatus().catch(() => null);
      if (siteResult) setSiteStatus(siteResult);
      return { kind: 'signedIn' };
    },
    [loadUser],
  );

  const signIn2FA = useCallback(
    async (code: string) => {
      await loginWith2FA(code.trim());
      await loadUser();
      const siteResult = await fetchSiteStatus().catch(() => null);
      if (siteResult) setSiteStatus(siteResult);
    },
    [loadUser],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      await clearSession();
    }
    setUser(null);
    setSiteStatus(null);
    setStatus('signedOut');
  }, []);

  const quotaPerUnit = Number(siteStatus?.quota_per_unit) || DEFAULT_QUOTA_PER_UNIT;
  const displayInCurrency = siteStatus?.display_in_currency !== false;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      publicStatus,
      siteStatus,
      quotaPerUnit,
      displayInCurrency,
      signIn,
      signIn2FA,
      signOut,
      refreshUser,
      reloadSite: loadSite,
    }),
    [
      status,
      user,
      publicStatus,
      siteStatus,
      quotaPerUnit,
      displayInCurrency,
      signIn,
      signIn2FA,
      signOut,
      refreshUser,
      loadSite,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error(t('useAuth 必须在 AuthProvider 内使用'));
  return value;
}
