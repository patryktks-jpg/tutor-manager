import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

// Register Service Worker with relative path for GitHub Pages compatibility
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch(err => {
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
