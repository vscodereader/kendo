import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { consumePendingNotificationTarget } from '../lib/notifications';

function LoginCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshMe, mobileLoginByCode, user, loading } = useAuth();
  const [debug, setDebug] = useState<string[]>([]);

  const pushDebug = (message: string) => {
    setDebug((prev) => [...prev, message]);
    console.log('[login-callback]', message);
  };

  useEffect(() => {
    const run = async () => {
      const code = params.get('code');

      pushDebug(`pathname=${window.location.pathname}`);
      pushDebug(`search=${window.location.search}`);
      pushDebug(`hasCode=${Boolean(code)}`);

      if (code) {
        pushDebug('before mobileLoginByCode');
        try {
          await mobileLoginByCode(code);
          pushDebug('mobileLoginByCode success');
        } catch (error) {
          pushDebug(
            `mobileLoginByCode error=${error instanceof Error ? error.message : String(error)}`
          );
        }
        return;
      }

      pushDebug('no code -> refreshMe');
      try {
        await refreshMe();
        pushDebug('refreshMe success');
      } catch (error) {
        pushDebug(
          `refreshMe error=${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    void run();
  }, [params, refreshMe, mobileLoginByCode]);

  useEffect(() => {
    pushDebug(`loading=${loading}`);
    pushDebug(`user=${user ? 'exists' : 'null'}`);

    if (loading) return;

    if (!user) {
      pushDebug('navigate -> /login');
      navigate('/login', { replace: true });
      return;
    }

    if (user.profileCompleted) {
      void (async () => {
        const pendingTarget = await consumePendingNotificationTarget();
        pushDebug(`navigate -> ${pendingTarget ?? '/main'}`);
        navigate(pendingTarget ?? '/main', { replace: true });
      })();
      return;
    }

    pushDebug('navigate -> /profile-setup');
    navigate('/profile-setup', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <div className="oauth-loading-spinner" />
        <h1>로딩중입니다</h1>
        <p>로그인 정보를 확인하고 있어요.</p>

        <div
          style={{
            marginTop: 16,
            textAlign: 'left',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: '#111827',
            color: '#f9fafb',
            padding: 12,
            borderRadius: 12,
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {debug.length === 0 ? 'debug: waiting...' : debug.join('\n')}
        </div>
      </div>
    </div>
  );
}

export default LoginCallbackPage;