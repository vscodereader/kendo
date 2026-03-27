import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

function LoginCallbackPage() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();

  useEffect(() => {
    let alive = true;

    const run = async () => {
      try {
        await refreshMe();
      } catch {
        // 여기서는 메인으로만 돌려보냄
      } finally {
        if (alive) {
          navigate('/main', { replace: true });
        }
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [navigate, refreshMe]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <div className="oauth-loading-spinner" />
        <h1>로딩중입니다</h1>
        <p>로그인 정보를 확인하고 있어요.</p>
      </div>
    </div>
  );
}

export default LoginCallbackPage;