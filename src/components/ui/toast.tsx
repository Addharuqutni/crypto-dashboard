'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/**
 * Toast provider — lightweight notification system for user actions.
 * Toasts auto-dismiss after 3 seconds. Max 3 visible at once.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    // Auto-dismiss after 3s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast Container */}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm',
              'animate-in slide-in-from-right-5 fade-in duration-200',
              t.type === 'success' && 'border-success/20 bg-bg-surface-raised text-success',
              t.type === 'error' && 'border-danger/20 bg-bg-surface-raised text-danger',
              t.type === 'warning' && 'border-warning/20 bg-bg-surface-raised text-warning',
              t.type === 'info' && 'border-accent-primary/20 bg-bg-surface-raised text-accent-primary'
            )}
            role="alert"
          >
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {t.type === 'error' && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {t.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0" />}
            <span className="text-sm font-medium text-text-primary">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 shrink-0 rounded p-0.5 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
