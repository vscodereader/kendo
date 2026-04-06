const selfUrl = new URL(self.location.href);

const FIREBASE_CONFIG = {
  apiKey: selfUrl.searchParams.get('firebaseApiKey') ?? '',
  authDomain: selfUrl.searchParams.get('firebaseAuthDomain') ?? '',
  projectId: selfUrl.searchParams.get('firebaseProjectId') ?? '',
  storageBucket: selfUrl.searchParams.get('firebaseStorageBucket') ?? '',
  messagingSenderId: selfUrl.searchParams.get('firebaseMessagingSenderId') ?? '',
  appId: selfUrl.searchParams.get('firebaseAppId') ?? '',
};

const FIREBASE_SDK_VERSION =
  selfUrl.searchParams.get('firebaseSdkVersion') || '12.11.0';

const APP_SHELL_CACHE = 'kendo-shell-v2';
const STATIC_CACHE = 'kendo-static-v2';

const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

function hasFirebaseConfig() {
  return Object.values(FIREBASE_CONFIG).every((value) => Boolean(value));
}

function normalizeTargetPath(value) {
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

if (hasFirebaseConfig()) {
  importScripts(
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`
  );
  importScripts(
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`
  );

  if (!self.firebase.apps.length) {
    self.firebase.initializeApp(FIREBASE_CONFIG);
  }

  const messaging = self.firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = String(
      payload.data?.title ?? payload.notification?.title ?? '가천대 검도부'
    ).trim();

    const body = String(
      payload.data?.body ?? payload.notification?.body ?? ''
    ).trim();

    const targetPath = normalizeTargetPath(payload.data?.targetPath);

    self.registration.showNotification(title || '가천대 검도부', {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { targetPath },
      tag: `kendo:${targetPath}`,
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = normalizeTargetPath(event.notification.data?.targetPath);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        const clientUrl = new URL(client.url);

        if (clientUrl.origin !== self.location.origin) {
          continue;
        }

        if ('focus' in client) {
          await client.focus();
        }

        if ('navigate' in client) {
          await client.navigate(targetUrl);
        }

        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_SHELL_CACHE, STATIC_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf)$/i.test(url.pathname)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(APP_SHELL_CACHE);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedRequest = await cache.match(request);
    if (cachedRequest) return cachedRequest;

    const cachedIndex = await cache.match('/index.html');
    if (cachedIndex) return cachedIndex;

    const offlinePage = await cache.match('/offline.html');
    return offlinePage || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response && response.ok) {
    cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (!isSameOrigin(url)) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});