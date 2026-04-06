import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { isNativeApp } from './lib/mobile';
import './styles.css';

function handleIncomingUrl(urlString?: string | null) {
  if (!urlString) return;

  const url = new URL(urlString);

  if (url.protocol === 'kendoapp:') {
    const code = url.searchParams.get('code');

    if (code) {
      window.location.replace(`/login/callback?code=${encodeURIComponent(code)}`);
      return;
    }

    const nextPath = `${url.pathname}${url.search}${url.hash}`;

    if (nextPath) {
      window.location.replace(nextPath);
    }
  }
}

async function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (isNativeApp()) return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    window.addEventListener('load', () => {
      void registration.update();
    });
  } catch (error) {
    console.error('[pwa] service worker registration failed', error);
  }
}

async function bootstrap() {
  await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    handleIncomingUrl(url);

    try {
      await Browser.close();
    } catch {
      // ignore
    }
  });

  try {
    const launchUrl = await CapacitorApp.getLaunchUrl();
    handleIncomingUrl(launchUrl?.url);
  } catch {
    // ignore
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );

  await registerServiceWorker();
}

void bootstrap();