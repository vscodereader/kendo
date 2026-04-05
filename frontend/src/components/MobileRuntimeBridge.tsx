import { useEffect, useRef } from 'react';
import {
  PushNotifications,
  type Token,
  type ActionPerformed,
  type PushNotificationSchema
} from '@capacitor/push-notifications';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import {
  clearPendingNotificationTarget,
  dispatchMainRefresh,
  rememberPendingNotificationTarget,
  registerPushToken
} from '../lib/notifications';
import { isNativeApp } from '../lib/mobile';

type TargetPath = '/main' | '/notice' | '/events' | '/contact' | '/moneypaid' | '/MT' | '/members';

let pushPermissionRequestPromise: Promise<boolean> | null = null;

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

async function ensurePushPermissionGranted() {
  if (pushPermissionRequestPromise) {
    return pushPermissionRequestPromise;
  }

  pushPermissionRequestPromise = (async () => {
    const current = await PushNotifications.checkPermissions();
    const status = current.receive === 'prompt' ? await PushNotifications.requestPermissions() : current;
    return status.receive === 'granted';
  })().catch((error) => {
    pushPermissionRequestPromise = null;
    throw error;
  });

  return pushPermissionRequestPromise;
}

function MobileRuntimeBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticated, user } = useAuth();

  const latestAuthRef = useRef({
    authenticated: false,
    profileCompleted: false
  });
  const latestPathRef = useRef(location.pathname);
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    latestAuthRef.current = {
      authenticated,
      profileCompleted: Boolean(user?.profileCompleted)
    };
  }, [authenticated, user?.profileCompleted]);

  useEffect(() => {
    latestPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let registrationListener: { remove: () => Promise<void> } | null = null;
    let registrationErrorListener: { remove: () => Promise<void> } | null = null;
    let actionListener: { remove: () => Promise<void> } | null = null;
    let receivedListener: { remove: () => Promise<void> } | null = null;

    const openTargetPath = async (targetPath: TargetPath) => {
      const state = latestAuthRef.current;

      if (state.authenticated && state.profileCompleted) {
        await clearPendingNotificationTarget();

        if (targetPath === '/main' && latestPathRef.current === '/main') {
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

    const handleAction = async (event: ActionPerformed) => {
      const targetPath = normalizeTargetPath(event.notification.data?.targetPath);
      await openTargetPath(targetPath);
    };

    const handleForegroundReceive = async (notification: PushNotificationSchema) => {
      const body = String(notification.body ?? '').trim();
      const targetPath = normalizeTargetPath(notification.data?.targetPath);

      if (!body) return;

      const shouldMove = window.confirm(`${body}\n\n확인을 누르면 해당 페이지로 이동합니다.`);
      if (!shouldMove) return;

      await openTargetPath(targetPath);
    };

    const setup = async () => {
      registrationListener = await PushNotifications.addListener('registration', async (token: Token) => {
        registeredTokenRef.current = token.value;

        try {
          await registerPushToken({ pushToken: token.value });
        } catch (error) {
          console.error('[push] 토큰 등록 실패', error);
        }
      });

      registrationErrorListener = await PushNotifications.addListener('registrationError', (error: unknown) => {
        console.error('[push] 등록 오류', error);
      });

      actionListener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (event: ActionPerformed) => {
          void handleAction(event);
        }
      );

      receivedListener = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification: PushNotificationSchema) => {
          void handleForegroundReceive(notification);
        }
      );

      const granted = await ensurePushPermissionGranted();
      if (!granted || cancelled) return;

      await PushNotifications.createChannel({
        id: 'club-updates',
        name: '동아리 알림',
        description: '공지, 일정, 문의, 운영 알림',
        importance: 5,
        visibility: 1,
        sound: 'default'
      }).catch(() => undefined);

      if (cancelled) return;

      await PushNotifications.register();
    };

    void setup().catch((error) => {
      console.error('[push] 초기화 실패', error);
    });

    return () => {
      cancelled = true;
      void registrationListener?.remove();
      void registrationErrorListener?.remove();
      void actionListener?.remove();
      void receivedListener?.remove();
    };
  }, [navigate]);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!authenticated) return;
    if (!registeredTokenRef.current) return;

    void registerPushToken({ pushToken: registeredTokenRef.current }).catch((error) => {
      console.error('[push] 로그인 후 토큰 재연결 실패', error);
    });
  }, [authenticated, user?.id]);

  return null;
}

export default MobileRuntimeBridge;