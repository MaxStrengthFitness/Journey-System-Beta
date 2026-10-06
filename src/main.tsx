import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './features/journey-grid/journey-grid.css';
import './features/equipment/equipment.css';
import './features/calendar/calendar.css';
import './features/subjective-report/subjective-report.css';
import './features/catalog/catalog.tokens.css';
import './features/catalog/catalog.css';
import './features/studio-tasks/studio-tasks.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { APP_BUILD } from './features/new-version/build';
import { noteChunkLoadError } from './features/new-version/chunk-error';
import { versionStore } from './features/new-version/version-store';
import { watchAppHeight } from './features/home-screen/app-height';
import { reportClientError } from './lib/client-error-report';
import { startBootTiming } from './features/boot-timing/boot-timing';

declare global {
  interface Window {
    __appLoaded?: boolean;
    __earlyErrors?: Record<string, unknown>[];
    __appVersion?: string;
  }
}

// Tell the buffering handlers in index.html to stand down. From here on this
// module is the only thing that reports client errors.
window.__appLoaded = true;

// Which build this is (new-version round, Sep 26 2026): a bug report carries
// it (features/feedback/capture.ts), so "it broke" arrives with the version it
// broke in. Declared long ago and never set until now.
window.__appVersion = APP_BUILD;

// A screen's file could not be loaded (new-version round, Sep 26 2026): after
// a deploy the old files are gone. Vite says so here before React hears of it.
// Remember the error, so the screen's boundary knows it for what it is, and
// ask the server at once whether a new version is live. NOT preventDefault():
// the error must still reach React, whose boundary replaces only that screen
// and recovers when it is safe (features/new-version/LoadBoundary.tsx).
window.addEventListener('vite:preloadError', (event) => {
  noteChunkLoadError((event as Event & { payload?: unknown }).payload);
  void versionStore.check({ maxAgeMs: 0 });
});

// index.html used to register its own window.onerror and unhandledrejection
// handlers posting to the same endpoint, so every client error was reported
// twice. These listeners are now the only ones.
// The reporter itself (and its cap) is lib/client-error-report.ts since the
// speed round (Oct 5 2026), so the boot report goes through the same door.

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

// How long this open took, for one small report on a cold open (the speed
// round, Oct 5 2026, R30; features/boot-timing). Before anything else runs.
startBootTiming();

// The Home Screen app's height (Oct 3 2026): the shell takes the smallest
// height iPadOS reports, so the bottom bar never lands under iPadOS's strip.
watchAppHeight();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" storageKey="journey-system-theme">
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
