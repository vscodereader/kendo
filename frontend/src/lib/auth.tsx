import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getMobileToken, setMobileToken, shouldUseCodeExchangeLogin } from './mobile';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

export type ApprovalStatus = 'INCOMPLETE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type AuthUser = {
  id: string;
  email: string;
  googleName: string | null;
  googleImage: string | null;
  displayName: string | null;
  studentId: string | null;
  grade: number | null;
  age: number | null;
  trainingType: '기본' | '호구';
  department: string | null;
  profileCompleted: boolean;
  approvalStatus: ApprovalStatus;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  canAccessClubContent: boolean;
  approvalQueueCount: number;
  clubRole: '일반' | '임원' | '부회장' | '회장' | '관리자';
  clubRoleDetail: string | null;
  activeRosterId: string | null;
  memberId: string | null;
  isRoot: boolean;
  systemRole: 'USER' | 'ROOT';
  permissions: {
    canManageRoster: boolean;
    canManageMoney: boolean;
    canLead: boolean;
    canReviewApplicants: boolean;
  };
};

type AuthContextValue = {
  loading: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
  mobileLoginByCode: (code: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function buildHeaders(extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders ?? {});
  const token = await getMobileToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = await buildHeaders(init.headers);

  return fetch(input, {
    ...init,
    headers,
    credentials: shouldUseCodeExchangeLogin() ? 'omit' : 'include',
  });
}

export function isApprovedMember(user: AuthUser | null | undefined) {
  if (!user) return false;
  if (user.isRoot) return true;

  return user.approvalStatus === 'APPROVED' || user.permissions.canReviewApplicants;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshMe = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiFetch(`${API_BASE}/auth/me`);
      const json = (await response.json()) as {
        authenticated: boolean;
        user: AuthUser | null;
      };

      if (json.authenticated && json.user) {
        setUser(json.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const mobileLoginByCode = useCallback(async (code: string) => {
    setLoading(true);

    try {
      console.log('[mobileLoginByCode] start');
      console.log('[mobileLoginByCode] API_BASE =', API_BASE);
      console.log('[mobileLoginByCode] code length =', code.length);

      const url = `${API_BASE}/auth/mobile/exchange`;
      console.log('[mobileLoginByCode] fetch url =', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      console.log('[mobileLoginByCode] response status =', response.status);

      const text = await response.text();
      console.log('[mobileLoginByCode] raw response text =', text);

      let json: { token?: string; user?: AuthUser | null; message?: string } = {};

      try {
        json = JSON.parse(text);
      } catch (parseError) {
        console.log('[mobileLoginByCode] json parse error =', parseError);
      }

      console.log('[mobileLoginByCode] parsed json =', json);

      if (!response.ok || !json.token || !json.user) {
        throw new Error(json.message ?? '로그인에 실패했습니다.');
      }

      await setMobileToken(json.token);
      console.log('[mobileLoginByCode] token saved');

      setUser(json.user);
      console.log('[mobileLoginByCode] user set');
    } catch (error) {
      console.log(
        '[mobileLoginByCode] caught error =',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    } finally {
      setLoading(false);
      console.log('[mobileLoginByCode] end');
    }
  }, []);

  const logout = useCallback(async () => {
    await setMobileToken(null);

    if (!shouldUseCodeExchangeLogin()) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => undefined);
    }

    setUser(null);
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      authenticated: Boolean(user),
      user,
      refreshMe,
      logout,
      mobileLoginByCode,
    }),
    [loading, user, refreshMe, logout, mobileLoginByCode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth는 AuthProvider 내부에서 사용해야 합니다.');
  }

  return value;
}