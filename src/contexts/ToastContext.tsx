import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

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

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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

  return (
    <ToastContext.Provider
      value={{ toast: addToast, success, error, warning, info }}
    >
      {children}
      <div className="fixed bottom-6 right-6 z-9999 flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            let bgColor = "bg-slate-900/90 border-slate-800 text-slate-100";
            let iconColor = "text-cyan";
            let IconComponent = Info;

            switch (t.type) {
              case "success":
                bgColor =
                  "bg-emerald-950/90 border-emerald-800/50 text-emerald-100";
                iconColor = "text-emerald-400";
                IconComponent = CheckCircle2;
                break;
              case "error":
                bgColor = "bg-red-950/90 border-red-900/50 text-red-100";
                iconColor = "text-red-400";
                IconComponent = AlertCircle;
                break;
              case "warning":
                bgColor = "bg-amber-950/90 border-amber-900/50 text-amber-100";
                iconColor = "text-amber-400";
                IconComponent = AlertTriangle;
                break;
            }

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: 0.9,
                  transition: { duration: 0.15 },
                }}
                className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl ${bgColor}`}
              >
                <IconComponent
                  className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`}
                />
                <div className="flex-1 text-xs font-bold uppercase tracking-wider leading-relaxed">
                  {t.message}
                </div>
                <button
                  onClick={() => removeToast(t.id)}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-0.5 rounded-lg hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
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
