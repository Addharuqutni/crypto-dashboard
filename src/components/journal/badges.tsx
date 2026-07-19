'use client';

import { cn } from '@/lib/shared/utils';
import { formatCurrency } from '@/lib/shared/formatting';
import type { SignalJournalSource, SignalJournalStatus } from '@/types/signal-journal';
import { formatDuration } from './filter-and-sort';
import { useEffect, useState } from 'react';
import { ActionBadge } from '@/components/ui/badges';

export { ActionBadge };

export function SourceBadge({ source }: { source: SignalJournalSource }) {
  const map: Record<SignalJournalSource, { label: string; className: string }> = {
    manual: {
      label: 'Manual',
      className: 'border-border-subtle bg-bg-surface-raised text-text-muted',
    },
    paper: {
      label: 'Paper',
      className: 'border-accent-primary/40 bg-accent-primary/10 text-accent-primary',
    },
  };
  const c = map[source];
  return (
    <span
      className={cn(
        'rounded-sm border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider',
        c.className
      )}
    >
      {c.label}
    </span>
  );
}

export function StatusPill({
  status,
  className: extraClass,
}: {
  status: SignalJournalStatus;
  className?: string;
}) {
  const map: Record<SignalJournalStatus, { label: string; className: string }> = {
    PENDING: {
      label: 'Pending',
      className: 'border-accent-primary/30 bg-accent-primary/10 text-accent-primary',
    },
    TP1: { label: 'TP1', className: 'border-market-up/30 bg-market-up/5 text-market-up' },
    TP2: { label: 'TP2', className: 'border-market-up/40 bg-market-up/10 text-market-up' },
    TP3: { label: 'TP3', className: 'border-market-up/50 bg-market-up/15 text-market-up' },
    SL: { label: 'SL', className: 'border-market-down/40 bg-market-down/10 text-market-down' },
    EXPIRED: {
      label: 'Expired',
      className: 'border-text-muted/30 bg-bg-surface-raised text-text-muted',
    },
    CANCELLED: {
      label: 'Cancelled',
      className: 'border-text-muted/20 bg-bg-surface-raised text-text-muted',
    },
  };
  const c = map[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        c.className,
        extraClass
      )}
    >
      {c.label}
    </span>
  );
}

export function SimpleLevel({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: 'bullish' | 'bearish';
}) {
  return (
    <div className="bg-bg-surface-soft px-3 py-2">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
      <p
        className={cn(
          'numeric mt-0.5 truncate text-xs font-semibold',
          tone === 'bullish' && 'text-market-up',
          tone === 'bearish' && 'text-market-down',
          !tone && 'text-text-primary'
        )}
      >
        {value != null ? formatCurrency(value) : '—'}
      </p>
    </div>
  );
}

export function ExpiryCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = expiresAt - now;
  if (remaining <= 0) {
    return (
      <p className="rounded border border-accent-warm/30 bg-accent-warm/5 px-1.5 py-0.5 text-[9px] text-accent-warm">
        Awaiting expiry tick…
      </p>
    );
  }

  return (
    <p className="text-[9px] text-text-muted">
      Expires in{' '}
      <span className="numeric font-medium text-text-secondary">{formatDuration(remaining)}</span>
    </p>
  );
}
