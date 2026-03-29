import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { getMobileToken, isNativeApp, setMobileToken } from './mobile';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

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
    credentials: isNativeApp() ? 'omit' : 'include'
  });
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
      const response = await fetch(`${API_BASE}/auth/mobile/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const json = (await response.json().catch(() => ({}))) as {
        token?: string;
        user?: AuthUser | null;
        message?: string;
      };

      if (!response.ok || !json.token || !json.user) {
        throw new Error(json.message ?? '모바일 로그인에 실패했습니다.');
      }

      await setMobileToken(json.token);
      setUser(json.user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (isNativeApp()) {
      await setMobileToken(null);
      setUser(null);
      return;
    }

    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });

    setUser(null);
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      loading,
      authenticated: Boolean(user),
      user,
      refreshMe,
      logout,
      mobileLoginByCode
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