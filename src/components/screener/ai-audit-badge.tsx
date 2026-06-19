'use client';

import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import type { ScreenerAiAuditSummary } from '@/lib/application/screener/types';
import { cn } from '@/lib/shared/utils';

interface AiAuditBadgeProps {
  audit: ScreenerAiAuditSummary;
}

/**
 * Compact AI audit badge shown on top setup cards. Expandable to show
 * full caveats and details. Clearly labelled as "AI Audit" — never as
 * signal source.
 */
export function AiAuditBadge({ audit }: AiAuditBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const VerdictIcon =
    audit.verdict === 'VALID' ? CheckCircle2 :
    audit.verdict === 'WEAK' ? AlertTriangle : Clock;

  const verdictColor =
    audit.verdict === 'VALID' ? 'text-success' :
    audit.verdict === 'WEAK' ? 'text-warning' : 'text-text-muted';

  const verdictBg =
    audit.verdict === 'VALID' ? 'bg-success/8' :
    audit.verdict === 'WEAK' ? 'bg-warning/8' : 'bg-text-muted/8';

  return (
    <div className="mt-3 rounded-lg border border-border-subtle bg-bg-surface-soft">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-surface-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        aria-expanded={expanded}
        aria-label={`AI Audit: ${audit.verdict}`}
      >
        <Bot className="h-3.5 w-3.5 text-accent-secondary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-secondary">
          AI Audit
        </span>
        <span className={cn('ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold', verdictBg, verdictColor)}>
          <VerdictIcon className="h-3 w-3" />
          {audit.verdict.replace('_', ' ')}
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-text-muted" />
        ) : (
          <ChevronDown className="h-3 w-3 text-text-muted" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border-subtle px-3 py-2.5 text-xs animate-fade-in">
          <p className="text-text-primary">{audit.summary}</p>

          <div className="mt-2 space-y-1.5">
            <DetailRow label="Main risk" value={audit.mainRisk} />
            <DetailRow label="Next step" value={audit.nextStep} />
          </div>

          {audit.caveats.length > 0 && (
            <div className="mt-2">
              <span className="text-[10px] font-medium uppercase text-text-muted">Caveats</span>
              <ul className="mt-1 space-y-0.5">
                {audit.caveats.map((caveat, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-text-secondary">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                    {caveat}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 text-[10px] italic text-text-muted">
            AI audit is educational commentary only. It does not determine or override the signal engine.
          </p>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-text-muted">{label}:</span>
      <span className="text-text-secondary">{value}</span>
    </div>
  );
}
