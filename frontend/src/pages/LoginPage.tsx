import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

function LoginPage() {
  const navigate = useNavigate();
  const { authenticated } = useAuth();

  useEffect(() => {
    if (authenticated) {
      navigate('/main', { replace: true });
      return;
    }

    const timer = window.setTimeout(() => {
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