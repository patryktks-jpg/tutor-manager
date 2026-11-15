import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

// Register Service Worker with relative URL and auto-update checks
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', window.location.href).href;
    navigator.serviceWorker.register(swUrl).then(registration => {
      // Check for updates whenever window regains focus
      window.addEventListener('focus', () => {
        registration.update().catch(() => {});
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      });
    }).catch(err => {
      console.warn('Service worker registration note:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
