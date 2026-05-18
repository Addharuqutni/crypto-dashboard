'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Total lifetime in ms — drives the progress bar. */
  duration: number;
  /** When the toast was created — used to compute remaining time on hover pause. */
  createdAt: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

const DEFAULT_DURATION_MS = 3000;

/**
 * Hook untuk mengakses fungsi toast() dari mana pun di pohon komponen.
 * Aman dipanggil saat provider belum siap; akan jadi no-op.
 */
export function useToast() {
  return useContext(ToastContext);
}

/**
 * Toast provider — premium notification surface dengan:
 *  - Spring entrance dari kanan-bawah.
 *  - Progress bar auto-dismiss yang sinkron dengan timer (linear 3s).
 *  - Hover/focus mem-pause timer agar pesan bisa dibaca.
 *  - Maksimum 3 toast tampil sekaligus; yang lama tergeser keluar.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Menjadwalkan auto-dismiss untuk satu toast. Disimpan di ref agar bisa
   * dibatalkan saat user hover/fokus dan dijadwalkan ulang saat lepas.
   */
  const scheduleDismiss = useCallback((id: string, duration: number) => {
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, duration);
    timers.current.set(id, t);
  }, []);

  const cancelDismiss = useCallback((id: string) => {
    const existing = timers.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const next: Toast = {
        id,
        message,
        type,
        duration: DEFAULT_DURATION_MS,
        createdAt: Date.now(),
      };
      setToasts((prev) => [...prev.slice(-2), next]);
      scheduleDismiss(id, DEFAULT_DURATION_MS);
    },
    [scheduleDismiss]
  );

  const removeToast = useCallback(
    (id: string) => {
      cancelDismiss(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [cancelDismiss]
  );

  // Membersihkan timer yang masih hidup saat provider unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
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
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={() => removeToast(t.id)}
            onPause={() => cancelDismiss(t.id)}
            onResume={() => {
              const elapsed = Date.now() - t.createdAt;
              const remaining = Math.max(800, t.duration - elapsed);
              scheduleDismiss(t.id, remaining);
            }}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}

/**
 * ToastItem — satu kartu notifikasi.
 *
 * Mengisolasi state per-toast (mis. pause/resume) dari provider sehingga
 * provider tetap fokus pada antrean & timing. Progress bar dibuat dengan
 * keyframe linear yang ikut state `animation-play-state` saat hover/fokus.
 */
function ToastItem({ toast: t, onDismiss, onPause, onResume }: ToastItemProps) {
  const accent = ACCENT_BY_TYPE[t.type];

  return (
    <div
      className={cn(
        'pointer-events-auto group relative flex min-w-[280px] max-w-sm items-center gap-2.5 overflow-hidden rounded-lg border px-4 py-3 shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur-md',
        // Spring entrance + hover lift untuk feel premium.
        'animate-spring-in transition-transform duration-200 hover:-translate-y-0.5',
        accent.surface
      )}
      role="alert"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      {/* Icon */}
      <span className={cn('shrink-0', accent.icon)}>{ICON_BY_TYPE[t.type]}</span>

      {/* Message */}
      <span className="flex-1 text-sm font-medium leading-snug text-text-primary">
        {t.message}
      </span>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onDismiss}
        className="pressable ml-2 shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/*
        Progress bar — di-render sebagai pseudo via inline element supaya
        `animation-play-state` bisa di-pause via group-hover. Linear timing
        memastikan visual progress sinkron dengan timer setTimeout.
      */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left',
          accent.bar,
          'group-hover:[animation-play-state:paused]',
          'group-focus-within:[animation-play-state:paused]'
        )}
        style={{
          animation: `toast-progress ${t.duration}ms linear forwards`,
        }}
      />
    </div>
  );
}

const ICON_BY_TYPE: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4" />,
  error: <AlertTriangle className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const ACCENT_BY_TYPE: Record<ToastType, { surface: string; icon: string; bar: string }> = {
  success: {
    surface: 'border-success/25 bg-bg-surface-raised/95',
    icon: 'text-success',
    bar: 'bg-success/80',
  },
  error: {
    surface: 'border-danger/25 bg-bg-surface-raised/95',
    icon: 'text-danger',
    bar: 'bg-danger/80',
  },
  warning: {
    surface: 'border-warning/25 bg-bg-surface-raised/95',
    icon: 'text-warning',
    bar: 'bg-warning/80',
  },
  info: {
    surface: 'border-accent-primary/25 bg-bg-surface-raised/95',
    icon: 'text-accent-primary',
    bar: 'bg-accent-primary/80',
  },
};
