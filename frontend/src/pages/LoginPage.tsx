import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isNativeApp, openExternalAuth } from '../lib/mobile';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';
const MOBILE_REDIRECT_URI = 'kendoapp://auth/login/callback';

function LoginPage() {
  const navigate = useNavigate();
  const { authenticated } = useAuth();

  useEffect(() => {
    if (authenticated) {
      navigate('/main', { replace: true });
      return;
    }

    const timer = window.setTimeout(() => {
      if (isNativeApp()) {
        void openExternalAuth(
          `${API_BASE}/auth/google/mobile?redirect_uri=${encodeURIComponent(MOBILE_REDIRECT_URI)}`
        );
        return;
      }

      window.location.href = `${API_BASE}/auth/google`;
    }, 120);

    return () => window.clearTimeout(timer);
  }, [authenticated, navigate]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <div className="oauth-loading-spinner" />
        <h1>로딩중입니다</h1>
        <p>구글 로그인 화면으로 이동하고 있어요.</p>
      </div>
    </div>
  );
}

export default LoginPage;