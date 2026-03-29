import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Preferences } from '@capacitor/preferences';

const TOKEN_KEY = 'kendo_mobile_token';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
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