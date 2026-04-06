import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

import { isNativeApp } from './mobile';

const FIREBASE_SW_SDK_VERSION = '12.11.0';

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function readFirebaseWebConfig(): FirebaseWebConfig {
  return {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ?? '',
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() ?? '',
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ?? '',
    storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() ?? '',
    messagingSenderId:
      (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() ?? '',
    appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ?? '',
  };
}

function hasFullFirebaseWebConfig(config: FirebaseWebConfig) {
  return Object.values(config).every((value) => Boolean(value));
}

export function getFirebaseWebConfig(): FirebaseWebConfig {
  const config = readFirebaseWebConfig();

  if (!hasFullFirebaseWebConfig(config)) {
    throw new Error('Firebase 웹 푸시 설정값이 부족합니다.');
  }

  return config;
}

export function getFirebaseWebPushVapidKey() {
  const vapidKey =
    (import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim() ?? '';

  if (!vapidKey) {
    throw new Error('VITE_FIREBASE_VAPID_KEY 값이 필요합니다.');
  }

  return vapidKey;
}

export function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;

  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return displayModeStandalone || navigatorStandalone;
}

export function isAppleMobileDevice() {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent;
  const platform = navigator.platform;

  return /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function buildPushServiceWorkerUrl() {
  const config = readFirebaseWebConfig();

  if (!hasFullFirebaseWebConfig(config)) {
    return '/sw.js';
  }

  const params = new URLSearchParams({
    firebaseApiKey: config.apiKey,
    firebaseAuthDomain: config.authDomain,
    firebaseProjectId: config.projectId,
    firebaseStorageBucket: config.storageBucket,
    firebaseMessagingSenderId: config.messagingSenderId,
    firebaseAppId: config.appId,
    firebaseSdkVersion: FIREBASE_SW_SDK_VERSION,
  });

  return `/sw.js?${params.toString()}`;
}

export async function ensurePushServiceWorkerRegistration() {
  const url = buildPushServiceWorkerUrl();
  return navigator.serviceWorker.register(url);
}

export function getFirebaseAppInstance(): FirebaseApp {
  const config = getFirebaseWebConfig();

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(config);
}

export function getFirebaseMessagingInstance(): Messaging {
  return getMessaging(getFirebaseAppInstance());
}

export async function supportsWebPush() {
  if (typeof window === 'undefined' || isNativeApp()) return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('Notification' in window)) return false;
  if (!('PushManager' in window)) return false;

  try {
    return await isSupported();
  } catch {
    return false;
  }
}