import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  getCodeExchangeRedirectUri,
  isNativeApp,
  openExternalAuth,
  shouldUseCodeExchangeLogin,
} from '../lib/mobile';

const RAW_API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  'https://kendo-gohi.onrender.com/api';

const API_BASE = RAW_API_BASE.replace(/\/$/, '');

function LoginPage() {
  const navigate = useNavigate();
  const { authenticated } = useAuth();

  useEffect(() => {
    if (authenticated) {
      navigate('/main', { replace: true });
      return;
    }

    const timer = window.setTimeout(() => {
      if (shouldUseCodeExchangeLogin()) {
        const redirectUri = getCodeExchangeRedirectUri();
        const authUrl = `${API_BASE}/auth/google/mobile?redirect_uri=${encodeURIComponent(
          redirectUri
        )}`;

        if (isNativeApp()) {
          void openExternalAuth(authUrl);
          return;
        }

        window.location.href = authUrl;
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