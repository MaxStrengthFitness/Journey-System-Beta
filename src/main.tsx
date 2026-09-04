import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './features/journey-grid/journey-grid.css';
import './features/equipment/equipment.css';
import './features/calendar/calendar.css';
import './features/subjective-report/subjective-report.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

declare global {
  interface Window {
    __appLoaded?: boolean;
    __earlyErrors?: Record<string, unknown>[];
  }
}

// Tell the buffering handlers in index.html to stand down. From here on this
// module is the only thing that reports client errors.
window.__appLoaded = true;

// index.html used to register its own window.onerror and unhandledrejection
// handlers posting to the same endpoint, so every client error was reported
// twice. These listeners are now the only ones.
//
// The cap matters: the Firestore multi-tab assertion bug produced 3,664 errors
// in a single session, and the server is one Node process. Unthrottled, an
// error storm turns into an accidental self-DoS.
const MAX_ERROR_REPORTS = 50;
let errorReportCount = 0;

function reportClientError(payload: Record<string, unknown>) {
  if (errorReportCount >= MAX_ERROR_REPORTS) return;
  errorReportCount += 1;
  const body =
    errorReportCount === MAX_ERROR_REPORTS
      ? { ...payload, note: "report cap reached; further errors go to the console only" }
      : payload;
  fetch('/api/log-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

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
  reportClientError({ message: e.message, type: 'window_error', stack: e.error?.stack });
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

  reportClientError({
    message,
    type: 'unhandled_rejection',
    stack,
    fullReason,
  });
});

// Flush anything that failed before this module ran.
(window.__earlyErrors ?? []).forEach(reportClientError);
window.__earlyErrors = [];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="journey-system-theme">
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
