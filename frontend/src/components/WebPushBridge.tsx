import { useEffect, useMemo, useState } from 'react';
import { getToken, onMessage, type MessagePayload } from 'firebase/messaging';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth';
import { isNativeApp } from '../lib/mobile';
import {
  clearPendingNotificationTarget,
  dispatchMainRefresh,
  rememberPendingNotificationTarget,
  registerPushToken,
} from '../lib/notifications';
import { useToast } from '../lib/toast';
import {
  ensurePushServiceWorkerRegistration,
  getFirebaseMessagingInstance,
  getFirebaseWebPushVapidKey,
  isAppleMobileDevice,
  isStandaloneWebApp,
  supportsWebPush,
} from '../lib/webPush';

type TargetPath =
  | '/main'
  | '/notice'
  | '/events'
  | '/contact'
  | '/moneypaid'
  | '/MT'
  | '/members';

function normalizeTargetPath(value: unknown): TargetPath {
  const raw = String(value ?? '').trim();

  switch (raw) {
    case '/notice':
    case '/events':
    case '/contact':
    case '/moneypaid':
    case '/MT':
    case '/members':
    case '/main':
      return raw;
    default:
      return '/main';
  }
}

function getPayloadBody(payload: MessagePayload) {
  return String(payload.notification?.body ?? payload.data?.body ?? '').trim();
}

function WebPushBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticated, user } = useAuth();
  const { pushToast } = useToast();

  const [supported, setSupported] = useState(false);
  const [standalone, setStandalone] = useState(isStandaloneWebApp());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === 'undefined' ? 'default' : Notification.permission
  );
  const [enabling, setEnabling] = useState(false);

  const appleMobile = useMemo(() => isAppleMobileDevice(), []);

  useEffect(() => {
    if (isNativeApp()) return;

    let cancelled = false;

    void supportsWebPush().then((value) => {
      if (!cancelled) {
        setSupported(value);
      }
    });

    const refreshStandalone = () => {
      setStandalone(isStandaloneWebApp());
    };

    const refreshPermission = () => {
      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission);
      }
    };

    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', refreshStandalone);

    window.addEventListener('appinstalled', refreshStandalone);
    window.addEventListener('focus', refreshPermission);

    return () => {
      cancelled = true;
      media.removeEventListener('change', refreshStandalone);
      window.removeEventListener('appinstalled', refreshStandalone);
      window.removeEventListener('focus', refreshPermission);
    };
  }, []);

  const openTargetPath = async (targetPath: TargetPath) => {
    if (authenticated && Boolean(user?.profileCompleted)) {
      await clearPendingNotificationTarget();

      if (targetPath === '/main' && location.pathname === '/main') {
        dispatchMainRefresh();
        navigate('/main', { replace: true });
        return;
      }

      navigate(targetPath, { replace: true });
      return;
    }

    await rememberPendingNotificationTarget(targetPath);
    navigate('/login?notification=1', { replace: true });
  };

  const handleForegroundMessage = async (payload: MessagePayload) => {
    const body = getPayloadBody(payload);
    const targetPath = normalizeTargetPath(payload.data?.targetPath);

    if (!body) return;

    const shouldMove = window.confirm(`${body}\n\n확인을 누르면 해당 페이지로 이동합니다.`);
    if (!shouldMove) return;

    await openTargetPath(targetPath);
  };

  useEffect(() => {
    if (isNativeApp()) return;
    if (!supported) return;
    if (permission !== 'granted') return;

    let cancelled = false;
    let unsubscribe = () => {};

    const setup = async () => {
      const registration = await ensurePushServiceWorkerRegistration();
      const messaging = getFirebaseMessagingInstance();

      unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
        void handleForegroundMessage(payload);
      });

      if (!authenticated) return;

      const token = await getToken(messaging, {
        vapidKey: getFirebaseWebPushVapidKey(),
        serviceWorkerRegistration: registration,
      });

      if (!token || cancelled) return;

      await registerPushToken({ pushToken: token });
    };

    void setup().catch((error) => {
      console.error('[web-push] setup failed', error);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    supported,
    permission,
    authenticated,
    user?.id,
    user?.profileCompleted,
    location.pathname,
  ]);

  const handleEnableClick = async () => {
    setEnabling(true);

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== 'granted') {
        pushToast('알림 권한이 허용되지 않았습니다.', 'error');
        return;
      }

      const registration = await ensurePushServiceWorkerRegistration();
      const messaging = getFirebaseMessagingInstance();

      const token = await getToken(messaging, {
        vapidKey: getFirebaseWebPushVapidKey(),
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        throw new Error('웹 푸시 토큰을 발급받지 못했습니다.');
      }

      await registerPushToken({ pushToken: token });
      pushToast('웹앱 알림이 활성화되었습니다.', 'success');
    } catch (error) {
      console.error('[web-push] enable failed', error);
      pushToast(
        error instanceof Error ? error.message : '웹앱 알림 활성화에 실패했습니다.',
        'error'
      );
    } finally {
      setEnabling(false);
    }
  };

  if (isNativeApp() || !supported || !authenticated) {
    return null;
  }

  const showInstallBanner = appleMobile && !standalone && permission !== 'granted';
  const showEnableBanner = (!appleMobile || standalone) && permission === 'default';

  if (!showInstallBanner && !showEnableBanner) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          borderRadius: 18,
          background: 'rgba(17, 24, 39, 0.96)',
          color: '#f9fafb',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.28)',
          padding: 16,
          pointerEvents: 'auto',
        }}
      >
        {showInstallBanner ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              iPhone 알림을 켜려면 먼저 웹앱으로 설치해야 합니다
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#d1d5db' }}>
              Safari에서 이 사이트를 연 뒤
              <br />
              <strong>공유 → 홈 화면에 추가</strong> 를 누르고,
              <br />
              홈 화면 아이콘으로 다시 실행한 다음 알림을 켜세요.
            </div>
          </>
        ) : null}

        {showEnableBanner ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
              웹앱 알림을 켤 수 있습니다
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#d1d5db' }}>
              공지, 일정, 문의, 운영 알림을 웹앱에서도 받을 수 있습니다.
            </div>

            <button
              type="button"
              onClick={() => {
                void handleEnableClick();
              }}
              disabled={enabling}
              style={{
                marginTop: 12,
                border: 0,
                borderRadius: 12,
                padding: '12px 16px',
                background: '#2563eb',
                color: '#ffffff',
                fontWeight: 700,
                cursor: enabling ? 'default' : 'pointer',
                opacity: enabling ? 0.7 : 1,
              }}
            >
              {enabling ? '설정 중...' : '알림 켜기'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default WebPushBridge;