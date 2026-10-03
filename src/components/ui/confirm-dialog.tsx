'use client';

import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ConfirmDialog — native <dialog> confirmation for destructive actions.
 * Native modal gives focus trap, Escape handling, and top-layer stacking
 * for free. Focus returns to the trigger automatically on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onClick={(e) => {
        // Backdrop click: the dialog element itself is the target only
        // when the click lands outside the inner panel.
        if (e.target === ref.current) onCancel();
      }}
      className="z-overlay m-auto w-[min(92vw,380px)] rounded-2xl border border-border-subtle bg-bg-surface p-0 text-text-primary shadow-[var(--shadow-overlay)] backdrop:bg-black/60 backdrop:backdrop-blur-sm open:animate-spring-in"
      aria-labelledby={titleId}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-text-primary">
              {title}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="bg-danger text-white hover:bg-danger/90"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
