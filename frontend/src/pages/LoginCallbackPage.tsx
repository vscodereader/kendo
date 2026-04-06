import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { consumePendingNotificationTarget } from '../lib/notifications';

type CallbackPhase = 'idle' | 'running' | 'done' | 'error';

function LoginCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshMe, mobileLoginByCode, user, loading } = useAuth();

  const [phase, setPhase] = useState<CallbackPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [debug, setDebug] = useState<string[]>([]);

  const pushDebug = useCallback((message: string) => {
    setDebug((prev) => [...prev, message]);
    console.log('[login-callback]', message);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const code = params.get('code');

      setPhase('running');
      setErrorMessage(null);

      pushDebug(`pathname=${window.location.pathname}`);
      pushDebug(`search=${window.location.search}`);
      pushDebug(`hasCode=${Boolean(code)}`);

      try {
        if (code) {
          pushDebug('before mobileLoginByCode');
          await mobileLoginByCode(code);
          pushDebug('mobileLoginByCode success');
        } else {
          pushDebug('no code -> refreshMe');
          await refreshMe();
          pushDebug('refreshMe success');
        }

        if (!cancelled) {
          setPhase('done');
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : '로그인 처리 중 오류가 발생했습니다.';

        pushDebug(`callback error=${message}`);

        if (!cancelled) {
          setErrorMessage(message);
          setPhase('error');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [params, refreshMe, mobileLoginByCode, pushDebug]);

  useEffect(() => {
    pushDebug(`phase=${phase}`);
    pushDebug(`loading=${loading}`);
    pushDebug(`user=${user ? 'exists' : 'null'}`);

    if (phase !== 'done') return;
    if (loading) return;

    if (!user) {
      pushDebug('phase done but user is null -> /login');
      navigate('/login', { replace: true });
      return;
    }

    if (user.profileCompleted) {
      void (async () => {
        const pendingTarget = await consumePendingNotificationTarget();
        const nextPath = pendingTarget ?? '/main';
        pushDebug(`navigate -> ${nextPath}`);
        navigate(nextPath, { replace: true });
      })();
      return;
    }

    pushDebug('navigate -> /profile-setup');
    navigate('/profile-setup', { replace: true });
  }, [phase, loading, user, navigate, pushDebug]);

  return (
    <div className="oauth-loading-page">
      <div className="oauth-loading-card">
        <div className="oauth-loading-spinner" />
        <h1>로딩중입니다</h1>
        <p>로그인 정보를 확인하고 있어요.</p>

        {phase === 'error' ? (
          <p style={{ marginTop: 12, color: '#f87171', fontWeight: 600 }}>
            {errorMessage ?? '로그인 처리 중 오류가 발생했습니다.'}
          </p>
        ) : null}

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