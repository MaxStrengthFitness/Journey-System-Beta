import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  /** On its way out: drawn for TOAST_EXIT_MS more, fading, then gone. */
  leaving?: boolean;
}

/*
 * The toasts come and go with CSS, not the motion library (the speed round,
 * Oct 5 2026, R13): this provider wraps the whole app, so importing motion
 * here put its whole runtime (about 40 KB gzip) on the first screen. The
 * same moves: in, a rise of 20px from 95% with a fade; out, a fade to 90%
 * over 150ms. Under "reduce motion" neither moves (motion-safe), which
 * motion never honoured here.
 */
export const TOAST_EXIT_MS = 150;
const TOAST_IN = "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-5 motion-safe:zoom-in-95 duration-300 ease-out";
const TOAST_OUT = "motion-safe:animate-out motion-safe:fade-out-0 motion-safe:zoom-out-90 duration-150 fill-mode-forwards";

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Out in two steps: marked leaving (it fades), then dropped once the fade
  // is done. A second call (the timer and a tap) only drops it again.
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_EXIT_MS);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (msg: string, dur?: number) => addToast(msg, "success", dur),
    [addToast],
  );
  const error = useCallback(
    (msg: string, dur?: number) => addToast(msg, "error", dur),
    [addToast],
  );
  const warning = useCallback(
    (msg: string, dur?: number) => addToast(msg, "warning", dur),
    [addToast],
  );
  const info = useCallback(
    (msg: string, dur?: number) => addToast(msg, "info", dur),
    [addToast],
  );

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__showToast = (
        message: string,
        type?: ToastType,
        duration?: number,
      ) => {
        addToast(message, type, duration);
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__showToast;
      }
    };
  }, [addToast]);

  /*
   * One value for as long as the handlers are the same, which is always
   * (speed round, Oct 5 2026, R7). It used to be a new object every time a
   * toast came or went, and every one of the ~80 screens and parts that
   * call useToast() — AppContent among them, so the whole app — drew again
   * twice per toast.
   */
  const value = useMemo(
    () => ({ toast: addToast, success, error, warning, info }),
    [addToast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* On a phone (under 640px) the toasts sit inside the screen's edges and above the bottom bar (Journey Lite, Oct 1 2026); 384px from the right edge started off a 390px screen. */}
      <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:bottom-6 sm:right-6 z-9999 flex flex-col gap-3 sm:w-full max-w-sm pointer-events-none">
        {toasts.map((t) => {
            let bgColor = "bg-slate-900 border-slate-800 text-slate-100";
            // The info toast is dark in both themes, so its icon is the
            // frame's blue, which is the same in both (--cyan follows the
            // theme and would be the deep logo blue on it in light).
            let iconColor = "text-chrome-here";
            let IconComponent = Info;

            switch (t.type) {
              case "success":
                bgColor =
                  "bg-emerald-950 border-emerald-800/50 text-emerald-100";
                iconColor = "text-emerald-400";
                IconComponent = CheckCircle2;
                break;
              case "error":
                bgColor = "bg-red-950 border-red-900/50 text-red-100";
                iconColor = "text-red-400";
                IconComponent = AlertCircle;
                break;
              case "warning":
                bgColor = "bg-amber-950 border-amber-900/50 text-amber-100";
                iconColor = "text-amber-400";
                IconComponent = AlertTriangle;
                break;
            }

            return (
              <div
                key={t.id}
                data-leaving={t.leaving ? "true" : undefined}
                className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border shadow-2xl ${bgColor} ${t.leaving ? TOAST_OUT : TOAST_IN}`}
              >
                <IconComponent
                  className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`}
                />
                {/* A whole sentence, said as a sentence (type and depth
                    review, Oct 5 2026; it was 12px bold capitals). */}
                <div className="flex-1 text-[14px] font-semibold leading-snug">
                  {t.message}
                </div>
                {/* 40px to tap, the toast's own words' colour (the grey was
                    about 2.5:1 on the dark toasts). */}
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => removeToast(t.id)}
                  className="-my-2.5 -mr-2.5 h-10 w-10 shrink-0 grid place-items-center rounded-lg text-current opacity-80 hover:opacity-100 transition-opacity hover:bg-white/5"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            );
          })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
