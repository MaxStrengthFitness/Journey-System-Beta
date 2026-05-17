import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';

// Suppress benign ResizeObserver errors
const suppressResizeObserverError = () => {
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('ResizeObserver')) {
      return;
    }
    originalError.call(console, ...args);
  };
};

suppressResizeObserverError();

window.addEventListener('error', (e) => {
  if (typeof e.message === 'string' && e.message.includes('ResizeObserver')) {
    e.stopImmediatePropagation();
    e.preventDefault();
    return;
  }
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: e.message, type: 'window_error', stack: e.error?.stack })
  }).catch(() => {});
});

window.addEventListener('unhandledrejection', (e) => {
  let message = e.reason?.message || '';
  
  // Ignore benign errors from Vite and certain extensions
  const reasonStr = e.reason ? String(e.reason) : '';
  if (
    reasonStr.includes('WebSocket') || 
    reasonStr.includes('vite') ||
    message.includes('WebSocket') ||
    message.includes('standardSelectors')
  ) {
    return;
  }

  if (!message) {
    if (e.reason instanceof Error) {
      message = e.reason.toString();
    } else {
      try {
        message = JSON.stringify(e.reason);
        if (message === '{}') message = String(e.reason);
      } catch(err) {
        message = String(e.reason);
      }
    }
  }
  
  let stack = e.reason?.stack;
  
  // Try to inspect the reason fully
  let fullReason = message;
  try {
    const keys = Object.getOwnPropertyNames(e.reason || {});
    const inspectObj: any = {};
    keys.forEach(k => { inspectObj[k] = (e.reason as any)[k]; });
    fullReason = JSON.stringify(inspectObj);
  } catch(e) {}

  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message, 
      type: 'unhandled_rejection', 
      stack, 
      fullReason 
    })
  }).catch(() => {});
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="journey-system-theme">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
