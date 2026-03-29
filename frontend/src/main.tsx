import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import './styles.css';

async function bootstrap() {
  await CapacitorApp.addListener('appUrlOpen', (event) => {
    const url = new URL(event.url);

    if (url.protocol === 'com.gachon.kendo:' || url.protocol === 'kendoapp:') {
      const nextPath = `${url.pathname}${url.search}${url.hash}`;
      window.location.href = nextPath;
    }
  });

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
}

void bootstrap();