'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/shared/utils';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { SignalJournalEntry } from '@/types/signal-journal';
import { canonicalLevel } from './filter-and-sort';

export function ManualClosePopover({
  entry,
  onSubmit,
  onCancel,
}: {
  entry: SignalJournalEntry;
  onSubmit: (status: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED', actualExit?: number) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<'TP1' | 'TP2' | 'TP3' | 'SL' | 'EXPIRED'>('TP1');
  const [exit, setExit] = useState<string>('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const exitNum = exit.trim() === '' ? undefined : Number(exit);
  const exitInvalid = exit.trim() !== '' && (!Number.isFinite(exitNum) || (exitNum ?? 0) <= 0);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark outcome manually"
      className="space-y-2 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-primary">
          Mark outcome
        </p>
        <button
          onClick={onCancel}
          className="text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label="Cancel manual close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(['TP1', 'TP2', 'TP3', 'SL', 'EXPIRED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            aria-pressed={status === s}
            className={cn(
              'pressable rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors',
              status === s
                ? 'border-accent-primary/60 bg-accent-primary/15 text-accent-primary'
                : 'border-border-subtle bg-bg-surface-raised text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {status !== 'EXPIRED' && (
        <label className="flex flex-col gap-1 text-[10px] text-text-muted">
          <span className="font-medium uppercase tracking-wider">Actual exit (optional)</span>
          <input
            type="number"
            step="any"
            value={exit}
            onChange={(e) => setExit(e.target.value)}
            placeholder={String(canonicalLevel(entry, status) ?? '')}
            aria-invalid={exitInvalid}
            aria-describedby={exitInvalid ? 'exit-error' : undefined}
            className={cn(
              'h-8 rounded-md border bg-bg-surface-raised px-2 text-xs text-text-primary numeric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              exitInvalid ? 'border-market-down' : 'border-border-subtle'
            )}
          />
          {exitInvalid && (
            <span id="exit-error" className="flex items-center gap-1 text-[10px] text-market-down">
              <AlertTriangle className="h-3 w-3" />
              Enter a positive number or leave blank.
            </span>
          )}
        </label>
      )}
      <div className="flex justify-end gap-1">
        <button
          ref={cancelRef}
          onClick={onCancel}
          className="rounded-md border border-border-subtle bg-bg-surface-raised px-2 py-1 text-[10px] font-medium text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Cancel
        </button>
        <button
          disabled={exitInvalid}
          onClick={() => onSubmit(status, exitNum)}
          className="pressable inline-flex items-center gap-1 rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2 py-1 text-[10px] font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          Confirm
        </button>
      </div>
    </div>
  );
}
