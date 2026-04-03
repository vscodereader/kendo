import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isNativeApp } from '../lib/mobile';
import { consumePendingNotificationTarget } from '../lib/notifications';

function LoginCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshMe, mobileLoginByCode, user, loading } = useAuth();

  useEffect(() => {
    const run = async () => {
      if (isNativeApp()) {
        const code = params.get('code');
        if (!code) {
          navigate('/login', { replace: true });
          return;
        }
        await mobileLoginByCode(code);
        return;
      }

      await refreshMe();
    };

    void run();
  }, [params, refreshMe, mobileLoginByCode, navigate]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (user.profileCompleted) {
      void (async () => {
        const pendingTarget = await consumePendingNotificationTarget();
        navigate(pendingTarget ?? '/main', { replace: true });
      })();
      return;
    }

    navigate('/profile-setup', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <h1>로딩중입니다</h1>
        <p>로그인 정보를 확인하고 있어요.</p>
      </div>
    </div>
  );
}

export default LoginCallbackPage;