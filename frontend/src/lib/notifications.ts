import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { apiFetch, API_BASE } from './auth';
import { isNativeApp } from './mobile';

const INSTALLATION_ID_KEY = 'kendo_installation_id';
const PENDING_TARGET_KEY = 'kendo_pending_notification_target';

function normalizePath(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed.startsWith('/')) return null;
  return trimmed;
}

async function getStorageItem(key: string) {
  if (isNativeApp()) {
    const { value } = await Preferences.get({ key });
    return value;
  }

  return localStorage.getItem(key);
}

async function setStorageItem(key: string, value: string | null) {
  if (isNativeApp()) {
    if (value === null) {
      await Preferences.remove({ key });
    } else {
      await Preferences.set({ key, value });
    }
    return;
  }

  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
}

export async function getInstallationId() {
  const existing = await getStorageItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await setStorageItem(INSTALLATION_ID_KEY, created);
  return created;
}

export async function rememberPendingNotificationTarget(path: string) {
  const normalized = normalizePath(path);
  if (!normalized) return;
  await setStorageItem(PENDING_TARGET_KEY, normalized);
}

export async function consumePendingNotificationTarget() {
  const current = normalizePath(await getStorageItem(PENDING_TARGET_KEY));
  if (current) {
    await setStorageItem(PENDING_TARGET_KEY, null);
  }
  return current;
}

export async function clearPendingNotificationTarget() {
  await setStorageItem(PENDING_TARGET_KEY, null);
}

export async function registerPushToken(payload: { pushToken: string; appVersion?: string | null }) {
  const installationId = await getInstallationId();

  const response = await apiFetch(`${API_BASE}/auth/push/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId,
      pushToken: payload.pushToken,
      platform: Capacitor.getPlatform(),
      appVersion: payload.appVersion ?? null
    })
  });

  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(json.message ?? '푸시 토큰 등록에 실패했습니다.');
  }
}

export function dispatchMainRefresh() {
  window.dispatchEvent(new CustomEvent('kendo:refresh-main'));
}
