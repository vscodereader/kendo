import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';

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
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshMe = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
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

  const logout = useCallback(async () => {
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
      logout
    }),
    [loading, user, refreshMe, logout]
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

export { API_BASE };
