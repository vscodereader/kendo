import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'kendo_mobile_token';
const NATIVE_REDIRECT_URI = 'kendoapp://auth/login/callback';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;

  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

  return navigatorStandalone || displayModeStandalone;
}

export function shouldUseCodeExchangeLogin() {
  return isNativeApp() || isStandaloneWebApp();
}

export function getCodeExchangeRedirectUri() {
  if (typeof window === 'undefined') {
    return NATIVE_REDIRECT_URI;
  }

  if (isNativeApp()) {
    return NATIVE_REDIRECT_URI;
  }

  return `${window.location.origin}/login/callback`;
}

export async function openExternalAuth(url: string) {
  await Browser.open({ url });
}

export async function getMobileToken() {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }

  return localStorage.getItem(TOKEN_KEY);
}

export async function setMobileToken(token: string | null) {
  if (isNativeApp()) {
    if (token) {
      await Preferences.set({ key: TOKEN_KEY, value: token });
    } else {
      await Preferences.remove({ key: TOKEN_KEY });
    }
    return;
  }

  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}